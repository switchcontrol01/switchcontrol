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

// Module-level cache — populated immediately at startup
let cachedSnapshot: TelemetrySnapshot | null = null;
let pollingTimer: NodeJS.Timeout | null = null;

// GPU cache polled less frequently (every 3s) since graphics() is expensive
let cachedGpu: GpuTelemetry = {
  load: null, vramUsedMb: null, vramTotalMb: null,
  vramPercent: null, tempC: null, clockMhz: null, name: null,
};
let lastGpuPollTs = 0;
const GPU_POLL_INTERVAL_MS = 3000;

// ── GPU polling ──────────────────────────────────────────────────────────────

async function pollGpu(): Promise<GpuTelemetry> {
  const now = Date.now();
  if (now - lastGpuPollTs < GPU_POLL_INTERVAL_MS) return cachedGpu;

  try {
    const gfx = await si.graphics();
    const ctrl = gfx.controllers.find(c => c.vram && c.vram > 0) ?? gfx.controllers[0];
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
  const [load, mem, nets, temps, procs] = await Promise.allSettled([
    si.currentLoad(),
    si.mem(),
    si.networkStats(),
    si.cpuTemperature(),
    si.processes(),
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

  const snapshot: TelemetrySnapshot = {
    ts: Date.now(),
    status: "ready",
    cpu: { load: parseFloat(cpuLoad.toFixed(1)), speed: parseFloat(cpuSpeed.toFixed(2)), cores: 0 },
    ram: { totalGB: parseFloat(totalGB.toFixed(2)), usedGB: parseFloat(usedGB.toFixed(2)), usedPercent: parseFloat(usedPercent.toFixed(1)) },
    network: { rx_sec: Math.round(rx_sec), tx_sec: Math.round(tx_sec), latency_ms: 0 },
    temps: { cpu: cpuTemp, gpu: gpuTemp },
    gpu,
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
