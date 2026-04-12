/**
 * System Intelligence — unified hardware/platform collection layer.
 *
 * Collects once on first request, caches for CACHE_TTL_MS, refreshes on demand.
 * Every field is nullable — if data is unreliable it returns null, never fake values.
 */

import si from "systeminformation";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const PS_TIMEOUT_MS = 8_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SipController {
  name: string | null;
  vendor: string | null;
  vramMb: number | null;
  bus: string | null;
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

// ── Cache ─────────────────────────────────────────────────────────────────────

let _cache: SystemIntelligenceProfile | null = null;
let _cacheAt: number = 0;
let _collectingPromise: Promise<SystemIntelligenceProfile> | null = null;

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
  console.log("[SysIntelligence] Collecting full system profile…");
  const startMs = Date.now();

  const [
    bbRes, biosRes, cpuRes, graphicsRes, memLayoutRes,
    diskLayoutRes, fsSizeRes, netIfRes, netConnRes,
    procsRes, osRes, batteryRes, usersRes,
    platformStates,
  ] = await Promise.allSettled([
    si.baseboard(),
    si.bios(),
    si.cpu(),
    si.graphics(),
    si.memLayout(),
    si.diskLayout(),
    si.fsSize(),
    si.networkInterfaces("*"),
    si.networkConnections(),
    si.processes(),
    si.osInfo(),
    si.battery(),
    si.users(),
    collectWindowsPlatformStates(),
  ]);

  // Chassis
  let chassisType: string | null = null;
  try {
    const chassis = await si.chassis();
    chassisType = safeStr(chassis.type);
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
    vramMb: safeNum(typeof c.vram === "number" ? c.vram : c.vramDynamic),
    bus: safeStr(c.bus),
  })).filter((c: SipController) => c.name !== null);

  const displays: SipDisplay[] = (graphics?.displays ?? []).map((d: any) => ({
    model: safeStr(d.model),
    main: safeBool(d.main),
    connection: safeStr(d.connection),
    resolutionX: safeNum(d.resolutionX),
    resolutionY: safeNum(d.resolutionY),
    refreshRate: safeNum(d.currentRefreshRate ?? d.refreshRate),
  }));

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

  // Mem total from si.mem()
  let memTotalMb: number | null = null;
  try {
    const mem = await si.mem();
    memTotalMb = mem.total > 0 ? Math.round(mem.total / 1024 / 1024) : null;
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
    const gateway = await si.networkGatewayDefault();
    defaultGateway = safeStr(gateway);
    const gw = await si.networkInterfaceDefault();
    defaultInterface = safeStr(gw);
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
  const os = osRes.status === "fulfilled" ? osRes.value : null;

  // ── Battery + Chassis ──
  const bat = batteryRes.status === "fulfilled" ? batteryRes.value : null;

  // ── Users ──
  const usersRaw = usersRes.status === "fulfilled" ? (usersRes.value as any[]) : [];
  let currentUser: string | null = null;
  try { currentUser = safeStr(os?.hostname ? undefined : undefined) ?? null; } catch {}
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

  // ── Containers ──
  let dockerDetected: boolean | null = null;
  let containers: SystemIntelligenceProfile["containers"]["containers"] = [];
  try {
    const dockerInfo = await si.dockerInfo();
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
      os: safeStr(os?.distro ?? os?.platform),
      build: safeStr(os?.build ?? os?.release),
      hostname: safeStr(os?.hostname),
      uptimeSec: safeNum(os?.uptime ?? null),
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
  console.log(`[SysIntelligence] Collection complete in ${dur}ms | MB=${profile.baseboard.model} | BIOS=${profile.bios.version} | CPU=${profile.cpu.brand} | GPUs=${profile.gpu.controllers.length} | RAMsticks=${profile.memory.sticks.length}`);

  return profile;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the cached profile, refreshing if stale or on first call.
 * If a collection is already in-flight, awaits the same promise (no double-collect).
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
