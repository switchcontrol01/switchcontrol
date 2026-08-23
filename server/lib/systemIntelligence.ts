/**
 * System Intelligence — unified hardware/platform collection layer.
 *
 * Collects once on first request, caches for CACHE_TTL_MS, refreshes on demand.
 * Every field is nullable — if data is unreliable it returns null, never fake values.
 */
import si from "systeminformation";
import { execFile } from "child_process";
import { promisify } from "util";
import * as os from "os";
import * as path from "path";
import * as fsp from "fs/promises";

const execFileAsync = promisify(execFile);

const CACHE_TTL_MS          = 30 * 60 * 1000; // 30-minute in-memory refresh
const DISK_CACHE_TTL_MS     = 24 * 60 * 60 * 1000; // 24-hour disk persistence
// AMD/WMI systems (e.g. Ryzen 9800X3D) can take 8-15s for a WMI call.
// The timeout here is only for the PowerShell-based platform-states script.
const PS_TIMEOUT_MS         = 10_000; // was 3s — many AMD WMI calls need 8-12s
// After 2 consecutive timeouts, skip the source for PROBE_COOLDOWN_MS.
// Short enough that a restart 2+ minutes later retries. Persistent across launches.
const PROBE_COOLDOWN_MS     = 2 * 60 * 1000;  // was 12min — 2-minute recovery window

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SipController {
  name: string | null;
  vendor: string | null;
  subVendor: string | null;
  vendorId: string | null;
  deviceId: string | null;
  vramMb: number | null;
  vramDynamic: boolean | null;
  bus: string | null;
  external: boolean | null;
}

export interface SipDisplay {
  model: string | null;
  main: boolean | null;
  connection: string | null;
  resolutionX: number | null;
  resolutionY: number | null;
  refreshRate: number | null;
}

export interface SipMemStick {
  bank: string | null;
  slot: string | null;
  sizeMb: number | null;
  clockMhz: number | null;
  configuredClockMhz: number | null;
  manufacturer: string | null;
  partNum: string | null;
  type: string | null;
}

export interface SipStorageDevice {
  name: string | null;
  type: string | null;
  interfaceType: string | null;
  sizeGb: number | null;
  serial: string | null;
}

export interface SipFilesystem {
  fs: string | null;
  mount: string | null;
  type: string | null;
  sizeGb: number | null;
  usedGb: number | null;
  usePct: number | null;
}

export interface SipNetworkInterface {
  name: string | null;
  type: string | null;
  operstate: string | null;
  internal: boolean | null;
  speedMbps: number | null;
  dhcp: boolean | null;
  ip4: string | null;
  mac: string | null;
  wifi: boolean;
}

export interface SipActiveConnection {
  protocol: string | null;
  localAddress: string | null;
  localPort: number | null;
  peerAddress: string | null;
  peerPort: number | null;
  state: string | null;
  process: string | null;
}

export interface SipProcess {
  name: string;
  pid: number;
  cpu: number | null;
  memoryMb: number | null;
}

export interface SipInference {
  state: "confirmed" | "likely" | "unknown";
  reason: string;
}

export interface SystemIntelligenceProfile {
  baseboard: {
    manufacturer: string | null;
    model: string | null;
    version: string | null;
  };
  bios: {
    vendor: string | null;
    version: string | null;
    releaseDate: string | null;
  };
  cpu: {
    manufacturer: string | null;
    brand: string | null;
    physicalCores: number | null;
    logicalCores: number | null;
    socket: string | null;
    speedGHz: number | null;
  };
  gpu: {
    controllers: SipController[];
    displays: SipDisplay[];
  };
  memory: {
    totalMb: number | null;
    sticks: SipMemStick[];
    inferredDualChannel: boolean | null;
  };
  storage: {
    layout: SipStorageDevice[];
    filesystems: SipFilesystem[];
  };
  network: {
    defaultInterface: string | null;
    defaultGateway: string | null;
    interfaces: SipNetworkInterface[];
    activeConnections: SipActiveConnection[];
  };
  processes: {
    topCpu: SipProcess[];
    topMemory: SipProcess[];
  };
  platform: {
    os: string | null;
    build: string | null;
    hostname: string | null;
    uptimeSec: number | null;
    secureBootEnabled: boolean | null;
    tpmPresent: boolean | null;
    tpmVersion: string | null;
    virtualizationEnabled: boolean | null;
    hypervisorPresent: boolean | null;
    memoryIntegrityEnabled: boolean | null;
    vbsEnabled: boolean | null;
    kernelDmaProtectionEnabled: boolean | null;
    resizeBarEnabled: boolean | null;
    uefiBoot: boolean | null;
  };
  device: {
    batteryPresent: boolean | null;
    batteryPercent: number | null;
    chassisType: string | null;
  };
  users: {
    currentUser: string | null;
    sessions: Array<{
      user: string | null;
      tty: string | null;
      date: string | null;
      ip: string | null;
    }>;
  };
  containers: {
    dockerDetected: boolean | null;
    containers: Array<{
      name: string | null;
      state: string | null;
      image: string | null;
    }>;
  };
  inference: {
    expoOrXmp: SipInference;
    biosFreshness: SipInference;
  };
  audio: {
    devices: Array<{ name: string | null; manufacturer: string | null }>;
  };
  collectedAt: string;
}

// ── Disk cache (24-hour persistence across restarts) ──────────────────────────

function _diskCachePath(): string {
  const base = process.env.APPDATA ?? os.homedir();
  return path.join(base, "SwitchControl", "cache", "system-profile.json");
}

async function _loadDiskCache(): Promise<{ profile: SystemIntelligenceProfile; ageMs: number } | null> {
  try {
    const raw = await fsp.readFile(_diskCachePath(), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!isValidDiskCache(parsed)) {
      console.warn("[SysIntelligence] Ignoring invalid disk cache");
      return null;
    }
    const { timestamp, profile } = parsed;
    const ageMs = Date.now() - timestamp;
    if (ageMs < 0 || !Number.isFinite(ageMs)) {
      console.warn("[SysIntelligence] Ignoring disk cache with invalid timestamp");
      return null;
    }
    if (ageMs < DISK_CACHE_TTL_MS) {
      console.log(`[SysIntelligence] Disk cache hit — age=${Math.round(ageMs / 60000)}min fresh`);
    } else {
      console.log("[SysIntelligence] Disk cache stale — background refresh scheduled");
    }
    return { profile, ageMs }; // always return the profile so dashboard has something
  } catch {
    return null; // first launch or corrupted cache
  }
}

/** Runtime guard: disk data is untrusted and may be truncated or hand-edited. */
function isValidDiskCache(value: unknown): value is {
  timestamp: number;
  profile: SystemIntelligenceProfile;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.timestamp !== "number" || !Number.isFinite(record.timestamp) ||
      record.timestamp < 0 || !record.profile || typeof record.profile !== "object") return false;
  const profile = record.profile as Record<string, unknown>;
  const arraySections = ["gpu", "memory", "storage", "network", "processes", "users", "containers", "audio"];
  if (arraySections.some(section => !profile[section] || typeof profile[section] !== "object")) return false;
  const hasArray = (section: string, key: string) => {
    const value = (profile[section] as Record<string, unknown>)[key];
    return Array.isArray(value);
  };
  return hasArray("gpu", "controllers") && hasArray("gpu", "displays") &&
    hasArray("memory", "sticks") && hasArray("storage", "layout") &&
    hasArray("storage", "filesystems") && hasArray("network", "interfaces") &&
    hasArray("network", "activeConnections") && hasArray("processes", "topCpu") &&
    hasArray("processes", "topMemory") && hasArray("users", "sessions") &&
    hasArray("containers", "containers") && hasArray("audio", "devices");
}

async function _saveDiskCache(profile: SystemIntelligenceProfile): Promise<void> {
  try {
    const p = _diskCachePath();
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.writeFile(p, JSON.stringify({ timestamp: Date.now(), profile }), "utf-8");
    console.log("[SysIntelligence] Disk cache updated");
  } catch (e: any) {
    console.warn("[SysIntelligence] Disk cache write failed:", e.message);
  }
}

// ── Probe degradation cache ────────────────────────────────────────────────────
// Per-source health tracker. After 2+ consecutive timeouts, a source enters a
// 12-minute cooldown where it is skipped entirely instead of blocking startup.
// State persists across restarts via probe-health.json in the same cache dir.

interface ProbeHealthEntry {
  consecutiveTimeouts: number;
  cooledUntil: number;      // skip probe until this epoch ms
  lastSuccessAt: number;    // epoch ms of last successful response
}

let _probeHealth: Record<string, ProbeHealthEntry> = {};
let _probeHealthDirty = false;

function _probeHealthPath(): string {
  const base = process.env.APPDATA ?? os.homedir();
  return path.join(base, "SwitchControl", "cache", "probe-health.json");
}

async function _loadProbeHealth(): Promise<void> {
  try {
    const raw = await fsp.readFile(_probeHealthPath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      _probeHealth = parsed as Record<string, ProbeHealthEntry>;

      // Migration: clamp any stale cooldown that exceeds the current PROBE_COOLDOWN_MS.
      // Prevents probe-health.json files written by older builds (12-min cooldown)
      // from blocking probes for far longer than the current policy allows.
      const now = Date.now();
      const maxCooledUntil = now + PROBE_COOLDOWN_MS;
      for (const entry of Object.values(_probeHealth)) {
        if (entry.cooledUntil > maxCooledUntil) {
          entry.cooledUntil = maxCooledUntil;
          _probeHealthDirty = true;
        }
      }

      const degraded = Object.entries(_probeHealth)
        .filter(([, v]) => v.cooledUntil > now)
        .map(([k, v]) => `${k}(${Math.ceil((v.cooledUntil - now) / 60000)}min)`);
      if (degraded.length) {
        console.log(`[SysIntelligence] Degraded probes loaded — skip list: ${degraded.join(", ")}`);
      }
    }
  } catch {
    _probeHealth = {};
  }
}

async function _saveProbeHealth(): Promise<void> {
  if (!_probeHealthDirty) return;
  try {
    const p = _probeHealthPath();
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.writeFile(p, JSON.stringify(_probeHealth), "utf-8");
    _probeHealthDirty = false;
  } catch (e: any) {
    console.warn("[SysIntelligence] Probe health save failed:", e.message);
  }
}

// ── Per-call timeout wrapper ───────────────────────────────────────────────────
// Any WMI/si call that exceeds the limit is aborted with a warning, returning
// the rejected error so Promise.allSettled() marks it as failed (safe fallback).

function siTimeout<T>(label: string, p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        console.log(`[SysIntelligence] phase=timeout source=${label} limit=${ms}ms`);
        reject(new Error(`${label} timed out after ${ms}ms`));
      }, ms),
    ),
  ]);
}

// ── Tracked timeout — records failures and skips sources in cooldown ───────────
function siTimeoutTracked<T>(label: string, p: Promise<T>, ms: number): Promise<T> {
  const now = Date.now();
  const health = _probeHealth[label];

  // Skip source if it is in a degradation cooldown
  if (health && health.cooledUntil > now) {
    const remainMin = Math.ceil((health.cooledUntil - now) / 60000);
    console.log(`[SysIntelligence] phase=skip source=${label} cooldown=${remainMin}min`);
    return Promise.reject(new Error(`${label} skipped — degradation cooldown (${remainMin}min remaining)`));
  }

  // Cooldown just expired — reset consecutiveTimeouts to 0 so the probe gets
  // two fresh chances before entering cooldown again. Without this, a probe that
  // spent its cooldown still has consecutiveTimeouts=2, meaning the very next
  // timeout immediately re-enters cooldown rather than being treated as a first fail.
  if (health && health.cooledUntil > 0 && health.cooledUntil <= now) {
    _probeHealth[label] = { consecutiveTimeouts: 0, cooledUntil: 0, lastSuccessAt: health.lastSuccessAt };
    _probeHealthDirty = true;
    console.log(`[SysIntelligence] probe=${label} cooldown expired — resetting timeout counter`);
  }

  return siTimeout(label, p, ms).then((result) => {
    // Success — always reset health for this source (not just when non-zero)
    // so a probe that previously had health entries is fully cleared on success.
    const h = _probeHealth[label];
    if (h?.consecutiveTimeouts || h?.cooledUntil) {
      _probeHealth[label] = { consecutiveTimeouts: 0, cooledUntil: 0, lastSuccessAt: now };
      _probeHealthDirty = true;
    } else if (!h) {
      // Record first success so lastSuccessAt is always populated
      _probeHealth[label] = { consecutiveTimeouts: 0, cooledUntil: 0, lastSuccessAt: now };
    }
    return result;
  }).catch((err: Error) => {
    // Only count real timeouts (not skips)
    if (!err.message.includes("skipped —")) {
      const current = _probeHealth[label] ?? { consecutiveTimeouts: 0, cooledUntil: 0, lastSuccessAt: 0 };
      const newCount = current.consecutiveTimeouts + 1;
      // Cooldown after 2nd consecutive timeout. First timeout is just a warning —
      // the probe may succeed next launch. Second+ means WMI is reliably broken on
      // this machine so we skip for PROBE_COOLDOWN_MS to avoid blocking startup.
      const cooledUntil = newCount >= 2 ? now + PROBE_COOLDOWN_MS : 0;
      _probeHealth[label] = { consecutiveTimeouts: newCount, cooledUntil, lastSuccessAt: current.lastSuccessAt };
      _probeHealthDirty = true;
      if (cooledUntil) {
        const coolMin = Math.round(PROBE_COOLDOWN_MS / 60000);
        console.log(`[SysIntelligence] probe=${label} timeout #${newCount} — setting ${coolMin}min cooldown`);
      } else {
        console.log(`[SysIntelligence] probe=${label} timeout #${newCount} — will retry next collection`);
      }
    }
    throw err;
  });
}

// ── In-memory cache ───────────────────────────────────────────────────────────

let _cache: SystemIntelligenceProfile | null = null;
let _cacheAt: number = 0;
let _collectingPromise: Promise<SystemIntelligenceProfile> | null = null;
let _phaseAPromise: Promise<SystemIntelligenceProfile> | null = null;
let _diskCacheBootstrapped = false;

// Pre-populate in-memory cache from disk at module load time (fire-and-forget).
// This ensures getCachedSystemIntelligence() returns something useful on first
// request even before any async collection completes.
void _loadDiskCache().then((result) => {
  _diskCacheBootstrapped = true;
  if (result && !_cache) {
    _cache = result.profile;
    // If the disk cache is still fresh, preserve its age so _cacheAt reflects
    // elapsed time. A 5-minute-old cache should not trigger a full background
    // collect immediately — only a stale (>30min) cache should.
    if (result.ageMs < CACHE_TTL_MS) {
      _cacheAt = Date.now() - result.ageMs; // fresh: advance timestamp appropriately
    } else {
      _cacheAt = 0; // stale: next call will trigger background refresh
    }
    console.log("[SysIntelligence] In-memory cache pre-populated from disk");
  }
});

// Load per-source probe health so degraded sources are skipped from first launch.
void _loadProbeHealth();

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 && s !== "Unknown" && s !== "N/A" && s !== "To Be Filled By O.E.M." && s !== "Not Specified" ? s : null;
}

function safeNum(v: unknown): number | null {
  if (typeof v !== "number" || !isFinite(v) || v <= 0) return null;
  return v;
}

function safeBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

const isWindows = process.platform === "win32";

// ── PowerShell runner ─────────────────────────────────────────────────────────

async function runPS(script: string): Promise<string | null> {
  if (!isWindows) return null;
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NonInteractive", "-NoProfile", "-Command", script],
      { timeout: PS_TIMEOUT_MS, windowsHide: true }
    );
    return stdout.trim();
  } catch {
    return null;
  }
}

async function collectCpuSocket(): Promise<string | null> {
  const raw = await runPS(`
    try {
      $socket = Get-CimInstance Win32_Processor -ErrorAction Stop |
        Select-Object -First 1 -ExpandProperty SocketDesignation
      if ($socket) { [string]$socket }
    } catch {}
  `);
  return safeStr(raw);
}

async function collectWindowsFirmwareSignals(): Promise<{
  socket: string | null;
  kernelDmaProtectionEnabled: boolean | null;
  uefiBoot: boolean | null;
}> {
  const defaults = { socket: null, kernelDmaProtectionEnabled: null, uefiBoot: null };
  if (!isWindows) return defaults;

  const raw = await runPS(`
    $socket = $null; $uefi = $null; $dma = $null
    try {
      $proc = Get-CimInstance Win32_Processor -ErrorAction Stop | Select-Object -First 1
      if ($proc) { $socket = [string]$proc.SocketDesignation }
    } catch {}
    try {
      $boot = (bcdedit.exe /enum "{current}" 2>$null | Out-String)
      if ($boot -match '(?im)^\\s*path\\s+.*winload\\.efi\\s*$') { $uefi = $true }
      elseif ($boot -match '(?im)^\\s*path\\s+.*winload\\.exe\\s*$') { $uefi = $false }
    } catch {}
    # Do not launch msinfo32.exe here. Even with -WindowStyle Hidden, Windows
    # can display its "System Information" progress dialog while the report is
    # generated. DMA status is read directly from the DmaGuard registry keys
    # below, so spawning msinfo32 is unnecessary and disruptive on every scan.
    [PSCustomObject]@{
      Socket = if ([string]::IsNullOrWhiteSpace($socket)) { "null" } else { $socket }
      KernelDma = if ($dma -eq $null) { "null" } elseif ($dma) { "true" } else { "false" }
      Uefi = if ($uefi -eq $null) { "null" } elseif ($uefi) { "true" } else { "false" }
    } | ConvertTo-Json -Compress
  `);
  if (!raw) return defaults;
  try {
    const obj = JSON.parse(raw);
    const parseBool = (v: unknown): boolean | null =>
      v === "true" ? true : v === "false" ? false : null;
    return {
      socket: safeStr(obj.Socket),
      kernelDmaProtectionEnabled: parseBool(obj.KernelDma),
      uefiBoot: parseBool(obj.Uefi),
    };
  } catch {
    return defaults;
  }
}

// ── Windows monitor EDID + identity collector ─────────────────────────────────
// Returns:
//   edidMap          — keyed by hardware ID (e.g. "SAM0E4F"), from the registry
//                       key name under HKLM:\...\Enum\DISPLAY\<hwid>\ — the same
//                       token WmiMonitorID.InstanceName encodes after "DISPLAY\".
//   deviceNameToHwId — keyed by Windows' logical display name (e.g. "\\.\DISPLAY1"),
//                       which is exactly what si.graphics().displays[].deviceName
//                       returns on Windows. Built via EnumDisplayDevices (Win32 API),
//                       the same technique used in electron/main.js's monitor
//                       correlation fix.
//
// This lets callers match si.graphics().displays[] to the correct EDID entry by
// IDENTITY (hardware ID) rather than by array position — si.graphics() and this
// WMI/registry probe are two independent enumeration sources and are NOT
// guaranteed to return monitors in the same order.
interface MonitorEdidEntry {
  name: string;
  manufacturer: string;
  nativeResX: number | null;
  nativeResY: number | null;
}
interface MonitorIdentityResult {
  edidMap: Record<string, MonitorEdidEntry>;
  deviceNameToHwId: Record<string, string>;
}
async function collectMonitorEdidInfo(): Promise<MonitorIdentityResult> {
  const raw = await runPS(`
Set-StrictMode -Off
$edidMap = @{}
$deviceNameToHwId = @{}

# ── EDID map, keyed by hardware ID (registry key name under Enum\\DISPLAY\\) ──
try {
  $base = "HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\DISPLAY"
  foreach ($mod in (Get-ChildItem $base -EA SilentlyContinue | Select-Object -First 8)) {
    $hwid = $mod.PSChildName.ToUpper()
    foreach ($inst in (Get-ChildItem $mod.PSPath -EA SilentlyContinue | Select-Object -First 4)) {
      $e = (Get-ItemProperty (Join-Path $inst.PSPath "Device Parameters") -Name EDID -EA SilentlyContinue).EDID
      if ($e -and $e.Count -ge 72) {
        $name = ''
        $mfr  = ''
        try {
          $mid = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorID -Filter "InstanceName like '%$hwid%'" -EA SilentlyContinue | Select-Object -First 1
          if ($mid) {
            if ($mid.UserFriendlyName)  { $name = ([System.Text.Encoding]::ASCII.GetString($mid.UserFriendlyName)).TrimEnd([char]0).Trim() }
            if ($mid.ManufacturerName)  { $mfr  = ([System.Text.Encoding]::ASCII.GetString($mid.ManufacturerName)).TrimEnd([char]0).Trim() }
          }
        } catch {}
        $hHi = ([int]$e[58] -band 0xF0) -shr 4; $hLo = [int]$e[56]
        $vHi = ([int]$e[61] -band 0xF0) -shr 4; $vLo = [int]$e[59]
        $nx = ($hHi -shl 8) -bor $hLo; $ny = ($vHi -shl 8) -bor $vLo
        if (-not $edidMap.ContainsKey($hwid)) {
          $edidMap[$hwid] = @{
            name = $name; manufacturer = $mfr
            nativeResX = if ($nx -gt 320) { $nx } else { $null }
            nativeResY = if ($ny -gt 240) { $ny } else { $null }
          }
        }
        break
      }
    }
  }
} catch {}

# ── deviceName ("\\\\.\\DISPLAYn") → hardware ID map, via EnumDisplayDevices ────
try {
  Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class DspIdHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)]  public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceID, DeviceKey;
  }
  [DllImport("user32.dll")] public static extern bool EnumDisplayDevices(string d, uint i, ref DISPLAY_DEVICE dd, uint f);
}
'@ -EA Stop

  $di = [uint32]0
  while ($true) {
    $dd = New-Object DspIdHelper+DISPLAY_DEVICE; $dd.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($dd)
    if (![DspIdHelper]::EnumDisplayDevices($null, $di, [ref]$dd, 0)) { break }
    if ($dd.StateFlags -band 1) {
      # $dd.DeviceName is the adapter-level logical name, e.g. "\\\\.\\DISPLAY1" —
      # this is the SAME string si.graphics().displays[].deviceName returns.
      $dd2 = New-Object DspIdHelper+DISPLAY_DEVICE; $dd2.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($dd2)
      if ([DspIdHelper]::EnumDisplayDevices($dd.DeviceName, [uint32]0, [ref]$dd2, 0) -and $dd2.DeviceID) {
        if ($dd2.DeviceID -match 'MONITOR\\([^\\]+)\\') {
          $deviceNameToHwId[$dd.DeviceName] = $Matches[1].ToUpper()
        }
      }
    }
    $di++
  }
} catch {}

[PSCustomObject]@{ edidMap = $edidMap; deviceNameToHwId = $deviceNameToHwId } | ConvertTo-Json -Compress -Depth 4
`.trim());

  const empty: MonitorIdentityResult = { edidMap: {}, deviceNameToHwId: {} };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw);
    return {
      edidMap: parsed?.edidMap ?? {},
      deviceNameToHwId: parsed?.deviceNameToHwId ?? {},
    };
  } catch {
    return empty;
  }
}

// ── Windows platform state collectors ────────────────────────────────────────

async function collectWindowsPlatformStates(): Promise<{
  secureBootEnabled: boolean | null;
  tpmPresent: boolean | null;
  tpmVersion: string | null;
  hypervisorPresent: boolean | null;
  virtualizationEnabled: boolean | null;
  memoryIntegrityEnabled: boolean | null;
  vbsEnabled: boolean | null;
  kernelDmaProtectionEnabled: boolean | null;
  uefiBoot: boolean | null;
  resizeBarEnabled: boolean | null;
}> {
  const defaults = {
    secureBootEnabled: null as boolean | null,
    tpmPresent: null as boolean | null,
    tpmVersion: null as string | null,
    hypervisorPresent: null as boolean | null,
    virtualizationEnabled: null as boolean | null,
    memoryIntegrityEnabled: null as boolean | null,
    vbsEnabled: null as boolean | null,
    kernelDmaProtectionEnabled: null as boolean | null,
    uefiBoot: null as boolean | null,
    resizeBarEnabled: null as boolean | null,
  };

  if (!isWindows) return defaults;

  const script = `
try {
  $sb = $null; try { $sb = [bool](Confirm-SecureBootUEFI -ErrorAction SilentlyContinue) } catch {}
  $tpm = $null; $tpmVersion = $null
  try {
    $t = Get-CimInstance -Namespace root/cimv2/security/microsofttpm -ClassName Win32_Tpm -ErrorAction SilentlyContinue
    if ($t) { $tpm = $true; $tpmVersion = [string]$t.SpecVersion } else { $tpm = $false }
  } catch { $tpm = $false }
  $hvp = $null; try { $cs = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue; $hvp = [bool]$cs.HypervisorPresent } catch {}
  $virt = $null; try { $proc = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1; if ($null -ne $proc) { $virt = [bool]$proc.VirtualizationFirmwareEnabled } } catch {}
  $vbs = $null; $mi = $null
  try {
    $regVBS = Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard" -ErrorAction SilentlyContinue
    if ($regVBS) { $vbs = [bool]($regVBS.EnableVirtualizationBasedSecurity -eq 1) }
    $regHVCI = Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity" -ErrorAction SilentlyContinue
    if ($regHVCI) { $mi = [bool]($regHVCI.Enabled -eq 1) }
  } catch {}
  $dma = $null
  try {
    $dmaKey = Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DmaGuard\\Status" -ErrorAction SilentlyContinue
    if ($null -ne $dmaKey -and $null -ne $dmaKey.Enabled) { $dma = [bool]($dmaKey.Enabled -eq 1) }
    if ($null -eq $dma) {
      $dmaKey = Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DmaGuard" -ErrorAction SilentlyContinue
      if ($null -ne $dmaKey -and $null -ne $dmaKey.Enabled) { $dma = [bool]($dmaKey.Enabled -eq 1) }
    }
  } catch {}
  $uefi = $null; try { $fw = (Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue).FirmwareType; if ($fw -eq "Uefi") { $uefi = $true } elseif ($fw -eq "Bios") { $uefi = $false } } catch {}
  $rebar = $null
  try {
    $gpuClass = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}"
    $subkeys = Get-ChildItem $gpuClass -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch "Properties" }
    foreach ($sk in $subkeys) {
      $v = Get-ItemProperty $sk.PSPath -Name "EnableResizeBAR" -ErrorAction SilentlyContinue
      if ($null -ne $v) { $rebar = [bool]($v.EnableResizeBAR -eq 1); break }
      $v2 = Get-ItemProperty $sk.PSPath -Name "KMD_EnableResizableBar" -ErrorAction SilentlyContinue
      if ($null -ne $v2) { $rebar = [bool]($v2.KMD_EnableResizableBar -eq 1); break }
    }
    if ($null -eq $rebar) {
      $v3 = Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\OpenGLDrivers" -ErrorAction SilentlyContinue
    }
  } catch {}
  [PSCustomObject]@{
    SecureBoot = if ($sb -eq $null) { "null" } else { if ($sb) { "true" } else { "false" } }
    TpmPresent = if ($tpm -eq $null) { "null" } else { if ($tpm) { "true" } else { "false" } }
    TpmVersion = if ([string]::IsNullOrWhiteSpace($tpmVersion)) { "null" } else { $tpmVersion }
    HypervisorPresent = if ($hvp -eq $null) { "null" } else { if ($hvp) { "true" } else { "false" } }
    VirtualizationEnabled = if ($virt -eq $null) { "null" } else { if ($virt) { "true" } else { "false" } }
    VbsEnabled = if ($vbs -eq $null) { "null" } else { if ($vbs) { "true" } else { "false" } }
    MemoryIntegrityEnabled = if ($mi -eq $null) { "null" } else { if ($mi) { "true" } else { "false" } }
    KernelDmaProtectionEnabled = if ($dma -eq $null) { "null" } else { if ($dma) { "true" } else { "false" } }
    UefiBoot = if ($uefi -eq $null) { "null" } else { if ($uefi) { "true" } else { "false" } }
    ResizeBar = if ($rebar -eq $null) { "null" } else { if ($rebar) { "true" } else { "false" } }
  } | ConvertTo-Json -Compress
} catch { Write-Output '{}' }
`.trim();

  const raw = await runPS(script);
  if (!raw) return defaults;

  try {
    const obj = JSON.parse(raw);
    const parseBool = (v: string): boolean | null =>
      v === "true" ? true : v === "false" ? false : null;

    return {
      secureBootEnabled:        parseBool(obj.SecureBoot),
      tpmPresent:               parseBool(obj.TpmPresent),
      tpmVersion:              typeof obj.TpmVersion === "string" && obj.TpmVersion !== "null" ? obj.TpmVersion : null,
      hypervisorPresent:        parseBool(obj.HypervisorPresent),
      virtualizationEnabled:    parseBool(obj.VirtualizationEnabled),
      vbsEnabled:               parseBool(obj.VbsEnabled),
      memoryIntegrityEnabled:   parseBool(obj.MemoryIntegrityEnabled),
      kernelDmaProtectionEnabled: parseBool(obj.KernelDmaProtectionEnabled),
      uefiBoot:                 parseBool(obj.UefiBoot),
      resizeBarEnabled:         parseBool(obj.ResizeBar),
    };
  } catch {
    console.warn("[SysIntelligence] Failed to parse Windows platform states");
    return defaults;
  }
}

// ── Main collector ────────────────────────────────────────────────────────────

async function collect(): Promise<SystemIntelligenceProfile> {
  console.log("[SysIntelligence] phase=full start — deep collection");
  const startMs = Date.now();

  // Serialized batches — prevents 12+ simultaneous PowerShell/WMI spawns that
  // compete for the WMI service lock and starve the Windows audio driver.
  // 400ms gaps between batches let the WMI service release its internal locks.
  // Order: most-important data first, known AMD/Radeon hangers last.

  // Batch 1: baseboard + BIOS — the only things phase=full uniquely adds over phase=A.
  // Collect first so these always land even if later batches timeout.
  const [bbRes, biosRes] = await Promise.allSettled([
    siTimeoutTracked("baseboard", si.baseboard(), 12_000),
    siTimeoutTracked("bios",      si.bios(),      12_000),
  ]);
  await new Promise(r => setTimeout(r, 400));

  // Batch 2: memory layout + disk layout — registry reads, relatively fast, safe to pair.
  const [memLayoutRes, diskLayoutRes] = await Promise.allSettled([
    siTimeoutTracked("memLayout",  si.memLayout(),  10_000),
    siTimeoutTracked("diskLayout", si.diskLayout(), 10_000),
  ]);
  await new Promise(r => setTimeout(r, 400));

  // Batch 3: lightweight OS reads + audio (Win32_SoundDevice) — rarely hang.
  const [fsSizeRes, netIfRes, osRes, audioRes] = await Promise.allSettled([
    siTimeoutTracked("fsSize",  si.fsSize(),               8_000),
    siTimeoutTracked("netIf",   si.networkInterfaces("*"),  8_000),
    siTimeoutTracked("osInfo",  si.osInfo(),               8_000),
    siTimeoutTracked("audio",   si.audio(),                8_000),
  ]);
  await new Promise(r => setTimeout(r, 400));

  // Batch 4: processes (CPU-heavy) + platform states (most expensive PS script).
  // Isolated so neither competes with WMI calls from other batches.
  const [procsRes, platformStates] = await Promise.allSettled([
    siTimeoutTracked("processes",  si.processes(),                  6_000),
    siTimeoutTracked("platformPS", collectWindowsPlatformStates(), 10_000),
  ]);
  await new Promise(r => setTimeout(r, 400));

  // Batch 5: graphics + monitor EDID/identity — known AMD/Radeon hangers.
  // By the time these run, all critical data is already collected.
  const [graphicsRes, monitorEdidRes] = await Promise.allSettled([
    siTimeoutTracked("graphics",    si.graphics(),             8_000),
    siTimeoutTracked("monitorEDID", collectMonitorEdidInfo(),  8_000),
  ]);

  // CPU: si.cpu() spawns PowerShell and frequently hangs on AMD cold-start.
  // os.cpus() gives brand + core count instantly with no process spawn.
  // The existing os.cpus() fallback below handles this transparently.
  const cpuRes: PromiseSettledResult<null> = { status: "fulfilled", value: null };
  const monitorIdentity: MonitorIdentityResult =
    monitorEdidRes.status === "fulfilled" ? monitorEdidRes.value : { edidMap: {}, deviceNameToHwId: {} };
  // Focused Windows firmware reads remain available even when the broader
  // systeminformation/WMI probes time out on AMD systems.
  const firmwareSignals = await collectWindowsFirmwareSignals();

  const audioDevices: Array<{ name: string | null; manufacturer: string | null }> =
    audioRes.status === "fulfilled"
      ? (audioRes.value as any[]).map((a: any) => ({
          name: safeStr(a.name),
          manufacturer: safeStr(a.manufacturer ?? a.driver ?? null),
        })).filter((a: { name: string | null }) => a.name !== null)
      : [];

  // Chassis — WMI call; 4s on AMD systems
  let chassisType: string | null = null;
  try {
    const chassis = await Promise.race([
      si.chassis(),
      new Promise<null>(r => setTimeout(() => r(null), 4_000)), // was 1500ms
    ]);
    chassisType = chassis ? safeStr((chassis as any).type) : null;
  } catch {}

  // ── Baseboard ──
  const bb = bbRes.status === "fulfilled" ? bbRes.value : null;
  const bios = biosRes.status === "fulfilled" ? biosRes.value : null;

  // ── CPU — os.cpus() fallback when WMI si.cpu() hangs (common on AMD cold-start) ──
  let cpu: any = cpuRes.status === "fulfilled" ? cpuRes.value : null;
  if (!cpu?.brand) {
    const osCpus = os.cpus();
    if (osCpus.length > 0) {
      cpu = {
        brand:         osCpus[0].model?.trim() || null,
        manufacturer:  null,
        physicalCores: Math.max(1, Math.floor(osCpus.length / 2)),
        cores:         osCpus.length,
        socket:        firmwareSignals.socket,
        speed:         osCpus[0].speed ? parseFloat((osCpus[0].speed / 1000).toFixed(2)) : null,
      };
      console.log(`[SysIntelligence] cpu WMI timeout — os.cpus() fallback: ${cpu.brand}`);
    }
  }

  // ── GPU ──
  const graphics = graphicsRes.status === "fulfilled" ? graphicsRes.value : null;
  const controllers: SipController[] = (graphics?.controllers ?? []).map((c: any) => ({
    name: safeStr(c.model),
    vendor: safeStr(c.vendor),
    subVendor: safeStr(c.subVendor ?? null),
    vendorId: safeStr(c.vendorId ?? null),
    deviceId: safeStr(c.deviceId ?? null),
    vramMb: safeNum(typeof c.vram === "number" ? c.vram : null),
    vramDynamic: typeof c.vramDynamic === "boolean" ? c.vramDynamic : null,
    bus: safeStr(c.bus),
    external: typeof c.external === "boolean" ? c.external : null,
  })).filter((c: SipController) => c.name !== null);

  // ── Identity-based EDID correlation (Tier 1 → Tier 2 → Tier 3) ────────────────
  // si.graphics().displays[] and the WMI/registry EDID probe are two independent
  // enumeration sources — NOT guaranteed to return monitors in the same order.
  // Positional matching (displays[i] ↔ edidNames[i]) silently attaches the wrong
  // monitor's name/native-res to the wrong entry when the two sources enumerate
  // in different orders. Mirrors the identity-based fix already applied to
  // electron/main.js's _runDisplayInfoPs().
  //
  // Tier 1 — deviceName ("\\.\DISPLAYn", from si.graphics()) → hardware ID
  //          (from EnumDisplayDevices) → EDID entry (from registry, same hwId key).
  //          Most reliable; used whenever si supplies deviceName and the hwId
  //          lookup succeeds.
  // Tier 2 — native-resolution constraint: a display cannot run above its own
  //          native resolution. If exactly ONE unused EDID entry satisfies
  //          currentRes <= nativeRes for a display still unmatched after Tier 1,
  //          assign it. If ambiguous (0 or 2+ candidates), do not guess.
  // Tier 3 — leave the original si model name as-is (no EDID override) rather
  //          than attach a guessed name — an honest "unresolved" is safer than a
  //          confidently wrong one.
  const rawDisplays: any[] = graphics?.displays ?? [];
  const usedHwIds = new Set<string>();

  // Tier 1 pass — resolve by identity wherever possible.
  const tier1Resolved = rawDisplays.map((d: any) => {
    const deviceName = typeof d.deviceName === "string" ? d.deviceName : null;
    const hwId = deviceName ? monitorIdentity.deviceNameToHwId[deviceName] : undefined;
    const edid = hwId ? monitorIdentity.edidMap[hwId] : undefined;
    if (hwId && edid) usedHwIds.add(hwId);
    return { raw: d, edid: (hwId && edid ? edid : null) as MonitorEdidEntry | null, tier1Matched: !!(hwId && edid) };
  });

  // Tier 2 pass — native-res constraint fallback for anything Tier 1 missed.
  for (const entry of tier1Resolved) {
    if (entry.tier1Matched) continue;
    const rx = safeNum(entry.raw.currentResX ?? entry.raw.resolutionX);
    const ry = safeNum(entry.raw.currentResY ?? entry.raw.resolutionY);
    if (rx === null || ry === null) continue;
    const candidates = Object.entries(monitorIdentity.edidMap).filter(([hwId, e]) => {
      if (usedHwIds.has(hwId)) return false;
      const nx = (e as MonitorEdidEntry).nativeResX;
      const ny = (e as MonitorEdidEntry).nativeResY;
      return nx !== null && ny !== null && rx <= nx && ry <= ny;
    });
    if (candidates.length === 1) {
      const [hwId, edid] = candidates[0];
      entry.edid = edid as MonitorEdidEntry;
      usedHwIds.add(hwId);
    }
    // 0 or 2+ candidates → Tier 3, leave entry.edid as null (no guess).
  }

  // Generic-sounding model names that should be replaced with EDID data when available
  const GENERIC_NAMES = new Set([
    "generic pnp monitor", "generic monitor", "pnp monitor",
    "default monitor", "non-pnp monitor", "plug and play monitor",
  ]);

  const displays: SipDisplay[] = tier1Resolved.map(({ raw: d, edid }) => {
    const siModel = safeStr(d.model);
    let resolvedModel: string | null = siModel;
    if (edid && edid.name) {
      const siLower = (siModel ?? "").toLowerCase().trim();
      if (!siModel || GENERIC_NAMES.has(siLower)) {
        const mfr = edid.manufacturer;
        const mdl = edid.name;
        if (mfr && !mdl.toLowerCase().startsWith(mfr.toLowerCase())) {
          resolvedModel = `${mfr} ${mdl}`.trim();
        } else {
          resolvedModel = mdl;
        }
      }
    }
    return {
      model: resolvedModel,
      main: safeBool(d.main),
      connection: safeStr(d.connection),
      resolutionX: safeNum(d.resolutionX),
      resolutionY: safeNum(d.resolutionY),
      refreshRate: safeNum(d.currentRefreshRate ?? d.refreshRate),
    };
  });

  // ── Memory layout ──
  const memLayout = memLayoutRes.status === "fulfilled" ? memLayoutRes.value : [];
  const sticks: SipMemStick[] = memLayout.map((s: any) => ({
    bank: safeStr(s.bank),
    slot: safeStr(s.slot),
    sizeMb: safeNum(s.size != null ? s.size / 1024 / 1024 : null),
    clockMhz: safeNum(s.clockSpeed),
    configuredClockMhz: safeNum(s.configuredClockSpeed),
    manufacturer: safeStr(s.manufacturer),
    partNum: safeStr(s.partNum),
    type: safeStr(s.type),
  })).filter((s: SipMemStick) => s.sizeMb !== null && s.sizeMb > 0);

  // ── WMI fallback for memory layout (Win32_PhysicalMemory) ─────────────────
  // si.memLayout() frequently times out on AMD/WMI systems (seen: Ryzen 9800X3D).
  // When it does, sticks[] is empty and expoOrXmp falls back to "Unknown / Off".
  // Win32_PhysicalMemory returns Speed (module rated speed) and
  // ConfiguredClockSpeed (actual BIOS-configured speed) — exactly what we need
  // for EXPO/XMP detection. Falls back gracefully on any error.
  if (sticks.length === 0 && process.platform === "win32") {
    try {
      const wmiScript = [
        "Get-CimInstance -ClassName Win32_PhysicalMemory -ErrorAction Stop",
        "| Select-Object Speed,ConfiguredClockSpeed,ConfiguredVoltage,Capacity,Manufacturer,PartNumber,BankLabel",
        "| ConvertTo-Json -Compress",
      ].join(" ");
      const { stdout: wmiOut } = await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", wmiScript],
        { timeout: 12_000 },
      );
      const wmiRaw = JSON.parse(wmiOut.trim());
      const wmiItems: any[] = Array.isArray(wmiRaw) ? wmiRaw : [wmiRaw];
      const wmiSticks: SipMemStick[] = wmiItems
        .filter((s: any) => s && (Number(s.Capacity) > 0 || Number(s.Speed) > 0))
        .map((s: any) => ({
          bank:               s.BankLabel ? String(s.BankLabel).trim() : null,
          slot:               null,
          sizeMb:             s.Capacity ? Math.round(Number(s.Capacity) / 1024 / 1024) : null,
          // Speed = module's rated/XMP speed stamped on the module
          clockMhz:           s.Speed ? Number(s.Speed) : null,
          // ConfiguredClockSpeed = speed the BIOS actually programmed
          configuredClockMhz: s.ConfiguredClockSpeed ? Number(s.ConfiguredClockSpeed) : null,
          manufacturer:       s.Manufacturer ? String(s.Manufacturer).trim() : null,
          partNum:            s.PartNumber  ? String(s.PartNumber).trim()  : null,
          type:               null,
        }))
        .filter((s: SipMemStick) => s.sizeMb !== null && s.sizeMb > 0);
      if (wmiSticks.length > 0) {
        sticks.push(...wmiSticks);
        console.log(`[SysIntelligence] memLayout WMI fallback OK — ${wmiSticks.length} stick(s)`);
      }
    } catch (wmiErr: any) {
      console.warn("[SysIntelligence] memLayout WMI fallback failed:", wmiErr?.message ?? wmiErr);
    }
  }

  // ── Part-number speed extraction ──────────────────────────────────────────
  // Win32_PhysicalMemory often returns Speed=0 / ConfiguredClockSpeed=0 on AMD
  // EXPO boards (DRAM controller reports nothing via WMI).  Most DDR4/DDR5 kit
  // PartNumbers encode the rated MT/s:  "F5-6200J3040…"→6200,
  // "CMK32GX5M2E6000C30"→6000, "KF560C36BBEAK2-32"→6000, etc.
  // Use the first standalone 4-digit number in [3200, 9000] that isn't a
  // well-known JEDEC base speed as a clockMhz fallback.
  if (sticks.some(s => s.clockMhz === null && s.configuredClockMhz === null && s.partNum)) {
    // Capture the first standalone 4-digit number in [3200, 9000] — this range
    // covers all real DDR4/DDR5 speeds (JEDEC base and XMP/EXPO profiles alike).
    // Numbers outside [3200, 9000] are almost certainly batch codes or
    // capacity/CAS values, not speeds.
    const speedRe = /(?<![0-9])([3-9][0-9]{3})(?![0-9])/g;
    for (const stick of sticks) {
      if (stick.clockMhz !== null || !stick.partNum) continue;
      const candidates: number[] = [];
      let m: RegExpExecArray | null;
      speedRe.lastIndex = 0;
      while ((m = speedRe.exec(stick.partNum)) !== null) {
        const v = parseInt(m[1], 10);
        if (v >= 3200 && v <= 9000) candidates.push(v);
      }
      if (candidates.length > 0) {
        stick.clockMhz = candidates[0];
        console.log(`[SysIntelligence] memLayout partNum extraction: "${stick.partNum}" → ${stick.clockMhz} MHz`);
      }
    }
  }

  // ── Get-WmiObject (DCOM) speed fallback ───────────────────────────────────
  // If every stick still has no speed after CimInstance + part-number heuristic,
  // retry via the old DCOM transport (Get-WmiObject).  Some Ryzen/AM5 boards
  // return Speed=0 through WinRM/CIM but serve correct values over DCOM.
  if (
    sticks.length > 0 &&
    sticks.every(s => s.clockMhz === null && s.configuredClockMhz === null) &&
    process.platform === "win32"
  ) {
    try {
      const dcomScript = [
        "Get-WmiObject -Class Win32_PhysicalMemory -ErrorAction Stop",
        "| Select-Object Speed,ConfiguredClockSpeed",
        "| ConvertTo-Json -Compress",
      ].join(" ");
      const { stdout: dcomOut } = await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", dcomScript],
        { timeout: 8_000 },
      );
      const dcomRaw = JSON.parse(dcomOut.trim());
      const dcomItems: any[] = Array.isArray(dcomRaw) ? dcomRaw : [dcomRaw];
      let enriched = 0;
      dcomItems.forEach((item: any, idx: number) => {
        if (!item || idx >= sticks.length) return;
        const cs = Number(item.ConfiguredClockSpeed);
        const sp = Number(item.Speed);
        if (cs > 0) { sticks[idx].configuredClockMhz = cs; enriched++; }
        if (sp > 0) { sticks[idx].clockMhz             = sp; }
      });
      if (enriched > 0)
        console.log(`[SysIntelligence] memLayout DCOM fallback enriched ${enriched} stick(s)`);
    } catch (dcomErr: any) {
      console.warn("[SysIntelligence] memLayout DCOM fallback failed:", dcomErr?.message ?? dcomErr);
    }
  }

  // Infer dual channel: 2+ sticks with same size
  let inferredDualChannel: boolean | null = null;
  if (sticks.length >= 2) {
    const sizes = sticks.map(s => s.sizeMb);
    const allSame = sizes.every(sz => sz === sizes[0]);
    inferredDualChannel = allSame && sticks.length % 2 === 0;
  }

  // Mem total from si.mem() — bounded so it never adds seconds on slow-WMI hosts
  let memTotalMb: number | null = null;
  try {
    const mem = await Promise.race([
      si.mem(),
      new Promise<null>(r => setTimeout(() => r(null), 1_500)),
    ]);
    memTotalMb = mem && (mem as any).total > 0 ? Math.round((mem as any).total / 1024 / 1024) : null;
  } catch {}

  // ── Storage ──
  const diskLayout = diskLayoutRes.status === "fulfilled" ? diskLayoutRes.value : [];
  const storageLayout: SipStorageDevice[] = diskLayout.map((d: any) => ({
    name: safeStr(d.name),
    type: safeStr(d.type),
    interfaceType: safeStr(d.interfaceType),
    sizeGb: d.size > 0 ? parseFloat((d.size / 1e9).toFixed(1)) : null,
    serial: safeStr(d.serialNum),
  })).filter((d: SipStorageDevice) => d.name !== null || d.sizeGb !== null);

  const fsRaw = fsSizeRes.status === "fulfilled" ? fsSizeRes.value : [];
  const filesystems: SipFilesystem[] = fsRaw.map((f: any) => ({
    fs: safeStr(f.fs),
    mount: safeStr(f.mount),
    type: safeStr(f.type),
    sizeGb: f.size > 0 ? parseFloat((f.size / 1e9).toFixed(1)) : null,
    usedGb: f.used > 0 ? parseFloat((f.used / 1e9).toFixed(1)) : null,
    usePct: typeof f.use === "number" && isFinite(f.use) ? parseFloat(f.use.toFixed(1)) : null,
  }));

  // ── Network ──
  const netIfRaw = netIfRes.status === "fulfilled" ? (netIfRes.value as any[]) : [];
  const ifaces: SipNetworkInterface[] = netIfRaw.map((n: any) => ({
    name: safeStr(n.iface),
    type: safeStr(n.type),
    operstate: safeStr(n.operstate),
    internal: safeBool(n.internal),
    speedMbps: safeNum(n.speed),
    dhcp: safeBool(n.dhcp),
    ip4: safeStr(n.ip4),
    mac: safeStr(n.mac),
    wifi: !!(n.type?.toLowerCase().includes("wireless") || n.iface?.toLowerCase().includes("wi-fi") || n.iface?.toLowerCase().includes("wlan")),
  })).filter((n: SipNetworkInterface) => !n.internal && n.operstate === "up");

  let defaultInterface: string | null = null;
  let defaultGateway: string | null = null;
  try {
    const [gwRes, ifRes] = await Promise.allSettled([
      Promise.race([si.networkGatewayDefault(),    new Promise<string>(r => setTimeout(() => r(''), 1_500))]),
      Promise.race([si.networkInterfaceDefault(), new Promise<string>(r => setTimeout(() => r(''), 1_500))]),
    ]);
    if (gwRes.status === 'fulfilled') defaultGateway   = safeStr(gwRes.value);
    if (ifRes.status === 'fulfilled') defaultInterface = safeStr(ifRes.value);
  } catch {}

  // netConn removed — very expensive on Windows (enumerates all TCP/UDP sockets)
  const activeConnections: SipActiveConnection[] = [];

  // ── Processes ──
  const procsData = procsRes.status === "fulfilled" ? (procsRes.value as any).list : [];
  const toProcess = (p: any): SipProcess => ({
    name: String(p.name || ""),
    pid: p.pid,
    cpu: typeof p.cpu === "number" ? parseFloat(p.cpu.toFixed(1)) : null,
    memoryMb: typeof p.mem_rss === "number" ? Math.round(p.mem_rss / 1024 / 1024) : null,
  });

  const sortedByCpu = [...procsData].sort((a: any, b: any) => (b.cpu ?? 0) - (a.cpu ?? 0));
  const sortedByMem = [...procsData].sort((a: any, b: any) => (b.mem_rss ?? 0) - (a.mem_rss ?? 0));

  const SYSTEM_PROCS = new Set(["system", "system idle process", "idle", "registry", "smss.exe", "csrss.exe", "wininit.exe", "services.exe", "lsass.exe", "svchost.exe"]);
  const filterProcs = (list: any[]) =>
    list.filter((p: any) => p.name && !SYSTEM_PROCS.has(p.name.toLowerCase())).slice(0, 5).map(toProcess);

  const topCpu = filterProcs(sortedByCpu).filter(p => (p.cpu ?? 0) > 0);
  const topMemory = filterProcs(sortedByMem).filter(p => (p.memoryMb ?? 0) > 0);

  // ── OS ──
  const osData = osRes.status === "fulfilled" ? osRes.value : null;

  // battery + users removed — no value for desktop gaming; battery always null on desktop PCs

  // ── Platform states (Windows) ──
  const pStatesBase = platformStates.status === "fulfilled" ? platformStates.value : {
    secureBootEnabled: null, tpmPresent: null, hypervisorPresent: null,
    tpmVersion: null,
    virtualizationEnabled: null, memoryIntegrityEnabled: null, vbsEnabled: null,
    kernelDmaProtectionEnabled: null,
    uefiBoot: null, resizeBarEnabled: null,
  };
  const pStates = {
    ...pStatesBase,
    kernelDmaProtectionEnabled: pStatesBase.kernelDmaProtectionEnabled ?? firmwareSignals.kernelDmaProtectionEnabled,
    uefiBoot: pStatesBase.uefiBoot ?? firmwareSignals.uefiBoot,
  };

  // ── Containers — skip quickly on non-Docker hosts or slow-WMI machines ──
  let dockerDetected: boolean | null = null;
  let containers: SystemIntelligenceProfile["containers"]["containers"] = [];
  try {
    const dockerInfo = await Promise.race([
      si.dockerInfo(),
      new Promise<null>(r => setTimeout(() => r(null), 1_500)),
    ]);
    dockerDetected = !!(dockerInfo && (dockerInfo as any).containers >= 0);
    if (dockerDetected) {
      const dockerContainers = await si.dockerContainers(true);
      containers = (dockerContainers as any[]).slice(0, 10).map((c: any) => ({
        name: safeStr(c.name),
        state: safeStr(c.state),
        image: safeStr(c.image),
      }));
    }
  } catch {
    dockerDetected = false;
  }

  // ── Inference ──

  // EXPO/XMP inference — based on memory configured speed vs rated speed.
  //
  // Win32_PhysicalMemory field semantics (same as si.memLayout() on Windows):
  //   Speed               → clockMhz:          module's rated/stamped XMP/EXPO speed
  //   ConfiguredClockSpeed → configuredClockMhz: speed the BIOS actually programmed
  //
  // Detection rule:
  //   configured ≈ rated  → EXPO/XMP confirmed (BIOS applied the XMP/EXPO profile)
  //   configured < rated  → EXPO/XMP disabled  (BIOS running below the module's rated speed)
  //   no rated data, but configured ≥ 3200 → likely active (older si data only has one field)
  let expoOrXmp: SipInference = { state: "unknown", reason: "No memory layout data available." };
  if (sticks.length > 0) {
    const configuredSpeeds = sticks.map(s => s.configuredClockMhz).filter((s): s is number => s !== null);
    const ratedSpeeds      = sticks.map(s => s.clockMhz).filter((s): s is number => s !== null);
    if (configuredSpeeds.length > 0 && ratedSpeeds.length > 0) {
      const maxConfigured = Math.max(...configuredSpeeds);
      const maxRated      = Math.max(...ratedSpeeds);
      if (maxConfigured >= maxRated * 0.95) {
        // Configured ≈ rated → BIOS applied the XMP/EXPO profile.
        expoOrXmp = {
          state:  "confirmed",
          reason: `Enabled (EXPO/XMP) — ${maxConfigured} MHz (rated ${maxRated} MHz)`,
        };
      } else if (maxConfigured >= 3200) {
        // Running above low JEDEC but below the module's stamped speed.
        expoOrXmp = {
          state:  "likely",
          reason: `Partially active — ${maxConfigured} MHz configured, module rated ${maxRated} MHz`,
        };
      } else {
        // Well below the module's rated speed — XMP/EXPO clearly disabled.
        expoOrXmp = {
          state:  "unknown",
          reason: `Disabled — running at ${maxConfigured} MHz (module rated ${maxRated} MHz)`,
        };
      }
    } else if (configuredSpeeds.length > 0) {
      // Only configuredClockSpeed available (no rated speed in this data source).
      // Fall back to the JEDEC-comparison heuristic.
      const maxConfigured = Math.max(...configuredSpeeds);
      if (maxConfigured >= 3200) {
        expoOrXmp = {
          state:  "likely",
          reason: `Memory at ${maxConfigured} MHz — likely above JEDEC baseline, EXPO/XMP probably active`,
        };
      } else {
        expoOrXmp = {
          state:  "unknown",
          reason: `Disabled — running at rated speed (${maxConfigured} MHz)`,
        };
      }
    }
  }

  // BIOS freshness inference — based on release date
  let biosFreshness: SipInference = { state: "unknown", reason: "BIOS release date not available." };
  if (bios?.releaseDate) {
    try {
      const relDate = new Date(bios.releaseDate);
      const nowMs = Date.now();
      const ageMonths = (nowMs - relDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (!isNaN(ageMonths)) {
        if (ageMonths < 6) {
          biosFreshness = { state: "confirmed", reason: `BIOS released ${Math.round(ageMonths)} months ago — up to date.` };
        } else if (ageMonths < 18) {
          biosFreshness = { state: "likely", reason: `BIOS released ~${Math.round(ageMonths)} months ago — likely current but may have newer updates.` };
        } else {
          biosFreshness = { state: "unknown", reason: `BIOS is ${Math.round(ageMonths / 12)} year(s) old — check manufacturer site for updates.` };
        }
      }
    } catch {}
  }

  const profile: SystemIntelligenceProfile = {
    baseboard: {
      manufacturer: safeStr(bb?.manufacturer),
      model: safeStr(bb?.model),
      version: safeStr(bb?.version),
    },
    bios: {
      vendor: safeStr(bios?.vendor),
      version: safeStr(bios?.version),
      releaseDate: safeStr(bios?.releaseDate),
    },
    cpu: {
      manufacturer: safeStr(cpu?.manufacturer),
      brand: safeStr(cpu?.brand),
      physicalCores: safeNum(cpu?.physicalCores ?? null),
      logicalCores: safeNum(cpu?.cores ?? null),
      socket: safeStr(cpu?.socket) ?? firmwareSignals.socket,
      speedGHz: cpu?.speed != null ? parseFloat(cpu.speed.toFixed(2)) : null,
    },
    gpu: { controllers, displays },
    memory: { totalMb: memTotalMb, sticks, inferredDualChannel },
    storage: { layout: storageLayout, filesystems },
    network: { defaultInterface, defaultGateway, interfaces: ifaces, activeConnections },
    processes: { topCpu, topMemory },
    platform: {
      os: safeStr(osData?.distro ?? osData?.platform),
      build: safeStr(osData?.build ?? osData?.release),
      hostname: safeStr(osData?.hostname),
      uptimeSec: safeNum((osData as any)?.uptime ?? null),
      ...pStates,
    },
    device: {
      batteryPresent: null,
      batteryPercent: null,
      chassisType,
    },
    users: { currentUser: null, sessions: [] },
    containers: { dockerDetected, containers },
    inference: { expoOrXmp, biosFreshness },
    audio: { devices: audioDevices },
    collectedAt: new Date().toISOString(),
  };

  const dur = Date.now() - startMs;
  console.log(`[SysIntelligence] phase=full complete in ${dur}ms | MB=${profile.baseboard.model} | BIOS=${profile.bios.version} | CPU=${profile.cpu.brand} | GPUs=${profile.gpu.controllers.length} | RAMsticks=${profile.memory.sticks.length}`);

  // Guard: if the profile is completely empty (all WMI calls timed out), do NOT overwrite
  // the disk cache — it may contain good data from a previous session when WMI was healthy.
  // Re-use whatever was already in the disk cache rather than poisoning it with all-nulls.
  // Note: cpu.brand is almost always populated via the os.cpus() fallback, so it cannot
  // be the sole emptiness signal. We require gpu, memory AND storage to all be empty too.
  const _isProfileEmpty = (p: SystemIntelligenceProfile) =>
    p.baseboard.model === null &&
    p.bios.version === null &&
    p.cpu.brand === null &&
    p.gpu.controllers.length === 0 &&
    p.memory.sticks.length === 0 &&
    p.storage.layout.length === 0;

  if (_isProfileEmpty(profile)) {
    console.warn("[SysIntelligence] phase=full returned all-null — skipping disk cache write to preserve previous good data");
    // If in-memory cache is also null, try to reload from disk so callers get something useful
    if (!_cache || _isProfileEmpty(_cache)) {
      const diskResult = await _loadDiskCache();
      const diskFallback = diskResult?.profile ?? null;
      if (diskFallback && !_isProfileEmpty(diskFallback)) {
        console.log("[SysIntelligence] Restored disk cache as in-memory fallback after all-null collection");
        _cache   = diskFallback;
        _cacheAt = 0; // treat as stale — allow next timed refresh to try again
      }
    }
  } else {
    void _saveDiskCache(profile);   // persist to disk (fire-and-forget)
  }

  void _saveProbeHealth(); // persist probe health (fire-and-forget)
  return profile;
}

// ── Phase A fast collector ─────────────────────────────────────────────────────
// Collects only the 5 identity fields in <1s for immediate dashboard hydration.
// Everything else returns empty/null — the full collect() fills them in later.

async function collectFast(): Promise<SystemIntelligenceProfile> {
  const t = Date.now();
  console.log("[SysIntelligence] phase=A start — identity collection (sequential, WMI-safe)");

  // Phase A is now fully sequential with 600ms gaps between probes.
  // On AMD/WMI-broken systems, Promise.allSettled() spawns 5 PowerShell
  // processes simultaneously — that parallel burst starves the Windows audio
  // scheduler thread, causing the crackling/glitching. Serializing probes
  // with gaps prevents the burst entirely.
  //
  // Probe order: fastest/most-important first. If a probe is in a cooldown
  // (from a previous launch), it is skipped instantly — no process spawn.

  const memRes = await siTimeout("A.mem", si.mem(), 3_000).catch(() => null); // was 1500ms — AMD WMI needs more time
  const memTotalMb = memRes?.total > 0
    ? Math.round(memRes.total / 1024 / 1024)
    : os.totalmem() > 0 ? Math.round(os.totalmem() / 1024 / 1024) : null;

  // 600ms breathing room for the WMI service to recover
  await new Promise(r => setTimeout(r, 600));

  const cpuSi = await siTimeoutTracked("cpu", si.cpu(), 9_000).catch(() => null); // was 5s
  let cpu: any = cpuSi;
  if (!cpu || !cpu.brand) {
    const osCpus = os.cpus();
    if (osCpus && osCpus.length > 0) {
      cpu = {
        brand:         osCpus[0].model?.trim() || null,
        manufacturer:  null,
        physicalCores: Math.max(1, Math.floor(osCpus.length / 2)),
        cores:         osCpus.length,
        socket:        null,
        speed:         osCpus[0].speed ? parseFloat((osCpus[0].speed / 1000).toFixed(2)) : null,
        _fallback:     true,
      };
      console.log(`[SysIntelligence] phase=A cpu WMI timeout — os.cpus() fallback: ${cpu.brand}`);
    }
  }

  await new Promise(r => setTimeout(r, 600));

  // GPU is needed for the dashboard specs strip. Skip if in cooldown.
  const graphics = await siTimeoutTracked("graphics", si.graphics(), 6_000).catch(() => null); // was 3s

  // Network interfaces: si.networkInterfaces("*") uses WMI on Windows and hangs
  // indefinitely on some AMD/X670/X870 systems (confirmed by 3s + 8s timeouts in
  // production logs). Removed from Phase A — the Driver Intel store has an IPC
  // fallback (nic:getAdapters → Get-NetAdapter, no WMI) that populates adapter
  // chip descriptions correctly. Leaving this call in Phase A only added 3+ seconds
  // to Phase A on affected systems, pushing it past the 6s client cap.
  const fastIfaces: SipNetworkInterface[] = [];

  const controllers: SipController[] = (graphics?.controllers ?? []).map((c: any) => ({
    name: safeStr(c.model), vendor: safeStr(c.vendor), subVendor: null, vendorId: null,
    deviceId: null, vramMb: safeNum(typeof c.vram === "number" ? c.vram : null),
    vramDynamic: null, bus: safeStr(c.bus), external: null,
  })).filter((c: SipController) => c.name !== null);

  // Baseboard and BIOS are NEVER needed for first paint — skip in Phase A entirely.
  // They are collected in the full background pass instead. This removes two
  // process spawns from the startup path.

  const nullInf: SipInference = { state: "unknown", reason: "Pending deep scan." };
  const profile: SystemIntelligenceProfile = {
    baseboard:  { manufacturer: null, model: null, version: null },
    bios:       { vendor: null, version: null, releaseDate: null },
    cpu: {
      manufacturer: safeStr(cpu?.manufacturer), brand: safeStr(cpu?.brand),
      physicalCores: safeNum(cpu?.physicalCores ?? null), logicalCores: safeNum(cpu?.cores ?? null),
      socket: safeStr(cpu?.socket), speedGHz: cpu?.speed != null ? parseFloat(cpu.speed.toFixed(2)) : null,
    },
    gpu:        { controllers, displays: [] },
    memory:     { totalMb: memTotalMb, sticks: [], inferredDualChannel: null },
    storage:    { layout: [], filesystems: [] },
    network:    { defaultInterface: null, defaultGateway: null, interfaces: fastIfaces, activeConnections: [] },
    processes:  { topCpu: [], topMemory: [] },
    platform:   {
      os: null, build: null, hostname: null, uptimeSec: null,
      secureBootEnabled: null, tpmPresent: null, hypervisorPresent: null,
      tpmVersion: null,
      virtualizationEnabled: null, vbsEnabled: null, memoryIntegrityEnabled: null,
      kernelDmaProtectionEnabled: null,
      uefiBoot: null, resizeBarEnabled: null,
    },
    device:     { batteryPresent: null, batteryPercent: null, chassisType: null },
    users:      { currentUser: null, sessions: [] },
    containers: { dockerDetected: null, containers: [] },
    inference:  { expoOrXmp: nullInf, biosFreshness: nullInf },
    audio:      { devices: [] },
    collectedAt: new Date().toISOString(),
  };

  console.log(`[SysIntelligence] phase=A complete in ${Date.now() - t}ms | CPU=${profile.cpu.brand} | GPU=${controllers[0]?.name ?? "n/a"} | RAM=${memTotalMb}MB | probes: mem+cpu+graphics (baseboard/bios skipped)`);
  void _saveProbeHealth(); // persist probe health so cooldowns survive restarts
  return profile;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the cached profile, refreshing if stale or on first call.
 * If a collection is already in-flight, awaits the same promise (no double-collect).
 * On repeat launches the disk cache pre-populates _cache so this returns instantly.
 */
export async function getSystemIntelligence(forceRefresh = false): Promise<SystemIntelligenceProfile> {
  const stale = Date.now() - _cacheAt > CACHE_TTL_MS;

  if (!forceRefresh && !stale && _cache) return _cache;
  if (_collectingPromise) return _collectingPromise;

  _collectingPromise = collect().then((p) => {
    // Never downgrade a good in-memory cache with an all-null result (e.g. probes
    // in cooldown after first-launch timeouts). Preserve the richer data.
    // Matches the _isProfileEmpty guard in collect() — includes storage so a
    // profile where only os.cpus() succeeded isn't treated as non-empty.
    const empty = p.baseboard.model === null && p.bios.version === null &&
                  p.cpu.brand === null && p.gpu.controllers.length === 0 &&
                  p.memory.sticks.length === 0 && p.storage.layout.length === 0;
    if (!empty || !_cache) {
      _cache = p;
    }
    _cacheAt = Date.now(); // always advance timestamp to stop re-collect spam
    _collectingPromise = null;
    return _cache!;
  }).catch((err) => {
    console.error("[SysIntelligence] Collection failed:", err);
    void _saveProbeHealth(); // save health even on unexpected error
    _collectingPromise = null;
    if (_cache) return _cache; // return stale cache on error
    throw err;
  });

  return _collectingPromise;
}

/**
 * Phase A — returns minimal identity profile (<1s on cold start).
 * If in-memory cache already has data (disk-restored on warm launch), returns it instantly.
 * Otherwise runs collectFast() and stores the result so subsequent calls skip collection.
 * A background full collect() is always scheduled after Phase A completes.
 */
export async function getFastSystemIntelligence(): Promise<SystemIntelligenceProfile> {
  // Disk-restored cache: already populated, just return it
  if (_cache) return _cache;

  // Deduplicate concurrent callers
  if (_phaseAPromise) return _phaseAPromise;

  _phaseAPromise = collectFast().then((p) => {
    // Only write Phase A data if there is no richer full profile yet
    if (!_cache) {
      _cache   = p;
      _cacheAt = 0; // keep marked stale so full collect() still runs
    }
    // Clear _phaseAPromise AFTER _cache is written. If cleared first, a concurrent
    // caller landing between the clear and the _cache write would see both as null
    // and trigger a redundant collectFast().
    _phaseAPromise = null;
    return _cache!;
  }).catch((err) => {
    console.error("[SysIntelligence] Phase A failed:", err);
    void _saveProbeHealth(); // save health even on Phase A error
    _phaseAPromise = null;
    if (_cache) return _cache;
    throw err;
  });

  return _phaseAPromise;
}

/**
 * Triggers background deep collection without blocking the caller.
 * Call this after the dashboard is visible (5s post-stable).
 */
export function triggerBackgroundCollection(): void {
  if (_collectingPromise) return; // already running
  const stale = Date.now() - _cacheAt > CACHE_TTL_MS;
  if (!stale && _cache) return; // fresh enough
  console.log("[SysIntelligence] Background deep collection triggered");
  void getSystemIntelligence();
}

/**
 * Invalidates the cache so the next call to getSystemIntelligence() re-collects.
 */
export function invalidateSystemIntelligence(): void {
  _cacheAt = 0;
  _cache = null;
}

/**
 * Returns cached profile synchronously (may be null if not yet collected).
 */
export function getCachedSystemIntelligence(): SystemIntelligenceProfile | null {
  return _cache;
}