/**
 * NIC Tuning Executor
 *
 * Adapter-aware NIC property read/write via PowerShell Get/Set-NetAdapterAdvancedProperty.
 * ALL operations check whether the adapter actually supports the requested property
 * before attempting to read or write. Non-supported properties are surfaced as
 * { supported: false } rather than errors.
 *
 * Requires admin for Set operations. Read operations do not require elevation.
 */
const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// ── PowerShell helpers ────────────────────────────────────────────────────────

function queryPS(command) {
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 20000, windowsHide: true },
      (error, stdout) => resolve(error ? null : stdout.trim())
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
      return { ok: false, error: 'UAC prompt was cancelled or access was denied.' };
    }
    return { ok: false, error: `Elevation failed: ${msg}` };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
    try { fs.unlinkSync(resultPath); } catch {}
  }
}

// ── NIC property definitions ──────────────────────────────────────────────────
// These map to Get/Set-NetAdapterAdvancedProperty DisplayName values.
// Not every adapter supports all of these — the capability check gates each one.

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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List physical (non-virtual) Ethernet and Wi-Fi adapters.
 * Returns array of { name, description, status, mediaType, macAddress }
 */
async function getNetAdapters() {
  // Get physical adapters that are not virtual/loopback
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
 * Returns { capabilities: Record<propertyKey, { supported, currentValue }> }
 */
async function getAdapterCapabilities(adapterName) {
  if (!adapterName) return { capabilities: {}, error: 'adapterName required' };

  const safeAdapter = adapterName.replace(/'/g, "''");

  // Fetch all advanced properties for this adapter
  const raw = await queryPS(
    `$props = Get-NetAdapterAdvancedProperty -Name '${safeAdapter}' -EA SilentlyContinue; if ($props) { $props | Select-Object DisplayName, RegistryKeyword, DisplayValue, RegistryValue | ConvertTo-Json -Compress } else { '[]' }`
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
    // Try to find the property by DisplayName or fallback names
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
      capabilities[key] = {
        supported:     true,
        currentValue:  match.DisplayValue ?? match.RegistryValue ?? null,
        registryKeyword: match.RegistryKeyword,
        displayName:   match.DisplayName,
      };
    } else {
      capabilities[key] = { supported: false, currentValue: null };
    }
  }

  return { capabilities, error: null };
}

/**
 * Read the current value of a single NIC property for a given adapter.
 */
async function readNicProperty(adapterName, propertyKey) {
  const def = NIC_PROPERTY_DEFS[propertyKey];
  if (!def) return { value: null, supported: false, error: `Unknown property: ${propertyKey}` };

  const safeAdapter = adapterName.replace(/'/g, "''");
  const allNames    = [def.displayName, ...def.fallbackNames];
  const nameFilter  = allNames.map(n => `'${n.replace(/'/g, "''")}'`).join(',');

  const raw = await queryPS(
    `$p = Get-NetAdapterAdvancedProperty -Name '${safeAdapter}' -EA SilentlyContinue | Where-Object { @(${nameFilter}) -contains $_.RegistryKeyword -or @(${nameFilter}) -contains $_.DisplayName }; if ($p) { ($p | Select-Object -First 1).DisplayValue } else { $null }`
  );

  if (raw === null || raw === '') return { value: null, supported: false, error: null };
  return { value: raw, supported: true, error: null };
}

/**
 * Discover the actual RegistryKeyword present on an adapter for a given property def.
 * Some NICs store '*GreenEthernet' as 'GreenEthernet' (no asterisk) or with different casing.
 * Returns the real keyword string, or null if not found.
 */
async function discoverKeyword(safeAdapter, def) {
  const allNames      = [def.displayName, ...def.fallbackNames];
  const displayNames  = allNames.map(n => n.replace(/^\*/, ''));
  const regFilter     = allNames.map(n => `'${n.replace(/'/g, "''")}'`).join(',');
  const dispFilter    = displayNames.map(n => `'${n.replace(/'/g, "''")}'`).join(',');
  const cmd = `$p = Get-NetAdapterAdvancedProperty -Name '${safeAdapter}' -EA SilentlyContinue | Where-Object { @(${regFilter}) -contains $_.RegistryKeyword -or @(${dispFilter}) -contains $_.DisplayName }; if ($p) { ($p | Select-Object -First 1).RegistryKeyword } else { '' }`;
  const raw = await queryPS(cmd);
  return (raw && raw.trim()) ? raw.trim() : null;
}

/**
 * Set a NIC property value. Requires admin (UAC).
 * Returns { ok, verified, actualValue, error }
 */
async function setNicProperty(adapterName, propertyKey, value) {
  const def = NIC_PROPERTY_DEFS[propertyKey];
  if (!def) return { ok: false, error: `Unknown property: ${propertyKey}` };

  const safeAdapter = adapterName.replace(/'/g, "''");
  const safeValue   = String(value).replace(/'/g, "''");

  // Discover the real RegistryKeyword on this adapter (avoids WMI errors when keyword differs from def)
  const realKeyword = await discoverKeyword(safeAdapter, def);
  if (!realKeyword) {
    return { ok: false, verified: false, actualValue: null, error: `Property "${def.label}" not found on adapter — your NIC driver may not support it.` };
  }

  const command = `Set-NetAdapterAdvancedProperty -Name '${safeAdapter}' -RegistryKeyword '${realKeyword.replace(/'/g, "''")}' -RegistryValue '${safeValue}' -EA Stop`;

  const result = await runElevated(command);
  if (!result.ok) return { ok: false, verified: false, actualValue: null, error: result.error };

  // Verify
  const readback = await readNicProperty(adapterName, propertyKey);
  const matches  = readback.value !== null && String(readback.value) === String(value);
  return {
    ok:          result.ok,
    verified:    matches,
    actualValue: readback.value,
    error:       matches ? null : `Value did not persist (read back: ${readback.value})`,
  };
}

/**
 * Reset a NIC property to its default.
 * Uses Reset-NetAdapterAdvancedProperty which restores the driver default.
 */
async function resetNicProperty(adapterName, propertyKey) {
  const def = NIC_PROPERTY_DEFS[propertyKey];
  if (!def) return { ok: false, error: `Unknown property: ${propertyKey}` };

  const safeAdapter = adapterName.replace(/'/g, "''");

  // Discover the real RegistryKeyword on this adapter
  const realKeyword = await discoverKeyword(safeAdapter, def);
  if (!realKeyword) {
    return { ok: false, error: `Property "${def.label}" not found on adapter — your NIC driver may not support it.` };
  }
  const displayName = realKeyword.replace(/^\*/, '');

  const command = `Reset-NetAdapterAdvancedProperty -Name '${safeAdapter}' -DisplayName '${displayName.replace(/'/g, "''")}' -EA Stop`;

  const result = await runElevated(command);
  if (!result.ok) return { ok: false, error: result.error };

  const readback = await readNicProperty(adapterName, propertyKey);
  return { ok: true, error: null, actualValue: readback.value };
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

module.exports = {
  getNetAdapters,
  getAdapterCapabilities,
  readNicProperty,
  setNicProperty,
  resetNicProperty,
  getNicPropertyMeta,
  NIC_PROPERTY_DEFS,
};
