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
const PS_TIMEOUT_MS         = 3_000; // reduced — any PS call that hangs logs a warning
const PROBE_COOLDOWN_MS     = 12 * 60 * 1000; // 12-minute per-source cooldown after 2+ timeouts

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
    virtualizationEnabled: boolean | null;
    hypervisorPresent: boolean | null;
    memoryIntegrityEnabled: boolean | null;
    vbsEnabled: boolean | null;
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
  collectedAt: string;
}

// ── Disk cache (24-hour persistence across restarts) ──────────────────────────

function _diskCachePath(): string {
  const base = process.env.APPDATA ?? os.homedir();
  return path.join(base, "SwitchControl", "cache", "system-profile.json");
}

async function _loadDiskCache(): Promise<SystemIntelligenceProfile | null> {
  try {
    const raw = await fsp.readFile(_diskCachePath(), "utf-8");
    const { timestamp, profile } = JSON.parse(raw) as { timestamp: number; profile: SystemIntelligenceProfile };
    const ageMs = Date.now() - timestamp;
    if (ageMs < DISK_CACHE_TTL_MS) {
      console.log(`[SysIntelligence] Disk cache hit — age=${Math.round(ageMs / 60000)}min`);
      return profile;
    }
    console.log("[SysIntelligence] Disk cache stale — background refresh scheduled");
    return profile; // return stale rather than null so dashboard has something
  } catch {
    return null; // first launch or corrupted cache
  }
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
      const degraded = Object.entries(_probeHealth)
        .filter(([, v]) => v.cooledUntil > Date.now())
        .map(([k, v]) => `${k}(${Math.ceil((v.cooledUntil - Date.now()) / 60000)}min)`);
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
        console.warn(`[SysIntelligence] phase=timeout source=${label} limit=${ms}ms`);
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

  return siTimeout(label, p, ms).then((result) => {
    // Success — reset health for this source
    if (_probeHealth[label]?.consecutiveTimeouts) {
      _probeHealth[label] = { consecutiveTimeouts: 0, cooledUntil: 0, lastSuccessAt: now };
      _probeHealthDirty = true;
    }
    return result;
  }).catch((err: Error) => {
    // Only count real timeouts (not skips)
    if (!err.message.includes("skipped —")) {
      const current = _probeHealth[label] ?? { consecutiveTimeouts: 0, cooledUntil: 0, lastSuccessAt: 0 };
      const newCount = current.consecutiveTimeouts + 1;
      const cooledUntil = newCount >= 2 ? now + PROBE_COOLDOWN_MS : 0;
      _probeHealth[label] = { consecutiveTimeouts: newCount, cooledUntil, lastSuccessAt: current.lastSuccessAt };
      _probeHealthDirty = true;
      if (cooledUntil) {
        console.warn(`[SysIntelligence] probe=${label} timeout #${newCount} — setting 12min cooldown`);
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
void _loadDiskCache().then((cached) => {
  _diskCacheBootstrapped = true;
  if (cached && !_cache) {
    _cache   = cached;
    _cacheAt = 0; // treat as stale so next call triggers background refresh
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

// ── Windows monitor EDID name collector ───────────────────────────────────────

async function collectMonitorEdidNames(): Promise<Array<{ name: string; manufacturer: string }>> {
  const raw = await runPS(`
try {
  $monitors = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue
  if (-not $monitors) { Write-Output '[]'; return }
  $result = @()
  foreach ($m in $monitors) {
    $name = ''
    $mfr  = ''
    if ($m.UserFriendlyName) {
      $name = ([System.Text.Encoding]::ASCII.GetString($m.UserFriendlyName)).TrimEnd([char]0).Trim()
    }
    if ($m.ManufacturerName) {
      $mfr = ([System.Text.Encoding]::ASCII.GetString($m.ManufacturerName)).TrimEnd([char]0).Trim()
    }
    $result += [PSCustomObject]@{ Name = $name; Manufacturer = $mfr }
  }
  $result | ConvertTo-Json -Compress
} catch { Write-Output '[]' }
`.trim());

  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr
      .filter((m: any) => typeof m === "object" && m !== null)
      .map((m: any) => ({
        name: (m.Name ?? "").trim(),
        manufacturer: (m.Manufacturer ?? "").trim(),
      }));
  } catch {
    return [];
  }
}

// ── Windows platform state collectors ────────────────────────────────────────

async function collectWindowsPlatformStates(): Promise<{
  secureBootEnabled: boolean | null;
  tpmPresent: boolean | null;
  hypervisorPresent: boolean | null;
  virtualizationEnabled: boolean | null;
  memoryIntegrityEnabled: boolean | null;
  vbsEnabled: boolean | null;
  uefiBoot: boolean | null;
  resizeBarEnabled: boolean | null;
}> {
  const defaults = {
    secureBootEnabled: null as boolean | null,
    tpmPresent: null as boolean | null,
    hypervisorPresent: null as boolean | null,
    virtualizationEnabled: null as boolean | null,
    memoryIntegrityEnabled: null as boolean | null,
    vbsEnabled: null as boolean | null,
    uefiBoot: null as boolean | null,
    resizeBarEnabled: null as boolean | null,
  };

  if (!isWindows) return defaults;

  const script = `
try {
  $sb = $null; try { $sb = [bool](Confirm-SecureBootUEFI -ErrorAction SilentlyContinue) } catch {}
  $tpm = $null; try { $t = Get-WmiObject -Namespace root/cimv2/security/microsofttpm -Class Win32_Tpm -ErrorAction SilentlyContinue; if ($t) { $tpm = $true } else { $tpm = $false } } catch { $tpm = $false }
  $hvp = $null; try { $cs = Get-WmiObject Win32_ComputerSystem -ErrorAction SilentlyContinue; $hvp = [bool]$cs.HypervisorPresent } catch {}
  $virt = $null; try { $si = systeminfo /fo csv 2>$null | ConvertFrom-Csv; $v = $si.'Hyper-V Requirements'; if ($v) { $virt = $v -notmatch "A hypervisor has been detected" } } catch {}
  $vbs = $null; $mi = $null
  try {
    $regVBS = Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard" -ErrorAction SilentlyContinue
    if ($regVBS) { $vbs = [bool]($regVBS.EnableVirtualizationBasedSecurity -eq 1) }
    $regHVCI = Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity" -ErrorAction SilentlyContinue
    if ($regHVCI) { $mi = [bool]($regHVCI.Enabled -eq 1) }
  } catch {}
  $uefi = $null; try { $fw = (Get-WmiObject -Class Win32_OperatingSystem -ErrorAction SilentlyContinue).FirmwareType; if ($fw -eq "Uefi") { $uefi = $true } elseif ($fw -eq "Bios") { $uefi = $false } } catch {}
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
    HypervisorPresent = if ($hvp -eq $null) { "null" } else { if ($hvp) { "true" } else { "false" } }
    VirtualizationEnabled = if ($virt -eq $null) { "null" } else { if ($virt) { "true" } else { "false" } }
    VbsEnabled = if ($vbs -eq $null) { "null" } else { if ($vbs) { "true" } else { "false" } }
    MemoryIntegrityEnabled = if ($mi -eq $null) { "null" } else { if ($mi) { "true" } else { "false" } }
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
      hypervisorPresent:        parseBool(obj.HypervisorPresent),
      virtualizationEnabled:    parseBool(obj.VirtualizationEnabled),
      vbsEnabled:               parseBool(obj.VbsEnabled),
      memoryIntegrityEnabled:   parseBool(obj.MemoryIntegrityEnabled),
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

  // Tight timeouts: fail fast rather than block startup for 30s on AMD/WMI-slow hosts.
  // siTimeoutTracked records each timeout and skips sources in a 12-min cooldown after 2+ failures.
  const [
    bbRes, biosRes, cpuRes, graphicsRes, memLayoutRes,
    diskLayoutRes, fsSizeRes, netIfRes, netConnRes,
    procsRes, osRes, batteryRes, usersRes,
    platformStates, monitorEdidRes,
  ] = await Promise.allSettled([
    siTimeoutTracked("baseboard",    si.baseboard(),             3_000),
    siTimeoutTracked("bios",         si.bios(),                  3_000),
    siTimeoutTracked("cpu",          si.cpu(),                   5_000), // os.cpus() fallback
    siTimeoutTracked("graphics",     si.graphics(),              3_000), // WMI covers AMD
    siTimeoutTracked("memLayout",    si.memLayout(),             4_000),
    siTimeoutTracked("diskLayout",   si.diskLayout(),            4_000),
    siTimeoutTracked("fsSize",       si.fsSize(),                4_000),
    siTimeoutTracked("netIf",        si.networkInterfaces("*"),  4_000),
    siTimeoutTracked("netConn",      si.networkConnections(),    4_000),
    siTimeoutTracked("processes",    si.processes(),             4_000),
    siTimeoutTracked("osInfo",       si.osInfo(),                3_000),
    siTimeoutTracked("battery",      si.battery(),               2_000),
    siTimeoutTracked("users",        si.users(),                 2_000),
    siTimeoutTracked("platformPS",   collectWindowsPlatformStates(), 3_000),
    siTimeoutTracked("monitorEDID",  collectMonitorEdidNames(),       3_000),
  ]);
  const edidNames: Array<{ name: string; manufacturer: string }> =
    monitorEdidRes.status === "fulfilled" ? monitorEdidRes.value : [];

  // Chassis — quick WMI call, 1.5s hard limit
  let chassisType: string | null = null;
  try {
    const chassis = await Promise.race([
      si.chassis(),
      new Promise<null>(r => setTimeout(() => r(null), 1_500)),
    ]);
    chassisType = chassis ? safeStr((chassis as any).type) : null;
  } catch {}

  // ── Baseboard ──
  const bb = bbRes.status === "fulfilled" ? bbRes.value : null;
  const bios = biosRes.status === "fulfilled" ? biosRes.value : null;

  // ── CPU ──
  const cpu = cpuRes.status === "fulfilled" ? cpuRes.value : null;

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

  // Generic-sounding model names that should be replaced with EDID data when available
  const GENERIC_NAMES = new Set([
    "generic pnp monitor", "generic monitor", "pnp monitor",
    "default monitor", "non-pnp monitor", "plug and play monitor",
  ]);

  const displays: SipDisplay[] = (graphics?.displays ?? []).map((d: any, i: number) => {
    const siModel = safeStr(d.model);
    const edid = edidNames[i] ?? null;

    // Prefer EDID model name when systeminformation returns a generic placeholder
    let resolvedModel: string | null = siModel;
    if (edid && edid.name) {
      const siLower = (siModel ?? "").toLowerCase().trim();
      if (!siModel || GENERIC_NAMES.has(siLower)) {
        // Build display name: "Samsung S27AG32x" style if manufacturer differs from name prefix
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

  const netConnRaw = netConnRes.status === "fulfilled" ? (netConnRes.value as any[]) : [];
  const activeConnections: SipActiveConnection[] = netConnRaw.slice(0, 50).map((c: any) => ({
    protocol: safeStr(c.protocol),
    localAddress: safeStr(c.localAddress),
    localPort: typeof c.localPort === "number" ? c.localPort : null,
    peerAddress: safeStr(c.peerAddress),
    peerPort: typeof c.peerPort === "number" ? c.peerPort : null,
    state: safeStr(c.state),
    process: safeStr(c.process),
  }));

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

  // ── Battery + Chassis ──
  const bat = batteryRes.status === "fulfilled" ? batteryRes.value : null;

  // ── Users ──
  const usersRaw = usersRes.status === "fulfilled" ? (usersRes.value as any[]) : [];
  let currentUser: string | null = null;
  try { currentUser = safeStr(usersRaw[0]?.user) ?? null; } catch {}

  const sessions = usersRaw.map((u: any) => ({
    user: safeStr(u.user),
    tty: safeStr(u.tty),
    date: safeStr(u.date),
    ip: safeStr(u.ip),
  }));

  // ── Platform states (Windows) ──
  const pStates = platformStates.status === "fulfilled" ? platformStates.value : {
    secureBootEnabled: null, tpmPresent: null, hypervisorPresent: null,
    virtualizationEnabled: null, memoryIntegrityEnabled: null, vbsEnabled: null,
    uefiBoot: null, resizeBarEnabled: null,
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

  // EXPO/XMP inference — based on memory configured speed vs rated speed
  let expoOrXmp: SipInference = { state: "unknown", reason: "No memory layout data available." };
  if (sticks.length > 0) {
    const configuredSpeeds = sticks.map(s => s.configuredClockMhz).filter((s): s is number => s !== null);
    const ratedSpeeds = sticks.map(s => s.clockMhz).filter((s): s is number => s !== null);
    if (configuredSpeeds.length > 0 && ratedSpeeds.length > 0) {
      const maxConfigured = Math.max(...configuredSpeeds);
      const maxRated = Math.max(...ratedSpeeds);
      if (maxConfigured >= maxRated * 0.95) {
        expoOrXmp = { state: "confirmed", reason: `Memory running at configured speed (${maxConfigured} MHz ≈ rated ${maxRated} MHz) — EXPO/XMP profile is active.` };
      } else if (maxConfigured >= 3200) {
        expoOrXmp = { state: "likely", reason: `Memory configured at ${maxConfigured} MHz but rated at ${maxRated} MHz — profile may be partially applied.` };
      } else {
        expoOrXmp = { state: "unknown", reason: `Memory running at ${maxConfigured} MHz vs rated ${maxRated} MHz — EXPO/XMP appears disabled or not set.` };
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
      socket: safeStr(cpu?.socket),
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
      batteryPresent: bat ? (bat.hasBattery ?? null) : null,
      batteryPercent: bat?.hasBattery ? safeNum(bat.percent) : null,
      chassisType,
    },
    users: { currentUser, sessions },
    containers: { dockerDetected, containers },
    inference: { expoOrXmp, biosFreshness },
    collectedAt: new Date().toISOString(),
  };

  const dur = Date.now() - startMs;
  console.log(`[SysIntelligence] phase=full complete in ${dur}ms | MB=${profile.baseboard.model} | BIOS=${profile.bios.version} | CPU=${profile.cpu.brand} | GPUs=${profile.gpu.controllers.length} | RAMsticks=${profile.memory.sticks.length}`);

  // Guard: if the profile is completely empty (all WMI calls timed out), do NOT overwrite
  // the disk cache — it may contain good data from a previous session when WMI was healthy.
  // Re-use whatever was already in the disk cache rather than poisoning it with all-nulls.
  const _isProfileEmpty = (p: SystemIntelligenceProfile) =>
    p.baseboard.model === null &&
    p.bios.version === null &&
    p.cpu.brand === null &&
    p.gpu.controllers.length === 0 &&
    p.memory.sticks.length === 0;

  if (_isProfileEmpty(profile)) {
    console.warn("[SysIntelligence] phase=full returned all-null — skipping disk cache write to preserve previous good data");
    // If in-memory cache is also null, try to reload from disk so callers get something useful
    if (!_cache || _isProfileEmpty(_cache)) {
      const diskFallback = await _loadDiskCache();
      if (diskFallback && !_isProfileEmpty(diskFallback)) {
        console.log("[SysIntelligence] Restored disk cache as in-memory fallback after all-null collection");
        _cache   = diskFallback;
        _cacheAt = 0; // treat as stale — allow next timed refresh to try again
      }
    }
  } else {
    void _saveDiskCache(profile);   // persist to disk (fire-and-forget)
  }

  void _saveProbeHealth();        // persist probe health (fire-and-forget)
  return profile;
}

// ── Phase A fast collector ─────────────────────────────────────────────────────
// Collects only the 5 identity fields in <1s for immediate dashboard hydration.
// Everything else returns empty/null — the full collect() fills them in later.

async function collectFast(): Promise<SystemIntelligenceProfile> {
  const t = Date.now();
  console.log("[SysIntelligence] phase=A start — identity collection");

  // Tight limits — Phase A must never hang startup. os.cpus()/os.totalmem() are
  // always-available fallbacks if WMI is slow on this host.
  const [bbRes, biosRes, cpuRes, graphicsRes, memRes] = await Promise.allSettled([
    siTimeoutTracked("baseboard", si.baseboard(), 3_000),
    siTimeoutTracked("bios",      si.bios(),      3_000),
    siTimeoutTracked("cpu",       si.cpu(),       5_000), // os.cpus() fallback below
    siTimeoutTracked("graphics",  si.graphics(),  3_000),
    siTimeout("A.mem",            si.mem(),       1_500), // untracked — no fallback needed
  ]);

  const bb       = bbRes.status      === "fulfilled" ? (bbRes.value as any)       : null;
  const bios     = biosRes.status    === "fulfilled" ? (biosRes.value as any)     : null;
  const cpuSi    = cpuRes.status     === "fulfilled" ? (cpuRes.value as any)      : null;
  const graphics = graphicsRes.status === "fulfilled" ? (graphicsRes.value as any) : null;
  const mem      = memRes.status     === "fulfilled" ? (memRes.value as any)      : null;

  // If WMI cpu timed out (AMD cold-start), fall back to the synchronous os.cpus()
  // which is always populated and resolves in <1ms. This prevents Phase A from
  // returning a null brand on first launch.
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

  // RAM: fall back to os.totalmem() if si.mem() timed out
  const memTotalMb = mem?.total > 0
    ? Math.round(mem.total / 1024 / 1024)
    : os.totalmem() > 0 ? Math.round(os.totalmem() / 1024 / 1024) : null;
  const controllers: SipController[] = (graphics?.controllers ?? []).map((c: any) => ({
    name: safeStr(c.model), vendor: safeStr(c.vendor), subVendor: null, vendorId: null,
    deviceId: null, vramMb: safeNum(typeof c.vram === "number" ? c.vram : null),
    vramDynamic: null, bus: safeStr(c.bus), external: null,
  })).filter((c: SipController) => c.name !== null);

  const nullInf: SipInference = { state: "unknown", reason: "Pending deep scan." };
  const profile: SystemIntelligenceProfile = {
    baseboard:  { manufacturer: safeStr(bb?.manufacturer), model: safeStr(bb?.model), version: safeStr(bb?.version) },
    bios:       { vendor: safeStr(bios?.vendor), version: safeStr(bios?.version), releaseDate: safeStr(bios?.releaseDate) },
    cpu: {
      manufacturer: safeStr(cpu?.manufacturer), brand: safeStr(cpu?.brand),
      physicalCores: safeNum(cpu?.physicalCores ?? null), logicalCores: safeNum(cpu?.cores ?? null),
      socket: safeStr(cpu?.socket), speedGHz: cpu?.speed != null ? parseFloat(cpu.speed.toFixed(2)) : null,
    },
    gpu:        { controllers, displays: [] },
    memory:     { totalMb: memTotalMb, sticks: [], inferredDualChannel: null },
    storage:    { layout: [], filesystems: [] },
    network:    { defaultInterface: null, defaultGateway: null, interfaces: [], activeConnections: [] },
    processes:  { topCpu: [], topMemory: [] },
    platform:   {
      os: null, build: null, hostname: null, uptimeSec: null,
      secureBootEnabled: null, tpmPresent: null, hypervisorPresent: null,
      virtualizationEnabled: null, vbsEnabled: null, memoryIntegrityEnabled: null,
      uefiBoot: null, resizeBarEnabled: null,
    },
    device:     { batteryPresent: null, batteryPercent: null, chassisType: null },
    users:      { currentUser: null, sessions: [] },
    containers: { dockerDetected: null, containers: [] },
    inference:  { expoOrXmp: nullInf, biosFreshness: nullInf },
    collectedAt: new Date().toISOString(),
  };

  console.log(`[SysIntelligence] phase=A complete in ${Date.now() - t}ms | CPU=${profile.cpu.brand} | GPU=${controllers[0]?.name ?? "n/a"} | RAM=${memTotalMb}MB`);
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
    _cache = p;
    _cacheAt = Date.now();
    _collectingPromise = null;
    return p;
  }).catch((err) => {
    console.error("[SysIntelligence] Collection failed:", err);
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
    _phaseAPromise = null;

    // Immediately schedule full background collection (non-blocking)
    if (!_collectingPromise) {
      void getSystemIntelligence();
    }

    return _cache!;
  }).catch((err) => {
    console.error("[SysIntelligence] Phase A failed:", err);
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
