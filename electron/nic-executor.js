/**
 * NIC Tuning Executor
 *
 * Adapter-aware NIC property read/write via PowerShell Get/Set-NetAdapterAdvancedProperty.
 * ALL operations check whether the adapter actually supports the requested property
 * before attempting to read or write. Non-supported properties are surfaced as
 * { supported: false } rather than errors.
 *
 * Requires admin for Set operations. Read operations do not require elevation.
 *
 * Outcome codes returned by setNicProperty / resetNicProperty:
 *   write_succeeded_verified    — write ok, readback RegistryValue matched
 *   write_succeeded_verify_failed — write ok, readback did not confirm (driver may need restart)
 *   write_failed                — Set-NetAdapterAdvancedProperty threw or returned error
 *   unsupported_on_adapter      — property keyword not present on this adapter
 *   elevation_denied            — UAC prompt cancelled or access denied
 *   reset_verified              — Reset-NetAdapterAdvancedProperty ok
 *   reset_failed                — Reset-NetAdapterAdvancedProperty threw
 */
const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// ── PowerShell helpers ────────────────────────────────────────────────────────
// Diagnostic counter — every powershell.exe spawn from this file increments this.
let _nic_psCount = 0;

function queryPS(command) {
  const id = ++_nic_psCount;
  const t0 = Date.now();
  console.log(`[PS:nic-executor] #${id} queryPS SPAWN ts=${t0}`);
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 20000, windowsHide: true },
      (error, stdout) => {
        console.log(`[PS:nic-executor] #${id} queryPS ${error ? 'FAIL' : 'OK'} ${Date.now() - t0}ms`);
        resolve(error ? null : stdout.trim());
      }
    );
  });
}

async function runElevated(command) {
  const tmpDir     = os.tmpdir();
  const scriptId   = `sc_nic_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const scriptPath = path.join(tmpDir, `${scriptId}.ps1`);
  const resultPath = path.join(tmpDir, `${scriptId}_result.json`);
  const safeResult = resultPath.replace(/'/g, "''");
  const safeScript = scriptPath.replace(/'/g, "''");

  const scriptContent = [
    `$ErrorActionPreference = 'Stop'`,
    `try {`,
    `  ${command}`,
    `  $r = @{ ok = $true; error = $null }`,
    `} catch {`,
    `  $r = @{ ok = $false; error = $_.Exception.Message }`,
    `}`,
    `try { [System.IO.File]::WriteAllText('${safeResult}', ($r | ConvertTo-Json -Compress)) } catch { $r | ConvertTo-Json -Compress | Out-File -FilePath '${safeResult}' -Encoding ascii -Force }`,
  ].join('\r\n');

  fs.writeFileSync(scriptPath, scriptContent, 'utf8');

  const launchCmd = `Start-Process powershell -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File','${safeScript}') -Verb RunAs -Wait`;

  try {
    await new Promise((resolve, reject) => {
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', launchCmd],
        { timeout: 120_000, windowsHide: true },
        (err) => err ? reject(err) : resolve()
      );
    });

    const deadline = Date.now() + 5000;
    while (!fs.existsSync(resultPath)) {
      if (Date.now() > deadline) break;
      await new Promise(r => setTimeout(r, 100));
    }

    if (fs.existsSync(resultPath)) {
      const raw = fs.readFileSync(resultPath, 'utf8').replace(/^\uFEFF/, '').trim();
      try {
        const parsed = JSON.parse(raw);
        return parsed.ok === true ? { ok: true, error: null } : parsed;
      } catch {
        return { ok: false, error: `Could not parse result (raw: ${raw.slice(0, 200)})` };
      }
    }
    return { ok: false, error: 'Result file not found after elevation.' };
  } catch (err) {
    const msg = (err && err.message) || String(err);
    if (/cancel|denied|elevat|access|uac/i.test(msg) || (err && err.code === 1)) {
      return { ok: false, cancelled: true, error: 'Admin permission was canceled. No system changes were made.' };
    }
    return { ok: false, error: `Elevation failed: ${msg}` };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
    try { fs.unlinkSync(resultPath); } catch {}
  }
}

// ── NIC property definitions ──────────────────────────────────────────────────

const NIC_PROPERTY_DEFS = {
  'ReceiveBuffers': {
    displayName:   '*ReceiveBuffers',
    fallbackNames: ['ReceiveBuffers', 'Receive Buffers'],
    label:         'Receive Buffers',
    type:          'numeric',
    defaultValue:  256,
    min:           64,
    max:           4096,
    step:          64,
    recommendedValue: 512,
    description:   'Number of receive buffers the NIC allocates. More buffers handle burst traffic better but use more RAM.',
    risk:          'Moderate',
    requiresAdmin: true,
  },
  'TransmitBuffers': {
    displayName:   '*TransmitBuffers',
    fallbackNames: ['TransmitBuffers', 'Transmit Buffers'],
    label:         'Transmit Buffers',
    type:          'numeric',
    defaultValue:  256,
    min:           64,
    max:           4096,
    step:          64,
    recommendedValue: 512,
    description:   'Number of transmit buffers the NIC allocates. Increasing these reduces transmit drops under heavy load.',
    risk:          'Moderate',
    requiresAdmin: true,
  },
  'RSS': {
    displayName:   '*RSS',
    fallbackNames: ['RSS', 'Receive Side Scaling'],
    label:         'Receive Side Scaling (RSS)',
    type:          'toggle',
    enabledValue:  '1',
    disabledValue: '0',
    description:   'Distributes incoming network processing across multiple CPU cores. Reduces single-core NIC bottlenecks.',
    risk:          'Safe',
    requiresAdmin: true,
  },
  'NumRssQueues': {
    displayName:   '*NumRssQueues',
    fallbackNames: ['NumRssQueues', 'RSS Queues', 'Number of RSS Queues'],
    label:         'RSS Queue Count',
    type:          'stepped',
    presets:       ['1', '2', '4', '8'],
    defaultValue:  '2',
    description:   'Number of RSS queues used to distribute NIC receive processing. Match to physical CPU core count or half of it.',
    risk:          'Moderate',
    requiresAdmin: true,
  },
  'InterruptModeration': {
    displayName:   '*InterruptModeration',
    fallbackNames: ['InterruptModeration', 'Interrupt Moderation'],
    label:         'Interrupt Moderation',
    type:          'toggle',
    enabledValue:  '1',
    disabledValue: '0',
    description:   'Batches interrupts to reduce CPU overhead. Disable for lowest latency gaming. Enable for general use and throughput.',
    risk:          'Moderate',
    requiresAdmin: true,
  },
  'EEE': {
    displayName:   '*EEE',
    fallbackNames: ['EEE', 'Energy Efficient Ethernet', '*EnergyEfficientEthernet'],
    label:         'Energy Efficient Ethernet (EEE)',
    type:          'toggle',
    enabledValue:  '1',
    disabledValue: '0',
    description:   'Allows the NIC to enter low-power idle states between bursts. Can add up to ~10ms wake latency. Disable for low-latency use.',
    risk:          'Safe',
    requiresAdmin: true,
  },
  'FlowControl': {
    displayName:   '*FlowControl',
    fallbackNames: ['FlowControl', 'Flow Control'],
    label:         'Flow Control',
    type:          'stepped',
    presets:       ['0', '1', '2', '3'],
    presetLabels:  ['Disabled', 'Tx Enabled', 'Rx Enabled', 'Tx & Rx Enabled'],
    defaultValue:  '3',
    description:   'Pause frame-based flow control. Disable for gaming to prevent NIC stalls. Enable for server workloads.',
    risk:          'Moderate',
    requiresAdmin: true,
  },
  'GreenEthernet': {
    displayName:   '*GreenEthernet',
    fallbackNames: ['GreenEthernet', 'Green Ethernet'],
    label:         'Green Ethernet',
    type:          'toggle',
    enabledValue:  '1',
    disabledValue: '0',
    description:   'Scales link power based on cable length and utilization. Disable to maintain consistent link power for lower latency.',
    risk:          'Safe',
    requiresAdmin: true,
  },
};

// ── Value normalization ───────────────────────────────────────────────────────
//
// Windows NIC drivers return human-readable DisplayValue text that varies by
// driver vendor, localization, and Windows version. When we write RegistryValue
// '0' the driver may read back 'Disabled'; '1' → 'Enabled'; '3' → 'Rx & Tx Enabled'.
//
// This table maps each RegistryValue string to all known DisplayValue variants.
// Comparison is case-insensitive + trimmed.

const REGISTRY_DISPLAY_ALIASES = {
  '0': ['0', 'disabled', 'no', 'off', 'false', 'none'],
  // '1' covers both simple toggle-enabled AND FlowControl "Tx Enabled" (value 1)
  '1': ['1', 'enabled', 'yes', 'on', 'true', 'tx enabled', 'transmit enabled', 'tx only'],
  // FlowControl stepped values
  '2': ['2', 'rx enabled', 'receive enabled', 'rx only', 'receive only', 'rx'],
  '3': ['3', 'rx & tx enabled', 'tx & rx enabled', 'rx and tx enabled',
              'tx and rx enabled', 'tx & rx enabled', 'both enabled', 'enabled'],
  // Numeric / queue counts — exact match suffices, handled by registryValue path
  '4': ['4'],
  '8': ['8'],
  '16': ['16'],
  '32': ['32'],
  '64': ['64'],
  '128': ['128'],
  '256': ['256'],
  '512': ['512'],
  '1024': ['1024'],
  '2048': ['2048'],
  '4096': ['4096'],
};

/**
 * Normalize a NIC driver DisplayValue string: lowercase + trim.
 * Exported so UI layers can apply the same normalization when comparing
 * human-readable labels.
 */
function normalizeNicDisplayValue(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw).toLowerCase().trim();
}

/**
 * Normalize PowerShell boolean-like output to a tri-state boolean.
 *
 * Returns:
 *   true  — definitively enabled/present
 *   false — definitively disabled/absent
 *   null  — inconclusive (unknown value)
 *
 * Shared between nic-executor and network-tweak-executor to guarantee
 * consistent normalization of PS check output.
 */
function normalizeBooleanLikeValue(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).toLowerCase().trim();
  if (s === 'true'  || s === '1' || s === 'yes' || s === 'enabled')  return true;
  if (s === 'false' || s === '0' || s === 'no'  || s === 'disabled') return false;
  return null;
}

/**
 * Compare a written RegistryValue string against a readback object.
 *
 * Strategy (in priority order):
 *   1. If readback.registryValue is present, compare directly (most reliable).
 *   2. If only readback.displayValue is present, normalize via REGISTRY_DISPLAY_ALIASES.
 *
 * Exported as `compareSemanticNicValue` so external callers can use the same
 * comparison logic without going through the full read/write cycle.
 */
function compareSemanticNicValue(writtenValue, readback) {
  const wv = String(writtenValue).trim();

  // 1. RegistryValue direct comparison — most reliable across all vendors
  if (readback.registryValue !== null && readback.registryValue !== undefined) {
    if (String(readback.registryValue).trim() === wv) return true;
  }

  // 2. DisplayValue normalization fallback
  if (readback.displayValue !== null && readback.displayValue !== undefined) {
    const dv = normalizeNicDisplayValue(readback.displayValue);
    const aliases = REGISTRY_DISPLAY_ALIASES[wv] || [wv.toLowerCase()];
    if (aliases.some(a => dv === a || dv === a.toLowerCase())) return true;
  }

  return false;
}

/**
 * Returns true if the value we wrote matches what was read back.
 * Delegates to compareSemanticNicValue — kept for backward compatibility
 * with existing call sites in setNicProperty().
 */
function verifyNicValue(writtenValue, readback) {
  return compareSemanticNicValue(writtenValue, readback);
}

// ── Adapter property discovery ────────────────────────────────────────────────

/**
 * Discover the actual RegistryKeyword AND DisplayName present on an adapter
 * for a given property def.
 *
 * Returns { registryKeyword: string, displayName: string } if found, or null.
 *
 * Why both?
 *  - RegistryKeyword is used for Set-NetAdapterAdvancedProperty -RegistryKeyword
 *  - DisplayName is used for Reset-NetAdapterAdvancedProperty -DisplayName
 *    The real DisplayName from the driver is NOT always RegistryKeyword minus '*'.
 *    Intel uses "Receive Side Scaling", Realtek uses "RSS". We must use
 *    the actual value the driver registered, not a derived guess.
 */
async function discoverProperty(safeAdapter, def) {
  const allNames     = [def.displayName, ...def.fallbackNames];
  const displayNames = allNames.map(n => n.replace(/^\*/, ''));
  const regFilter    = allNames.map(n => `'${n.replace(/'/g, "''")}'`).join(',');
  const dispFilter   = displayNames.map(n => `'${n.replace(/'/g, "''")}'`).join(',');

  const cmd = [
    `$p = Get-NetAdapterAdvancedProperty -Name '${safeAdapter}' -EA SilentlyContinue`,
    `      | Where-Object { @(${regFilter}) -contains $_.RegistryKeyword -or @(${dispFilter}) -contains $_.DisplayName };`,
    `if ($p) { $x = $p | Select-Object -First 1; $x | Select-Object RegistryKeyword,DisplayName | ConvertTo-Json -Compress }`,
    `else { 'null' }`,
  ].join(' ');

  const raw = await queryPS(cmd);
  if (!raw || raw === 'null') return null;

  try {
    const parsed = JSON.parse(raw);
    const rk = (parsed.RegistryKeyword || '').trim();
    const dn = (parsed.DisplayName || '').trim();
    if (!rk) return null;
    return { registryKeyword: rk, displayName: dn || rk.replace(/^\*/, '') };
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List physical (non-virtual) Ethernet and Wi-Fi adapters.
 */
async function getNetAdapters() {
  const raw = await queryPS(
    `Get-NetAdapter | Where-Object { $_.Virtual -eq $false -and $_.MediaType -ne 'Unsupported' } | Select-Object Name, InterfaceDescription, Status, MediaType, MacAddress | ConvertTo-Json -Compress`
  );

  if (!raw) return { adapters: [], error: 'Could not query network adapters.' };

  try {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return {
      adapters: arr.map(a => ({
        name:        a.Name || '',
        description: a.InterfaceDescription || '',
        status:      a.Status || 'Unknown',
        mediaType:   a.MediaType || '',
        macAddress:  a.MacAddress || '',
      })),
      error: null,
    };
  } catch (e) {
    return { adapters: [], error: `Parse error: ${e.message}` };
  }
}

/**
 * For a given adapter name, check which NIC properties it supports.
 * Returns { capabilities: Record<propertyKey, { supported, currentValue, registryKeyword, displayName }> }
 */
async function getAdapterCapabilities(adapterName) {
  if (!adapterName) return { capabilities: {}, error: 'adapterName required' };

  const safeAdapter = adapterName.replace(/'/g, "''");

  const raw = await queryPS(
    `$props = Get-NetAdapterAdvancedProperty -Name '${safeAdapter}' -EA SilentlyContinue; if ($props) { $props | Select-Object DisplayName, RegistryKeyword, DisplayValue, RegistryValue, ValidRegistryValues | ConvertTo-Json -Compress } else { '[]' }`
  );

  if (!raw) return { capabilities: {}, error: 'Could not query adapter properties.' };

  let props = [];
  try {
    const parsed = JSON.parse(raw);
    props = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } catch (e) {
    return { capabilities: {}, error: `Parse error: ${e.message}` };
  }

  const capabilities = {};

  for (const [key, def] of Object.entries(NIC_PROPERTY_DEFS)) {
    const allNames = [def.displayName, ...def.fallbackNames];
    const match = props.find(p =>
      allNames.some(n => n && p.RegistryKeyword &&
        p.RegistryKeyword.toLowerCase() === n.toLowerCase()
      ) ||
      allNames.some(n => n && p.DisplayName &&
        p.DisplayName.toLowerCase() === n.replace(/^\*/, '').toLowerCase()
      )
    );

    if (match) {
      // ValidRegistryValues may be an array, a single value, or null depending on property type
      let validValues = null;
      if (match.ValidRegistryValues !== undefined && match.ValidRegistryValues !== null) {
        validValues = Array.isArray(match.ValidRegistryValues)
          ? match.ValidRegistryValues.map(String)
          : [String(match.ValidRegistryValues)];
      }
      capabilities[key] = {
        supported:       true,
        // Prefer RegistryValue for currentValue so controls initialise to stable raw values
        currentValue:    match.RegistryValue !== undefined && match.RegistryValue !== null
                           ? String(match.RegistryValue)
                           : (match.DisplayValue ?? null),
        registryKeyword: match.RegistryKeyword,
        displayName:     match.DisplayName,
        validValues,
      };
    } else {
      capabilities[key] = { supported: false, currentValue: null, validValues: null };
    }
  }

  return { capabilities, error: null };
}

/**
 * Read the current value of a single NIC property for a given adapter.
 *
 * Returns:
 *   {
 *     value:           string | null  — RegistryValue if available, else DisplayValue (stable identifier for comparison)
 *     registryValue:   string | null  — raw RegistryValue from the driver
 *     displayValue:    string | null  — human-readable DisplayValue
 *     registryKeyword: string | null  — actual RegistryKeyword on this adapter
 *     displayName:     string | null  — actual DisplayName on this adapter
 *     supported:       boolean
 *     error:           string | null
 *   }
 */
async function readNicProperty(adapterName, propertyKey) {
  const def = NIC_PROPERTY_DEFS[propertyKey];
  if (!def) return { value: null, registryValue: null, displayValue: null, registryKeyword: null, displayName: null, supported: false, error: `Unknown property: ${propertyKey}` };

  const safeAdapter = adapterName.replace(/'/g, "''");
  const allNames    = [def.displayName, ...def.fallbackNames];
  const nameFilter  = allNames.map(n => `'${n.replace(/'/g, "''")}'`).join(',');

  // Return all four fields as JSON so callers can do stable RegistryValue comparison
  const raw = await queryPS(
    `$p = Get-NetAdapterAdvancedProperty -Name '${safeAdapter}' -EA SilentlyContinue | Where-Object { @(${nameFilter}) -contains $_.RegistryKeyword -or @(${nameFilter}) -contains $_.DisplayName }; if ($p) { $x = $p | Select-Object -First 1; $x | Select-Object RegistryValue,DisplayValue,RegistryKeyword,DisplayName | ConvertTo-Json -Compress } else { 'null' }`
  );

  if (!raw || raw === 'null' || raw === '') {
    return { value: null, registryValue: null, displayValue: null, registryKeyword: null, displayName: null, supported: false, error: null };
  }

  try {
    const parsed = JSON.parse(raw);
    // RegistryValue from PS can be an integer — convert to string for consistency
    const rv = parsed.RegistryValue !== undefined && parsed.RegistryValue !== null
      ? String(parsed.RegistryValue)
      : null;
    const dv = parsed.DisplayValue ?? null;
    const rk = parsed.RegistryKeyword ?? null;
    const dn = parsed.DisplayName ?? null;
    return {
      value:           rv ?? dv ?? null,   // RegistryValue preferred; DisplayValue as fallback
      registryValue:   rv,
      displayValue:    dv,
      registryKeyword: rk,
      displayName:     dn,
      supported:       true,
      error:           null,
    };
  } catch (e) {
    return { value: null, registryValue: null, displayValue: null, registryKeyword: null, displayName: null, supported: false, error: `Parse error: ${e.message}` };
  }
}

/**
 * Set a NIC property value. Requires admin (UAC).
 *
 * Returns:
 *   {
 *     ok:          boolean
 *     outcome:     'write_succeeded_verified' | 'write_succeeded_verify_failed' |
 *                  'write_failed' | 'unsupported_on_adapter' | 'elevation_denied'
 *     verified:    boolean
 *     actualValue: string | null  — RegistryValue read back after write
 *     error:       string | null
 *   }
 */
async function setNicProperty(adapterName, propertyKey, value) {
  const def = NIC_PROPERTY_DEFS[propertyKey];
  if (!def) return { ok: false, outcome: 'write_failed', verified: false, actualValue: null, error: `Unknown property: ${propertyKey}` };

  const safeAdapter = adapterName.replace(/'/g, "''");
  const safeValue   = String(value).replace(/'/g, "''");

  // Discover the real RegistryKeyword and DisplayName from the driver
  const prop = await discoverProperty(safeAdapter, def);
  if (!prop) {
    return {
      ok:          false,
      outcome:     'unsupported_on_adapter',
      verified:    false,
      actualValue: null,
      error:       `Property "${def.label}" not found on adapter — your NIC driver may not support it.`,
    };
  }

  const command = `Set-NetAdapterAdvancedProperty -Name '${safeAdapter}' -RegistryKeyword '${prop.registryKeyword.replace(/'/g, "''")}' -RegistryValue '${safeValue}' -EA Stop`;

  const result = await runElevated(command);
  if (!result.ok) {
    const errStr = result.error || '';
    const isUac          = /cancel|denied|elevat|access|uac/i.test(errStr);
    const isInvalidValue = /no matching keyword value/i.test(errStr);
    return {
      ok:          false,
      outcome:     isUac ? 'elevation_denied' : isInvalidValue ? 'invalid_value' : 'write_failed',
      verified:    false,
      actualValue: null,
      error:       errStr,
    };
  }

  // Read back using the full readNicProperty (returns both RegistryValue and DisplayValue)
  const readback = await readNicProperty(adapterName, propertyKey);
  const verified = verifyNicValue(value, readback);

  return {
    ok:          true,
    outcome:     verified ? 'write_succeeded_verified' : 'write_succeeded_verify_failed',
    verified,
    actualValue: readback.registryValue ?? readback.displayValue ?? null,
    error:       verified
      ? null
      : `Value written but readback did not confirm (RegistryValue: ${readback.registryValue}, DisplayValue: ${readback.displayValue}). Driver may require a network adapter restart.`,
  };
}

/**
 * Reset a NIC property to its driver default.
 * Uses Reset-NetAdapterAdvancedProperty with the ACTUAL DisplayName from the adapter,
 * not a derived name from stripping '*' off the RegistryKeyword.
 *
 * Returns:
 *   {
 *     ok:          boolean
 *     outcome:     'reset_verified' | 'reset_failed' | 'unsupported_on_adapter' | 'elevation_denied'
 *     actualValue: string | null
 *     error:       string | null
 *   }
 */
async function resetNicProperty(adapterName, propertyKey) {
  const def = NIC_PROPERTY_DEFS[propertyKey];
  if (!def) return { ok: false, outcome: 'reset_failed', actualValue: null, error: `Unknown property: ${propertyKey}` };

  const safeAdapter = adapterName.replace(/'/g, "''");

  // Discover both RegistryKeyword and actual DisplayName from the driver
  const prop = await discoverProperty(safeAdapter, def);
  if (!prop) {
    return {
      ok:          false,
      outcome:     'unsupported_on_adapter',
      actualValue: null,
      error:       `Property "${def.label}" not found on adapter — your NIC driver may not support it.`,
    };
  }

  // Use the real DisplayName returned by the driver.
  // This is critical: Intel reports "Receive Side Scaling", Realtek reports "RSS".
  // Both have RegistryKeyword '*RSS', but Reset-NetAdapterAdvancedProperty -DisplayName
  // must match what the driver registered. Never derive this by stripping '*'.
  const realDisplayName = prop.displayName;

  const command = `Reset-NetAdapterAdvancedProperty -Name '${safeAdapter}' -DisplayName '${realDisplayName.replace(/'/g, "''")}' -EA Stop`;

  const result = await runElevated(command);
  if (!result.ok) {
    const isUac = /cancel|denied|elevat|access|uac/i.test(result.error || '');
    return {
      ok:          false,
      outcome:     isUac ? 'elevation_denied' : 'reset_failed',
      actualValue: null,
      error:       result.error,
    };
  }

  const readback = await readNicProperty(adapterName, propertyKey);
  return {
    ok:          true,
    outcome:     'reset_verified',
    actualValue: readback.registryValue ?? readback.displayValue ?? null,
    error:       null,
  };
}

/**
 * Return static metadata for all defined NIC properties.
 */
function getNicPropertyMeta() {
  return Object.entries(NIC_PROPERTY_DEFS).reduce((acc, [key, def]) => {
    acc[key] = {
      key,
      label:         def.label,
      type:          def.type,
      description:   def.description,
      risk:          def.risk,
      requiresAdmin: def.requiresAdmin,
      defaultValue:  def.defaultValue ?? null,
      min:           def.min ?? null,
      max:           def.max ?? null,
      step:          def.step ?? null,
      recommendedValue: def.recommendedValue ?? null,
      presets:       def.presets ?? null,
      presetLabels:  def.presetLabels ?? null,
      enabledValue:  def.enabledValue ?? null,
      disabledValue: def.disabledValue ?? null,
    };
    return acc;
  }, {});
}

// ── Ownership-aware wrapper ────────────────────────────────────────────────────

const ownershipStore = require('./ownership-store');

/**
 * Set a NIC property AND maintain the ownership / baseline record.
 *
 * Order:
 *   1. Read current real property value from the adapter (baseline read)
 *   2. Store baseline ONLY if not already captured for this adapter+property pair
 *      (immutable first-capture — repeated toggles never overwrite the original)
 *   3. Set the property (existing setNicProperty)
 *   4. Record appliedByApp=true ONLY after the set reports success
 *
 * previousValue stores { registryValue, displayValue } so the revert pipeline
 * can restore the exact adapter-specific registry value rather than guessing.
 * If the adapter does not support the property, no baseline is captured and
 * ownership is NOT recorded.
 */
async function setNicPropertyWithOwnership(adapterName, propertyKey, value) {
  const scopeKey = ownershipStore.buildScopeKey('nic', propertyKey, adapterName);

  // Step 1+2: capture baseline if first time touching this adapter+property pair
  const existing = ownershipStore.getOwnershipRecord(scopeKey);
  if (!existing || !existing.baselineCaptured) {
    try {
      const current = await readNicProperty(adapterName, propertyKey);
      if (current.supported === false) {
        // Unsupported on this adapter — do not record ownership
        console.log(`[NicExecutor] ${propertyKey} unsupported on "${adapterName}" — skipping ownership`);
      } else {
        ownershipStore.captureBaseline(scopeKey, {
          itemType:        'nic',
          itemId:          propertyKey,
          adapterName,
          registryKeyword: current.registryKeyword || null,
          previousValue: {
            registryValue: current.registryValue  ?? null,
            displayValue:  current.displayValue   ?? null,
          },
        });
      }
    } catch (e) {
      console.warn('[NicExecutor] baseline capture failed for', adapterName, propertyKey, '—', e.message);
    }
  }

  // Step 3: execute
  const result = await setNicProperty(adapterName, propertyKey, value);

  // Step 4: record ownership only after confirmed success
  if (result.ok) {
    const record = ownershipStore.getOwnershipRecord(scopeKey);
    if (record && record.baselineCaptured) {
      ownershipStore.recordApply(scopeKey, {
        appliedValue:      value,
        verificationState: result.verified ? 'verified' : 'unverified',
      });
    }
  }

  return result;
}

module.exports = {
  getNetAdapters,
  getAdapterCapabilities,
  readNicProperty,
  setNicProperty,
  setNicPropertyWithOwnership,
  resetNicProperty,
  getNicPropertyMeta,
  NIC_PROPERTY_DEFS,
  // normalization helpers — exported so callers can use same logic
  normalizeNicDisplayValue,
  normalizeBooleanLikeValue,
  compareSemanticNicValue,
  REGISTRY_DISPLAY_ALIASES,
};
