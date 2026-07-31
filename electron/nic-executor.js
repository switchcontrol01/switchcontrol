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
// ── Shared PowerShell primitives ──────────────────────────────────────────────
// runElevated uses the VBScript/ShellExecute wrapper (SW_HIDE via nShowCmd=0)
// which reliably suppresses the console window through the UAC elevation path,
// unlike Start-Process -WindowStyle Hidden -Verb RunAs which Windows silently ignores.
// Concurrency is gated by the shared cap in ps-shared.js → powershell-limiter.js,
// replacing the previous independent _withNicPsSemaphore that was invisible to the
// global cap and incompatible with the shared ceiling.
const { queryPS: _psQueryPS, runElevated } = require('./ps-shared');

// NIC-specific queryPS: 20s timeout (adapter capability scans can be slow on
// systems with many physical adapters or sluggish driver stacks).
const queryPS = (command) => _psQueryPS(command, {
  timeout: 20000,
  meta: { file: 'nic-executor.js', fn: 'queryPS', reason: 'nic-read' },
});

// ── Ring-buffer fallback (Set/Get-NetAdapterRingBuffer) ───────────────────────
// Some NICs (Realtek, AMD) do not expose *ReceiveBuffers / *TransmitBuffers
// through Get-NetAdapterAdvancedProperty. Windows has a dedicated cmdlet that
// works on these adapters. We fall back to it automatically.
//
// CRITICAL: Set-NetAdapterRingBuffer does NOT exist on many systems (Realtek
// laptops, older OEM NIC drivers, WiFi adapters). We check cmdlet availability
// ONCE per session and cache the result so we never fire a UAC prompt or produce
// raw PowerShell errors on unsupported hardware.

const RING_BUFFER_PROPS = new Set(['ReceiveBuffers', 'TransmitBuffers']);

// Tri-state: null = not checked yet, true/false = cached result
let _ringBufferCmdletAvailable = null;

// ── Capability cache ───────────────────────────────────────────────────────────
// Key: adapter name (stable per physical NIC for the lifetime of a session).
// TTL: session lifetime — invalidated by manual refresh or app restart.
// Prevents repeated Get-NetAdapterAdvancedProperty calls when switching/toggling adapters.
// On systems with 3+ adapters the PS query can take 800ms+; this makes it instant after
// the first open.
const _capabilityCache = new Map();

/**
 * Invalidate the capability cache for a specific adapter or for all adapters.
 * Called on:
 *   - manual "Refresh" by the user
 *   - adapter enable/disable (detected externally)
 *   - app startup (cache starts empty — implicit invalidation)
 *
 * @param {string|null} adapterName  null to flush all entries
 */
function invalidateCapabilityCache(adapterName) {
  if (adapterName) {
    const deleted = _capabilityCache.delete(adapterName);
    if (deleted) console.log(`[NIC:Tuning] capabilityCache=invalidated adapter="${adapterName}"`);
  } else {
    const count = _capabilityCache.size;
    _capabilityCache.clear();
    if (count > 0) console.log(`[NIC:Tuning] capabilityCache=flushed count=${count}`);
  }
}

async function checkRingBufferCmdlet() {
  if (_ringBufferCmdletAvailable !== null) return _ringBufferCmdletAvailable;
  const raw = await queryPS(
    `if (Get-Command Set-NetAdapterRingBuffer -ErrorAction SilentlyContinue) { 'true' } else { 'false' }`
  );
  _ringBufferCmdletAvailable = (raw === 'true');
  console.log(`[NIC:Tuning] ringBufferCmdlet=${_ringBufferCmdletAvailable}`);
  return _ringBufferCmdletAvailable;
}

/**
 * Reset the ring-buffer cmdlet availability cache so the next call to
 * checkRingBufferCmdlet() re-probes the system.
 *
 * Call after a NIC driver update or reinstall (e.g. triggered by a
 * vendor-updater tweak) — without this, a newly-installed driver that adds
 * Set-NetAdapterRingBuffer support would remain invisible for the session.
 */
function invalidateRingBufferCache() {
  if (_ringBufferCmdletAvailable !== null) {
    console.log('[NIC:Tuning] ringBufferCache=invalidated');
    _ringBufferCmdletAvailable = null;
  }
}

// ── Error → structured outcome mapping ────────────────────────────────────────

function mapNicErrorToOutcome(errStr) {
  if (!errStr) return 'write_failed';
  // UAC / elevation — check before driver_locked so "access denied from UAC" stays as elevation_denied
  if (/cancel|elevat|uac/i.test(errStr))                                  return 'elevation_denied';
  // Cmdlet not found — NIC driver doesn't expose the ring-buffer interface
  if (/not recognized|is not.*cmdlet|command.*not found|cannot.*find.*command/i.test(errStr)) return 'unsupported_driver';
  // Driver locked — driver exposes the property but rejects modification.
  // Distinct from elevation_denied (UAC) and unsupported_driver (cmdlet absent).
  // Typical HRESULT codes:
  //   0x80070490 = element not found      0x80070057 = invalid parameter
  //   0x80070032 = request not supported  0x80004005 = unspecified E_FAIL
  if (/element not found|parameter.*incorrect|request.*not supported|0x80070490|0x80070057|0x80070032|0x80004005|read.?only|object reference/i.test(errStr)) return 'driver_locked';
  // Plain access denied (not UAC) — driver or registry ACL blocked the write
  if (/access.*denied|denied/i.test(errStr))                              return 'access_denied';
  if (/busy|conflict|in use/i.test(errStr))                               return 'adapter_busy';
  if (/restart|reboot/i.test(errStr))                                     return 'reboot_required';
  if (/reject|refused|driver.*fail/i.test(errStr))                        return 'driver_rejected';
  return 'write_failed';
}

async function _rbRead(safeAdapter, propertyKey) {
  const cmdletAvail = await checkRingBufferCmdlet();
  if (!cmdletAvail) return null; // cmdlet absent — treat as not supported

  const field    = propertyKey === 'ReceiveBuffers' ? 'RxCurrentBufferCount' : 'TxCurrentBufferCount';
  const maxField = propertyKey === 'ReceiveBuffers' ? 'RxMaxBufferCount'     : 'TxMaxBufferCount';
  const raw = await queryPS(
    `$rb = Get-NetAdapterRingBuffer -Name '${safeAdapter}' -EA SilentlyContinue; ` +
    `if ($rb) { [PSCustomObject]@{ current=$rb.${field}; max=$rb.${maxField} } | ConvertTo-Json -Compress } else { 'null' }`
  );
  if (!raw || raw === 'null') return null;
  try {
    const p = JSON.parse(raw);
    return { current: p.current ?? null, max: p.max ?? null };
  } catch { return null; }
}

async function _rbSet(safeAdapter, propertyKey, value) {
  // Pre-flight: never call Set-NetAdapterRingBuffer if the cmdlet doesn't exist.
  // Without this check the system shows a UAC prompt then fails with a raw PS error.
  const cmdletAvail = await checkRingBufferCmdlet();
  if (!cmdletAvail) {
    console.log(`[NIC:Tuning] ringBufferCmdlet=false → unsupported_driver for ${propertyKey}`);
    return {
      ok:      false,
      outcome: 'unsupported_driver',
      error:   'Set-NetAdapterRingBuffer is not available on this system. Your NIC driver does not expose ring buffer controls.',
    };
  }

  const param = propertyKey === 'ReceiveBuffers' ? 'RxBufferSize' : 'TxBufferSize';
  const num   = parseInt(value, 10);
  if (isNaN(num)) return { ok: false, outcome: 'write_failed', error: 'Value must be a number' };

  const result = await runElevated(`Set-NetAdapterRingBuffer -Name '${safeAdapter}' -${param} ${num} -EA Stop`, {
    tempFilePrefix: 'sc_nic_',
    meta: { file: 'nic-executor.js', fn: '_rbSet', reason: 'nic-ringbuf-set' },
  });
  if (!result.ok) {
    const outcome = mapNicErrorToOutcome(result.error || '');
    return { ok: false, outcome, error: result.error };
  }
  return result;
}

// ── NIC property definitions ──────────────────────────────────────────────────

const NIC_PROPERTY_DEFS = {
  'ReceiveBuffers': {
    displayName:   '*ReceiveBuffers',
    fallbackNames: ['ReceiveBuffers', 'Receive Buffers', 'RX Buffers', 'Rx Buffers',
                    'Receive Buffer Size', 'ReceiveBufferSize', '*ReceiveBuffers',
                    'NumRxDesc', 'Rx Ring Size'],
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
    fallbackNames: ['TransmitBuffers', 'Transmit Buffers', 'TX Buffers', 'Tx Buffers',
                    'Transmit Buffer Size', 'TransmitBufferSize', '*TransmitBuffers',
                    'NumTxDesc', 'Tx Ring Size'],
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
  // '1' covers both simple toggle-enabled AND FlowControl "Tx Enabled" (value 1).
  // NOTE: bare 'enabled' lives ONLY here. It must not appear in '3' — a driver
  // that returns the generic string "Enabled" almost certainly means toggle-on
  // (value 1), not "Tx & Rx Enabled" (value 3). Having it in both alias lists
  // would cause compareSemanticNicValue to give a false-positive 'write_succeeded_verified'
  // when verifying a write of '3' on a driver that just says "Enabled".
  '1': ['1', 'enabled', 'yes', 'on', 'true', 'tx enabled', 'transmit enabled', 'tx only'],
  // FlowControl stepped values
  '2': ['2', 'rx enabled', 'receive enabled', 'rx only', 'receive only', 'rx'],
  // '3' = Tx & Rx Enabled. Bare 'enabled' removed (see note on '1' above).
  // Duplicate 'tx & rx enabled' entry also removed (was listed twice — harmless
  // but wasteful; de-duplicated here).
  '3': ['3', 'rx & tx enabled', 'tx & rx enabled', 'rx and tx enabled',
              'tx and rx enabled', 'both enabled'],
  // Numeric queue/buffer counts — single-element arrays removed.
  // compareSemanticNicValue's strategy-1 path (direct registryValue string
  // comparison) always fires before the alias table is consulted, so these
  // entries were never reached in practice and added no value.
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

  // ── Cache check (session-lifetime TTL) ────────────────────────────────────
  if (_capabilityCache.has(adapterName)) {
    console.log(`[NIC:Tuning] capabilityCache=hit adapter="${adapterName}"`);
    return _capabilityCache.get(adapterName);
  }
  console.log(`[NIC:Tuning] capabilityCache=miss adapter="${adapterName}" — querying capabilities`);

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
      let validValues = null;
      if (match.ValidRegistryValues !== undefined && match.ValidRegistryValues !== null) {
        validValues = Array.isArray(match.ValidRegistryValues)
          ? match.ValidRegistryValues.map(String)
          : [String(match.ValidRegistryValues)];
      }
      capabilities[key] = {
        supported:       true,
        currentValue:    match.RegistryValue !== undefined && match.RegistryValue !== null
                           ? String(match.RegistryValue)
                           : (match.DisplayValue ?? null),
        registryKeyword: match.RegistryKeyword,
        displayName:     match.DisplayName,
        validValues,
      };
    } else if (RING_BUFFER_PROPS.has(key)) {
      // Fallback: some NICs (Realtek, AMD) expose ring buffers via Get-NetAdapterRingBuffer
      // _rbRead will return null if cmdlet is unavailable — no PS errors generated
      const rb = await _rbRead(safeAdapter, key);
      if (rb && rb.current !== null) {
        capabilities[key] = {
          supported:       true,
          currentValue:    String(rb.current),
          registryKeyword: null,
          displayName:     null,
          validValues:     null,
          viaRingBuffer:   true,
        };
      } else {
        capabilities[key] = { supported: false, currentValue: null, validValues: null };
      }
    } else {
      capabilities[key] = { supported: false, currentValue: null, validValues: null };
    }
  }

  // ── Structured capability log ─────────────────────────────────────────────
  const rxCap = capabilities['ReceiveBuffers'];
  const txCap = capabilities['TransmitBuffers'];
  console.log(
    `[NIC:Tuning] adapter="${adapterName}" ` +
    `rxSupported=${rxCap?.supported ?? false} ` +
    `txSupported=${txCap?.supported ?? false} ` +
    `rss=${capabilities['RSS']?.supported ?? false} ` +
    `eee=${capabilities['EEE']?.supported ?? false} ` +
    `interruptMod=${capabilities['InterruptModeration']?.supported ?? false}`
  );

  // ── Store in cache (session-lifetime) ─────────────────────────────────────
  const result = { capabilities, error: null };
  _capabilityCache.set(adapterName, result);
  return result;
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
    // Fallback: try Get-NetAdapterRingBuffer for ReceiveBuffers / TransmitBuffers
    if (RING_BUFFER_PROPS.has(propertyKey)) {
      const rb = await _rbRead(safeAdapter, propertyKey);
      if (rb && rb.current !== null) {
        return {
          value:           String(rb.current),
          registryValue:   String(rb.current),
          displayValue:    String(rb.current),
          registryKeyword: null,
          displayName:     null,
          supported:       true,
          viaRingBuffer:   true,
          error:           null,
        };
      }
    }
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

  console.log(`[NIC:Tuning] adapter="${adapterName}" property=${propertyKey} value=${value}`);

  // Use cached registryKeyword/displayName if getAdapterCapabilities already ran
  // for this adapter — skips an entire Get-NetAdapterAdvancedProperty PS round-trip
  // (~100-300ms) on every single apply. Falls back to discoverProperty() on cache miss.
  const _cachedCap = _capabilityCache.get(adapterName)?.capabilities?.[propertyKey];
  const prop = (_cachedCap?.registryKeyword)
    ? { registryKeyword: _cachedCap.registryKeyword, displayName: _cachedCap.displayName || _cachedCap.registryKeyword.replace(/^\*/, '') }
    : await discoverProperty(safeAdapter, def);
  if (!prop) {
    // Fallback: use Set-NetAdapterRingBuffer for buffer properties on NICs that
    // don't expose them through Get-NetAdapterAdvancedProperty (Realtek, AMD, etc.)
    // _rbSet checks cmdlet availability FIRST — will never produce raw PS errors.
    if (RING_BUFFER_PROPS.has(propertyKey)) {
      console.log(`[NIC:Tuning] fallback=ring-buffer property=${propertyKey}`);
      const rbResult = await _rbSet(safeAdapter, propertyKey, value);
      if (!rbResult.ok) {
        // Propagate the structured outcome from _rbSet (may be 'unsupported_driver',
        // 'elevation_denied', etc.) — never fall through to a raw error string.
        const outcome = rbResult.outcome || mapNicErrorToOutcome(rbResult.error || '');
        console.log(`[NIC:Tuning] apply=failed outcome=${outcome}`);
        return {
          ok:          false,
          outcome,
          verified:    false,
          actualValue: null,
          error:       rbResult.error,
        };
      }
      // Verify readback
      const rb = await _rbRead(safeAdapter, propertyKey);
      const readbackVal = rb ? String(rb.current) : null;
      const verified = readbackVal !== null && String(parseInt(value, 10)) === readbackVal;
      const outcome = verified ? 'write_succeeded_verified' : 'write_succeeded_verify_failed';
      console.log(`[NIC:Tuning] apply=${verified ? 'success' : 'unverified'} outcome=${outcome} fallback=ring-buffer`);
      return {
        ok:          true,
        outcome,
        verified,
        actualValue: readbackVal,
        error:       verified ? null : 'Value written but readback did not confirm.',
      };
    }
    console.log(`[NIC:Tuning] apply=failed outcome=unsupported_on_adapter property=${propertyKey}`);
    return {
      ok:          false,
      outcome:     'unsupported_on_adapter',
      verified:    false,
      actualValue: null,
      error:       `Property "${def.label}" not found on adapter — your NIC driver may not support it.`,
    };
  }

  console.log(`[NIC:Tuning] fallback=advanced-property registryKeyword=${prop.registryKeyword}`);

  const command = `Set-NetAdapterAdvancedProperty -Name '${safeAdapter}' -RegistryKeyword '${prop.registryKeyword.replace(/'/g, "''")}' -RegistryValue '${safeValue}' -EA Stop`;

  const result = await runElevated(command, {
    tempFilePrefix: 'sc_nic_',
    meta: { file: 'nic-executor.js', fn: 'setNicProperty', reason: 'nic-set' },
  });
  if (!result.ok) {
    const errStr = result.error || '';
    const isInvalidValue = /no matching keyword value/i.test(errStr);
    const outcome = isInvalidValue ? 'invalid_value' : mapNicErrorToOutcome(errStr);
    console.log(`[NIC:Tuning] apply=failed outcome=${outcome}`);
    return {
      ok:          false,
      outcome,
      verified:    false,
      actualValue: null,
      error:       errStr,
    };
  }

  // Read back using the full readNicProperty (returns both RegistryValue and DisplayValue)
  const readback = await readNicProperty(adapterName, propertyKey);
  const verified = verifyNicValue(value, readback);
  const outcome = verified ? 'write_succeeded_verified' : 'write_succeeded_verify_failed';
  console.log(`[NIC:Tuning] apply=${verified ? 'success' : 'unverified'} outcome=${outcome}`);

  return {
    ok:          true,
    outcome,
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

  // Use cached registryKeyword/displayName if available — same optimisation as
  // setNicProperty: skips an extra Get-NetAdapterAdvancedProperty PS spawn.
  const _cachedCapR = _capabilityCache.get(adapterName)?.capabilities?.[propertyKey];
  const prop = (_cachedCapR?.registryKeyword)
    ? { registryKeyword: _cachedCapR.registryKeyword, displayName: _cachedCapR.displayName || _cachedCapR.registryKeyword.replace(/^\*/, '') }
    : await discoverProperty(safeAdapter, def);
  if (!prop) {
    // Fallback: reset buffer properties via Set-NetAdapterRingBuffer using def.defaultValue
    if (RING_BUFFER_PROPS.has(propertyKey)) {
      const defaultVal = def.defaultValue ?? 256;
      const rbResult = await _rbSet(safeAdapter, propertyKey, defaultVal);
      if (!rbResult.ok) {
        const isUac = /cancel|denied|elevat|access|uac/i.test(rbResult.error || '');
        return {
          ok:          false,
          outcome:     isUac ? 'elevation_denied' : 'reset_failed',
          actualValue: null,
          error:       rbResult.error,
        };
      }
      const rb = await _rbRead(safeAdapter, propertyKey);
      const actualValue = rb ? String(rb.current) : null;
      const verified = actualValue !== null && actualValue === String(defaultVal);
      // Invalidate capability cache so the UI reflects the restored default value —
      // same as the Reset-NetAdapterAdvancedProperty path below (line ~951).
      // Previously missing here: the ring-buffer reset path returned without
      // invalidating, leaving the stale applied value in the capability cache.
      invalidateCapabilityCache(adapterName);
      return {
        ok:          verified,
        outcome:     verified ? 'reset_verified' : 'reset_verify_failed',
        actualValue: actualValue ?? String(defaultVal),
        error:       verified ? null : `Reset command ran but readback still shows ${actualValue}. Driver may require a network adapter restart.`,
      };
    }
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

  const result = await runElevated(command, {
    tempFilePrefix: 'sc_nic_',
    meta: { file: 'nic-executor.js', fn: 'resetNicProperty', reason: 'nic-reset' },
  });
  if (!result.ok) {
    const isUac = /cancel|denied|elevat|access|uac/i.test(result.error || '');
    return {
      ok:          false,
      outcome:     isUac ? 'elevation_denied' : 'reset_failed',
      actualValue: null,
      error:       result.error,
    };
  }

  // FIX: previously this returned outcome:'reset_verified' unconditionally as
  // soon as the elevated Reset-NetAdapterAdvancedProperty command exited without
  // error — it never actually checked whether the property's value changed.
  // Some drivers accept the reset call but silently no-op (unsupported reset,
  // stale driver cache, etc.), leaving the SwitchControl-applied value in place.
  // That produced the "premium revert shows success but tweak is still applied"
  // bug for NIC-backed Extreme Labs tweaks (RSS, Interrupt Moderation, EEE,
  // Flow Control). Now we read back the value and confirm it no longer matches
  // the toggle's "enabled" (applied) value before reporting success.
  const readback = await readNicProperty(adapterName, propertyKey);
  const actualValue = readback.registryValue ?? readback.displayValue ?? null;

  // Fail-safe default: unknown → unverified rather than silently claiming success.
  // Previously this was `let verified = true`, meaning any future property with
  // type !== 'toggle' and no defaultValue (or an unreadable adapter) would report
  // 'reset_verified' without ever performing an actual readback check.
  let verified;
  if (def.type === 'toggle' && def.enabledValue !== undefined) {
    // "reset" means the property should no longer be at the toggle's enabled value.
    // If the adapter is unreadable after reset (!readback.supported), treat as ok
    // because the reset command exited cleanly and we can't do better.
    verified = !readback.supported || actualValue !== String(def.enabledValue);
  } else if (def.defaultValue !== undefined && readback.supported) {
    verified = String(actualValue) === String(def.defaultValue);
  } else if (!readback.supported) {
    // Property not readable post-reset — cannot confirm. Report unverified
    // so the caller can show an appropriate "may need adapter restart" message.
    verified = false;
  } else {
    // No defaultValue defined and no toggle check applicable. Any future property
    // type that falls here gets 'reset_verify_failed' rather than a false positive.
    verified = false;
  }

  const outcome = verified ? 'reset_verified' : 'reset_verify_failed';
  console.log(`[NIC:Tuning] reset=${verified ? 'success' : 'unverified'} outcome=${outcome} property=${propertyKey} actualValue=${actualValue}`);

  // Invalidate the capability cache so the UI reflects the restored default value
  // rather than the SwitchControl-applied value captured at discovery time.
  if (verified) {
    invalidateCapabilityCache(adapterName);
  }

  return {
    ok:          verified,
    outcome,
    actualValue,
    error:       verified
      ? null
      : `Reset command ran but readback still shows the applied value (${actualValue}). Driver may require a network adapter restart.`,
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

// Per-scope write lock — serializes concurrent setNicPropertyWithOwnership calls
// for the same adapter+property pair (e.g. rapid double-toggle from the UI).
// Without this, two in-flight runElevated() calls can race: whichever finishes
// last wins, and the earlier call's readback may read the second call's value
// and falsely report write_succeeded_verified. Also prevents two stacked UAC prompts.
const _nicWriteLocks = new Map();

function _withNicWriteLock(scopeKey, fn) {
  // Chain this call after whatever is already running for this scopeKey.
  // If no lock exists, start from a resolved promise.
  const prev = _nicWriteLocks.get(scopeKey) || Promise.resolve();
  const next = prev.then(fn, fn); // run fn regardless of prev outcome
  // Keep the chain alive but don't let it accumulate unhandled-rejection errors.
  _nicWriteLocks.set(scopeKey, next.catch(() => {}));
  return next;
}

/**
 * Set a NIC property AND maintain the ownership / baseline record.
 *
 * Calls are serialized per adapter+property pair via _withNicWriteLock so
 * rapid double-toggles from the UI never produce concurrent UAC prompts or
 * a race between two in-flight runElevated() calls.
 *
 * Order:
 *   1. Read current real property value from the adapter (baseline read)
 *   2. Store baseline ONLY if not already captured for this adapter+property pair
 *      (immutable first-capture — repeated toggles never overwrite the original)
 *   3. Set the property (existing setNicProperty)
 *   4. Record appliedByApp=true ONLY after the set reports success
 *   5. Invalidate the capability cache so the UI reflects the new value
 *
 * previousValue stores { registryValue, displayValue } so the revert pipeline
 * can restore the exact adapter-specific registry value rather than guessing.
 * If the adapter does not support the property, no baseline is captured and
 * ownership is NOT recorded.
 */
async function setNicPropertyWithOwnership(adapterName, propertyKey, value) {
  const scopeKey = ownershipStore.buildScopeKey('nic', propertyKey, adapterName);
  return _withNicWriteLock(scopeKey, () => _setNicPropertyWithOwnershipImpl(adapterName, propertyKey, value, scopeKey));
}

async function _setNicPropertyWithOwnershipImpl(adapterName, propertyKey, value, scopeKey) {
  // Step 1+2: capture baseline if first time touching this adapter+property pair.
  // Also tracks the "before" registry value so we can detect silent driver rejection.
  let beforeRegistryValue = null;
  const existing = ownershipStore.getOwnershipRecord(scopeKey);
  if (!existing || !existing.baselineCaptured) {
    try {
      const current = await readNicProperty(adapterName, propertyKey);
      if (current.supported === false) {
        // Unsupported on this adapter — do not record ownership
        console.log(`[NicExecutor] ${propertyKey} unsupported on "${adapterName}" — skipping ownership`);
      } else {
        beforeRegistryValue = current.registryValue ?? current.displayValue ?? null;
        ownershipStore.captureBaseline(scopeKey, {
          itemType:        'nic',
          itemId:          propertyKey,
          adapterName,
          registryKeyword: current.registryKeyword || null,
          previousValue: {
            registryValue: current.registryValue  ?? null,
            displayValue:  current.displayValue   ?? null,
          },
          // current.supported !== false guard above ensures we only reach here on
          // a real successful read — baseline is always valid at this call site.
          verifySucceeded: true,
        });
      }
    } catch (e) {
      console.warn('[NicExecutor] baseline capture failed for', adapterName, propertyKey, '—', e.message);
    }
  } else {
    // Already have a baseline — use it for silent-rejection detection
    beforeRegistryValue = existing.previousValue?.registryValue ?? existing.previousValue?.displayValue ?? null;
  }

  // Step 3: execute
  const result = await setNicProperty(adapterName, propertyKey, value);

  // ── Driver-locked detection (silent rejection) ──────────────────────────────
  // Some OEM and Intel drivers acknowledge the Set call without error but silently
  // ignore it — the registry value is unchanged. This appears as write_succeeded_verify_failed
  // where actualValue === the value before the write.
  // We surface this as 'driver_locked' rather than the ambiguous verify_failed state.
  if (result.ok && result.outcome === 'write_succeeded_verify_failed' &&
      beforeRegistryValue !== null && result.actualValue !== null &&
      String(result.actualValue) === String(beforeRegistryValue)) {
    console.log(`[NIC:Tuning] driver_locked detected adapter="${adapterName}" property=${propertyKey} — value unchanged after write (before=${beforeRegistryValue} after=${result.actualValue})`);
    result.ok      = false;
    result.outcome = 'driver_locked';
    result.verified = false;
    result.error   = 'Driver acknowledged the write but the value was not applied. This property may be read-only or locked by the vendor driver or a third-party utility.';
  }

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

  // Step 5: invalidate the capability cache so the next UI read shows the new
  // value rather than the stale currentValue captured at discovery time.
  // Do this regardless of success/failure — even a failed write may change
  // adapter state (e.g. driver restart triggered mid-write).
  invalidateCapabilityCache(adapterName);

  return result;
}

module.exports = {
  getNetAdapters,
  getAdapterCapabilities,
  invalidateCapabilityCache,
  invalidateRingBufferCache,
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
