import si from "systeminformation";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GpuTelemetry {
  load: number | null;
  vramUsedMb: number | null;
  vramTotalMb: number | null;
  vramPercent: number | null;
  tempC: number | null;
  clockMhz: number | null;
  name: string | null;
}

export interface DiskTelemetry {
  activeTimePct: number | null;  // ms_sec from si.disksIO — 0-100 (% busy)
  readKBps: number | null;       // rIO_sec converted to KB/s
  writeKBps: number | null;      // wIO_sec converted to KB/s
  available: boolean;
}

export interface TelemetrySnapshot {
  ts: number;
  status: "ready" | "loading";
  cpu: {
    load: number;
    speed: number;
    cores: number;
  };
  ram: {
    totalGB: number;
    usedGB: number;
    usedPercent: number;
  };
  network: {
    rx_sec: number;
    tx_sec: number;
    latency_ms: number;
  };
  temps: {
    cpu: number | null;
    gpu: number | null;
  };
  gpu: GpuTelemetry;
  disk: DiskTelemetry;
  processes: {
    running: number;
    total: number;
  };
  load_trend: "rising" | "falling" | "stable";
}

// ── Module-level state ───────────────────────────────────────────────────────

let lastLoad = 0;
let lastNetStats: { rx: number; tx: number; ts: number } | null = null;
const LOAD_HISTORY: number[] = [];

// Disk I/O: track whether it has ever returned valid data
let diskAvailableConfirmed = false;
let diskUnavailableLogged = false;
// Previous disk snapshot for computing per-second deltas ourselves
let lastDiskSnapshot: { rIO: number; wIO: number; ms: number; ts: number } | null = null;

// Module-level cache — populated immediately at startup
let cachedSnapshot: TelemetrySnapshot | null = null;
let pollingTimer: NodeJS.Timeout | null = null;

// GPU cache — polled every second so the 1-second chart line stays smooth
let cachedGpu: GpuTelemetry = {
  load: null, vramUsedMb: null, vramTotalMb: null,
  vramPercent: null, tempC: null, clockMhz: null, name: null,
};
let lastGpuPollTs = 0;
const GPU_POLL_INTERVAL_MS = 1000;

// ── GPU selection ─────────────────────────────────────────────────────────────
// Priority: NVIDIA/AMD discrete with VRAM → highest VRAM → first valid controller.
// This must stay consistent across calls so telemetry always references the same
// physical GPU that systemIntelligence.ts reports in the static identity section.

const DISCRETE_VENDORS = ["nvidia", "amd", "radeon", "geforce", "rx ", "rtx ", "gtx "];

function selectActiveController(controllers: any[]): any | null {
  if (!controllers.length) return null;
  if (controllers.length === 1) return controllers[0];

  // 1. Prefer NVIDIA/AMD with dedic VRAM
  const discrete = controllers.find(c => {
    const sig = `${c.vendor ?? ""} ${c.model ?? ""}`.toLowerCase();
    return DISCRETE_VENDORS.some(d => sig.includes(d)) && (c.vram ?? 0) > 0;
  });
  if (discrete) return discrete;

  // 2. Any controller with the most VRAM
  const withVram = controllers.filter(c => (c.vram ?? 0) > 0);
  if (withVram.length) {
    return withVram.sort((a, b) => (b.vram ?? 0) - (a.vram ?? 0))[0];
  }

  // 3. First controller
  return controllers[0];
}

// ── GPU polling ──────────────────────────────────────────────────────────────

async function pollGpu(): Promise<GpuTelemetry> {
  const now = Date.now();
  if (now - lastGpuPollTs < GPU_POLL_INTERVAL_MS) return cachedGpu;

  try {
    const gfx = await si.graphics();
    const ctrl = selectActiveController(gfx.controllers);
    if (!ctrl) {
      lastGpuPollTs = now;
      return cachedGpu;
    }

    const vramTotal = (ctrl as any).vramDynamic
      ? ((ctrl as any).memoryTotal ?? ctrl.vram ?? 0)
      : (ctrl.vram ?? 0);
    const vramUsed: number | null = (ctrl as any).memoryUsed ?? null;
    const vramPct: number | null =
      vramUsed != null && vramTotal > 0
        ? parseFloat(((vramUsed / vramTotal) * 100).toFixed(1))
        : null;

    const result: GpuTelemetry = {
      load: (ctrl as any).utilizationGpu != null ? (ctrl as any).utilizationGpu : null,
      vramUsedMb: vramUsed,
      vramTotalMb: vramTotal > 0 ? vramTotal : null,
      vramPercent: vramPct,
      tempC: (ctrl as any).temperatureGpu ?? null,
      clockMhz: (ctrl as any).clockCore ?? null,
      name: ctrl.model ?? null,
    };

    cachedGpu = result;
    lastGpuPollTs = now;
    return result;
  } catch {
    lastGpuPollTs = now;
    return cachedGpu;
  }
}

// ── Main snapshot ────────────────────────────────────────────────────────────

export async function getSnapshot(): Promise<TelemetrySnapshot> {
  const [load, mem, nets, temps, procs, diskIo] = await Promise.allSettled([
    si.currentLoad(),
    si.mem(),
    si.networkStats(),
    si.cpuTemperature(),
    si.processes(),
    si.disksIO(),
  ]);

  const cpuLoad =
    load.status === "fulfilled" ? load.value.currentLoad : lastLoad;
  const cpuSpeed =
    load.status === "fulfilled" ? (load.value as any).cpuCurrentSpeed ?? 0 : 0;
  lastLoad = cpuLoad;

  LOAD_HISTORY.push(cpuLoad);
  if (LOAD_HISTORY.length > 6) LOAD_HISTORY.shift();
  const trend = (() => {
    if (LOAD_HISTORY.length < 3) return "stable";
    const recent = LOAD_HISTORY.slice(-3);
    const delta = recent[2] - recent[0];
    if (delta > 5) return "rising";
    if (delta < -5) return "falling";
    return "stable";
  })() as TelemetrySnapshot["load_trend"];

  const memVal = mem.status === "fulfilled" ? mem.value : null;
  const totalGB = memVal ? memVal.total / 1024 / 1024 / 1024 : 0;
  const usedGB = memVal ? memVal.used / 1024 / 1024 / 1024 : 0;
  const usedPercent = totalGB > 0 ? (usedGB / totalGB) * 100 : 0;

  let rx_sec = 0;
  let tx_sec = 0;
  if (nets.status === "fulfilled" && nets.value.length > 0) {
    const iface = nets.value[0];
    const now = Date.now();
    if (lastNetStats) {
      const dt = (now - lastNetStats.ts) / 1000;
      if (dt > 0) {
        rx_sec = Math.max(0, (iface.rx_bytes - lastNetStats.rx) / dt);
        tx_sec = Math.max(0, (iface.tx_bytes - lastNetStats.tx) / dt);
      }
    }
    lastNetStats = { rx: iface.rx_bytes, tx: iface.tx_bytes, ts: now };
  }

  const tempVal = temps.status === "fulfilled" ? temps.value : null;
  const cpuTemp = tempVal?.main && tempVal.main > 0 ? tempVal.main : null;
  const gpuTempFallback = (tempVal as any)?.gpu && (tempVal as any).gpu > 0 ? (tempVal as any).gpu : null;

  const procVal = procs.status === "fulfilled" ? procs.value : null;

  // GPU — use cached value (refreshes on its own interval)
  const gpu = await pollGpu();
  const gpuTemp = gpu.tempC ?? gpuTempFallback;

  // Disk I/O — si.disksIO() on Linux reads /proc/diskstats
  // systeminformation's built-in *_sec fields are null when there's no prior internal snapshot
  // (first call) or when the container kernel doesn't expose them. We compute deltas ourselves
  // from the cumulative rIO/wIO (sectors) and ms (ms busy) fields.
  //
  // Linux /proc/diskstats: sectors are 512 bytes each.
  // ms = cumulative ms the disk was active → delta ms / delta_t_ms * 100 = busy %
  // rIO = cumulative sectors read → delta * 512 / 1024 / dt_s = read KB/s
  let disk: DiskTelemetry = { activeTimePct: null, readKBps: null, writeKBps: null, available: false };
  if (diskIo.status === "fulfilled" && diskIo.value) {
    const d = diskIo.value as any;
    const now = Date.now();

    const rIO: number | null  = typeof d.rIO  === "number" ? d.rIO  : null;
    const wIO: number | null  = typeof d.wIO  === "number" ? d.wIO  : null;
    const msTotal: number | null = typeof d.ms === "number" ? d.ms  : null;

    // si-native per-second rates — systeminformation computes these internally
    // when it has a prior snapshot. tIO_sec (total IO time/sec) is the Windows
    // equivalent of Linux ms_sec. We accept any of them.
    const rSec: number | null  = typeof d.rIO_sec === "number" ? d.rIO_sec : null;
    const wSec: number | null  = typeof d.wIO_sec === "number" ? d.wIO_sec : null;
    const msSec: number | null = typeof d.ms_sec  === "number" ? d.ms_sec
                               : typeof d.tIO_sec  === "number" ? d.tIO_sec
                               : null;

    // ── Strategy: try in order of reliability ────────────────────────────────
    //  A) si-native per-second rates   → most accurate, works from 2nd call
    //  B) our own cumulative delta      → reliable when A is unavailable
    //  C) zero baseline                 → always produce a value when disk exists
    //     so the frontend can show the line (it will be at 0% when idle, which is correct)

    let computed = false;

    // A: si-native rates available (non-null and have had a prior si snapshot)
    if (!computed && rSec != null && wSec != null) {
      disk.readKBps    = parseFloat((rSec / 2).toFixed(1));
      disk.writeKBps   = parseFloat((wSec / 2).toFixed(1));
      disk.activeTimePct = msSec != null && msSec >= 0
        ? parseFloat(Math.min(msSec / 10, 100).toFixed(1))
        : parseFloat(Math.min((rSec + wSec) / 50, 100).toFixed(1));
      disk.available = true;
      computed = true;
      if (!diskAvailableConfirmed) {
        diskAvailableConfirmed = true;
        console.log(`[DiskTelemetry] Confirmed via si-native rates: activeTime=${disk.activeTimePct}% R=${disk.readKBps}KB/s W=${disk.writeKBps}KB/s`);
      }
    }

    // B: cumulative delta computation
    if (!computed && lastDiskSnapshot && rIO != null && wIO != null) {
      const dt_s = (now - lastDiskSnapshot.ts) / 1000;
      if (dt_s > 0.1) {
        const deltaR = Math.max(0, rIO - lastDiskSnapshot.rIO);
        const deltaW = Math.max(0, wIO - lastDiskSnapshot.wIO);
        disk.readKBps  = parseFloat((deltaR / dt_s / 2).toFixed(1));
        disk.writeKBps = parseFloat((deltaW / dt_s / 2).toFixed(1));

        if (msSec != null && msSec >= 0) {
          disk.activeTimePct = parseFloat(Math.min(msSec / 10, 100).toFixed(1));
        } else if (msTotal != null && msTotal > 0 && lastDiskSnapshot.ms != null) {
          const deltaMs = Math.max(0, msTotal - lastDiskSnapshot.ms);
          disk.activeTimePct = parseFloat(Math.min((deltaMs / (dt_s * 1000)) * 100, 100).toFixed(1));
        } else {
          const combined = (disk.readKBps ?? 0) + (disk.writeKBps ?? 0);
          disk.activeTimePct = parseFloat(Math.min(combined / 100, 100).toFixed(1));
        }
        disk.available = true;
        computed = true;
        if (!diskAvailableConfirmed) {
          diskAvailableConfirmed = true;
          console.log(`[DiskTelemetry] Confirmed via delta: activeTime=${disk.activeTimePct}% R=${disk.readKBps}KB/s W=${disk.writeKBps}KB/s`);
        }
      }
    }

    // C: disk IO object exists but rates not ready yet (first call / too fast).
    //    Emit a real zero baseline so the frontend series is visible immediately.
    if (!computed && (rIO != null || rSec != null)) {
      disk.readKBps    = 0;
      disk.writeKBps   = 0;
      disk.activeTimePct = 0;
      disk.available   = true;
      if (!diskAvailableConfirmed) {
        console.log("[DiskTelemetry] First call — emitting zero baseline, real rates follow next tick");
      }
    }

    // Update snapshot for next delta
    if (rIO != null && wIO != null) {
      lastDiskSnapshot = { rIO, wIO, ms: msTotal ?? 0, ts: now };
    }

    if (!disk.available && !diskUnavailableLogged) {
      diskUnavailableLogged = true;
      console.log("[DiskTelemetry] disksIO returned no usable fields. Raw keys:", Object.keys(d).join(","));
    }

    console.log(`[DiskTelemetry] tick: available=${disk.available} activeTimePct=${disk.activeTimePct} R=${disk.readKBps} W=${disk.writeKBps} (rSec=${rSec} wSec=${wSec} msSec=${msSec} rIO=${rIO} wIO=${wIO})`);
  } else if (diskIo.status === "rejected" && !diskUnavailableLogged) {
    diskUnavailableLogged = true;
    console.log("[DiskTelemetry] disksIO failed:", (diskIo as PromiseRejectedResult).reason?.message ?? "unknown");
  }

  const snapshot: TelemetrySnapshot = {
    ts: Date.now(),
    status: "ready",
    cpu: { load: parseFloat(cpuLoad.toFixed(1)), speed: parseFloat(cpuSpeed.toFixed(2)), cores: 0 },
    ram: { totalGB: parseFloat(totalGB.toFixed(2)), usedGB: parseFloat(usedGB.toFixed(2)), usedPercent: parseFloat(usedPercent.toFixed(1)) },
    network: { rx_sec: Math.round(rx_sec), tx_sec: Math.round(tx_sec), latency_ms: 0 },
    temps: { cpu: cpuTemp, gpu: gpuTemp },
    gpu,
    disk,
    processes: { running: procVal?.running ?? 0, total: procVal?.all ?? 0 },
    load_trend: trend,
  };

  cachedSnapshot = snapshot;
  return snapshot;
}

// ── Cache access ─────────────────────────────────────────────────────────────

export function getCachedSnapshot(): TelemetrySnapshot {
  if (cachedSnapshot) return cachedSnapshot;
  // Return a loading placeholder until first poll completes
  return {
    ts: Date.now(),
    status: "loading",
    cpu: { load: 0, speed: 0, cores: 0 },
    ram: { totalGB: 0, usedGB: 0, usedPercent: 0 },
    network: { rx_sec: 0, tx_sec: 0, latency_ms: 0 },
    temps: { cpu: null, gpu: null },
    gpu: { load: null, vramUsedMb: null, vramTotalMb: null, vramPercent: null, tempC: null, clockMhz: null, name: null },
    disk: { activeTimePct: null, readKBps: null, writeKBps: null, available: false },
    processes: { running: 0, total: 0 },
    load_trend: "stable",
  };
}

// ── Background polling — starts at server boot ───────────────────────────────

export function startTelemetryPolling(intervalMs = 1000): void {
  if (pollingTimer) return; // already running

  // Fire immediately so cache is warm before first client connects
  getSnapshot().catch(() => {});

  pollingTimer = setInterval(() => {
    getSnapshot().catch(() => {});
  }, intervalMs);

  console.log(`[Telemetry] Background polling started (${intervalMs}ms interval)`);
}

export function stopTelemetryPolling(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

// ── System specs (unchanged) ─────────────────────────────────────────────────

export async function getSystemSpecs() {
  const [cpu, mem, os, gpu, disk] = await Promise.allSettled([
    si.cpu(),
    si.mem(),
    si.osInfo(),
    si.graphics(),
    si.diskLayout(),
  ]);

  return {
    cpu: cpu.status === "fulfilled" ? {
      model: cpu.value.brand,
      cores: cpu.value.physicalCores,
      threads: cpu.value.cores,
      speed: cpu.value.speed + "GHz",
    } : { model: "Unknown", cores: 0, threads: 0, speed: "?" },
    ram: mem.status === "fulfilled" ? {
      totalGB: parseFloat((mem.value.total / 1024 / 1024 / 1024).toFixed(1)),
      usedGB: parseFloat((mem.value.used / 1024 / 1024 / 1024).toFixed(1)),
      freeGB: parseFloat((mem.value.available / 1024 / 1024 / 1024).toFixed(1)),
    } : { totalGB: 0, usedGB: 0, freeGB: 0 },
    gpu: gpu.status === "fulfilled" && gpu.value.controllers.length > 0 ? {
      model: gpu.value.controllers[0].model,
      vendor: gpu.value.controllers[0].vendor,
      vramGB: parseFloat(((gpu.value.controllers[0].vram ?? 0) / 1024).toFixed(1)),
    } : { model: "Unknown", vendor: "Unknown", vramGB: 0 },
    system: os.status === "fulfilled" ? {
      os: os.value.distro ?? os.value.platform,
      osVersion: os.value.release,
      arch: os.value.arch,
      hostname: os.value.hostname,
    } : { os: "Unknown", osVersion: "", arch: "", hostname: "" },
    disk: disk.status === "fulfilled" && disk.value.length > 0 ? {
      name: disk.value[0].name,
      type: disk.value[0].type,
      size: parseFloat((disk.value[0].size / 1024 / 1024 / 1024).toFixed(1)),
    } : { name: "Unknown", type: "Unknown", size: 0 },
  };
}
