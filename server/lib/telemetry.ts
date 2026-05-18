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
  activeTimePct: number | null;
  readKBps: number | null;
  writeKBps: number | null;
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

// ── Scheduler stats (exposed for debugging) ──────────────────────────────────

export interface SchedulerStats {
  appCpuPct: number;
  lowEndMode: boolean;
  tickCount: number;
  skippedTicks: number;
  intervalMs: number;
  taskTimings: Record<string, { lastDurationMs: number; lastRunTs: number }>;
}

// ── Scheduler constants ───────────────────────────────────────────────────────

const POLL_BASE_MS    = 2000;   // normal loop interval
const POLL_LOW_END_MS = 15000;  // low-end / budget-exceeded mode
const CPU_TEMP_TTL_MS = 8000;   // si.cpuTemperature() — expensive WMI-style call
const DISK_IO_TTL_MS  = 4000;   // si.disksIO()
const GPU_TTL_MS      = 8000;   // si.graphics()
const PROC_TTL_MS     = 30000;  // si.processes() — very expensive
const CPU_BUDGET_PCT  = 5;      // skip heavy tasks when app itself exceeds this %

// ── Module-level state ────────────────────────────────────────────────────────

let cachedSnapshot: TelemetrySnapshot | null = null;
let pollingLoop: NodeJS.Timeout | null = null;  // holds a 0-ms kickoff timer ref
let loopActive = false;

// Per-task last-run timestamps
let lastCpuTempTs  = 0;
let lastDiskIoTs   = 0;
let lastGpuTs      = 0;
let lastProcTs     = 0;

// Per-task cached values — survive between ticks
let cachedCpuTemp: number | null = null;
let cachedDisk: DiskTelemetry = { activeTimePct: null, readKBps: null, writeKBps: null, available: false };
let cachedGpu: GpuTelemetry = {
  load: null, vramUsedMb: null, vramTotalMb: null,
  vramPercent: null, tempC: null, clockMhz: null, name: null,
};
let cachedProcs: { running: number; total: number } = { running: 0, total: 0 };

// Disk delta tracking
let diskAvailableConfirmed = false;
let diskUnavailableLogged = false;
let lastDiskSnapshot: { rIO: number; wIO: number; ms: number; ts: number } | null = null;

// CPU load history for trend
let lastLoad = 0;
let lastNetStats: { rx: number; tx: number; ts: number } | null = null;
const LOAD_HISTORY: number[] = [];

// Low-end mode state
let lowEndMode = false;
let coreCountKnown = false;

// CPU budget tracking via process.cpuUsage()
let lastProcCpuUsage = process.cpuUsage();
let lastProcCpuTs = Date.now();
let appCpuPct = 0;

// Scheduler performance counters
let tickCount = 0;
let skippedTicks = 0;
const taskTimings: Record<string, { lastDurationMs: number; lastRunTs: number }> = {};

// Throttle over-budget log to once per 30 seconds
let lastOverBudgetLogTs = 0;
// Network stats TTL — don't poll every tick
let lastNetTs = 0;

// ── GPU controller selection ──────────────────────────────────────────────────

const DISCRETE_VENDORS = ["nvidia", "amd", "radeon", "geforce", "rx ", "rtx ", "gtx "];

function selectActiveController(controllers: any[]): any | null {
  if (!controllers.length) return null;
  if (controllers.length === 1) return controllers[0];
  const discrete = controllers.find(c => {
    const sig = `${c.vendor ?? ""} ${c.model ?? ""}`.toLowerCase();
    return DISCRETE_VENDORS.some(d => sig.includes(d)) && (c.vram ?? 0) > 0;
  });
  if (discrete) return discrete;
  const withVram = controllers.filter(c => (c.vram ?? 0) > 0);
  if (withVram.length) return withVram.sort((a, b) => (b.vram ?? 0) - (a.vram ?? 0))[0];
  return controllers[0];
}

// ── App CPU measurement ───────────────────────────────────────────────────────

function measureAppCpu(): number {
  const now = Date.now();
  const usage = process.cpuUsage(lastProcCpuUsage);
  const elapsedUs = (now - lastProcCpuTs) * 1000; // ms → µs
  if (elapsedUs > 0) {
    appCpuPct = Math.min(100, ((usage.user + usage.sys) / elapsedUs) * 100);
  }
  lastProcCpuUsage = process.cpuUsage();
  lastProcCpuTs = now;
  return appCpuPct;
}

// ── Task timing helper ────────────────────────────────────────────────────────

async function runTimed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    const dur = Date.now() - t0;
    taskTimings[name] = { lastDurationMs: dur, lastRunTs: t0 };
  }
}

// ── Disk delta computation ────────────────────────────────────────────────────

function computeDisk(diskIo: any): DiskTelemetry {
  const disk: DiskTelemetry = { activeTimePct: null, readKBps: null, writeKBps: null, available: false };
  if (!diskIo) return disk;
  const d = diskIo as any;
  const now = Date.now();
  const rIO: number | null = typeof d.rIO === "number" ? d.rIO : null;
  const wIO: number | null = typeof d.wIO === "number" ? d.wIO : null;
  const msTotal: number | null = typeof d.ms === "number" ? d.ms : null;
  const rSec: number | null = typeof d.rIO_sec === "number" ? d.rIO_sec : null;
  const wSec: number | null = typeof d.wIO_sec === "number" ? d.wIO_sec : null;
  const msSec: number | null = typeof d.ms_sec === "number" ? d.ms_sec
                              : typeof d.tIO_sec === "number" ? d.tIO_sec : null;
  let computed = false;
  if (!computed && rSec != null && wSec != null) {
    disk.readKBps = parseFloat((rSec / 2).toFixed(1));
    disk.writeKBps = parseFloat((wSec / 2).toFixed(1));
    disk.activeTimePct = msSec != null && msSec >= 0
      ? parseFloat(Math.min(msSec / 10, 100).toFixed(1))
      : parseFloat(Math.min((rSec + wSec) / 50, 100).toFixed(1));
    disk.available = true;
    computed = true;
    if (!diskAvailableConfirmed) {
      diskAvailableConfirmed = true;
      console.log(`[DiskTelemetry] Confirmed via si-native rates: R=${disk.readKBps}KB/s W=${disk.writeKBps}KB/s`);
    }
  }
  if (!computed && lastDiskSnapshot && rIO != null && wIO != null) {
    const dt_s = (now - lastDiskSnapshot.ts) / 1000;
    if (dt_s > 0.1) {
      const deltaR = Math.max(0, rIO - lastDiskSnapshot.rIO);
      const deltaW = Math.max(0, wIO - lastDiskSnapshot.wIO);
      disk.readKBps = parseFloat((deltaR / dt_s / 2).toFixed(1));
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
        console.log(`[DiskTelemetry] Confirmed via delta: R=${disk.readKBps}KB/s W=${disk.writeKBps}KB/s`);
      }
    }
  }
  if (!computed && (rIO != null || rSec != null)) {
    disk.readKBps = 0;
    disk.writeKBps = 0;
    disk.activeTimePct = 0;
    disk.available = true;
  }
  if (rIO != null && wIO != null) {
    lastDiskSnapshot = { rIO, wIO, ms: msTotal ?? 0, ts: now };
  }
  if (!disk.available && !diskUnavailableLogged) {
    diskUnavailableLogged = true;
    console.log("[DiskTelemetry] disksIO returned no usable fields. Raw keys:", Object.keys(d).join(","));
  }
  return disk;
}

// ── Tick — one iteration of the scheduler loop ────────────────────────────────

async function tick(): Promise<void> {
  tickCount++;
  const now = Date.now();

  // ── 1. Measure app CPU budget ─────────────────────────────────────────────
  const currentAppCpu = measureAppCpu();
  const overBudget = currentAppCpu > CPU_BUDGET_PCT;
  if (overBudget) {
    skippedTicks++;
    if (Date.now() - lastOverBudgetLogTs > 30000) {
      lastOverBudgetLogTs = Date.now();
      console.log(`[Telemetry:sched] Over budget (app=${currentAppCpu.toFixed(1)}%) — skipping heavy tasks`);
    }
  }

  // ── 2. Lightweight tasks — always run, all fast ───────────────────────────
  // Network stats run every 6 s (normal) / 10 s (low-end) to cut idle CPU cost.
  const netTtl = lowEndMode ? 10000 : 6000;
  const shouldPollNet = (now - lastNetTs) >= netTtl;
  const [loadRes, memRes, netRes] = await runTimed("lightweight", () =>
    Promise.all([
      si.currentLoad().catch(() => null),
      si.mem().catch(() => null),
      shouldPollNet ? si.networkStats().catch(() => null) : Promise.resolve(null),
    ])
  );
  if (shouldPollNet) lastNetTs = now;

  // CPU load & trend
  const cpuLoad = loadRes?.currentLoad ?? lastLoad;
  const cpuSpeed = (loadRes as any)?.cpuCurrentSpeed ?? 0;
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

  // Low-end mode: detect from core count (once) and sustained load
  if (!coreCountKnown && loadRes?.cpus?.length) {
    coreCountKnown = true;
    const cores = loadRes.cpus.length;
    if (cores <= 4) {
      lowEndMode = true;
      console.log(`[Telemetry:sched] Low-end mode ENABLED — ${cores} logical cores detected`);
    }
  }
  if (!lowEndMode && LOAD_HISTORY.length >= 5) {
    const avg = LOAD_HISTORY.reduce((a, b) => a + b, 0) / LOAD_HISTORY.length;
    if (avg > 50) {
      lowEndMode = true;
      console.log(`[Telemetry:sched] Low-end mode ENABLED — sustained CPU avg ${avg.toFixed(0)}%`);
    }
  } else if (lowEndMode && LOAD_HISTORY.length >= 5) {
    const avg = LOAD_HISTORY.reduce((a, b) => a + b, 0) / LOAD_HISTORY.length;
    if (avg < 35) {
      lowEndMode = false;
      console.log(`[Telemetry:sched] Low-end mode DISABLED — sustained CPU avg ${avg.toFixed(0)}%`);
    }
  }

  // RAM — si.mem() returns bytes; convert to GB
  const totalBytes = memRes ? memRes.total : 0;
  const usedBytes  = memRes ? memRes.used  : 0;
  const totalGB = totalBytes / 1073741824;
  const usedGB  = usedBytes  / 1073741824;
  const usedPercent = totalGB > 0 ? (usedGB / totalGB) * 100 : 0;
  // Defensive: never emit 0/0 when we have real RAM installed
  const safeTotalGB = totalGB > 0 ? totalGB : 0;
  const safeUsedGB  = usedGB  > 0 ? usedGB  : 0;

  // Network — systeminformation already computes differential rx_sec / tx_sec
  let rx_sec = 0;
  let tx_sec = 0;
  if (netRes && netRes.length > 0) {
    // Pick best physical interface: skip loopback/virtual, prefer highest traffic
    const iface = netRes
      .filter((n: any) => !/loopback|lo|tun|vpn|veth|docker|vmware|hyper-v/i.test(n.iface || ''))
      .sort((a: any, b: any) => (b.rx_bytes + b.tx_bytes) - (a.rx_bytes + a.tx_bytes))[0]
      ?? netRes[0];
    // Use systeminformation's pre-computed per-second rates (they work from first call)
    rx_sec = Math.max(0, iface.rx_sec ?? 0);
    tx_sec = Math.max(0, iface.tx_sec ?? 0);
  }

  // ── 3. Heavy task rotation — ONE at a time, ONE per tick ─────────────────
  // Priority order: cpuTemp → disk → GPU → processes
  // Each has its own TTL. In low-end mode disks are disabled; all TTLs extend.
  // Over-budget ticks skip ALL heavy tasks.

  if (!overBudget) {
    const tempTtl  = lowEndMode ? CPU_TEMP_TTL_MS * 2 : CPU_TEMP_TTL_MS;
    const diskTtl  = lowEndMode ? Infinity            : DISK_IO_TTL_MS;
    const gpuTtl   = lowEndMode ? GPU_TTL_MS  * 2    : GPU_TTL_MS;
    const procTtl  = PROC_TTL_MS;

    if (now - lastCpuTempTs > tempTtl) {
      // Task 1: CPU temperature
      const raw = await runTimed("cpuTemp", () => si.cpuTemperature().catch(() => null));
      cachedCpuTemp = raw?.main && raw.main > 0 ? raw.main : cachedCpuTemp;
      lastCpuTempTs = Date.now();

    } else if (now - lastDiskIoTs > diskTtl && !lowEndMode) {
      // Task 2: Disk I/O
      const raw = await runTimed("diskIO", () => si.disksIO().catch(() => null));
      cachedDisk = computeDisk(raw);
      lastDiskIoTs = Date.now();

    } else if (now - lastGpuTs > gpuTtl) {
      // Task 3: GPU
      const raw = await runTimed("gpu", async () => {
        const gfx = await si.graphics().catch(() => null);
        if (!gfx) return null;
        const ctrl = selectActiveController(gfx.controllers);
        if (!ctrl) return null;
        const vramTotal = (ctrl as any).vramDynamic
          ? ((ctrl as any).memoryTotal ?? ctrl.vram ?? 0)
          : (ctrl.vram ?? 0);
        const vramUsed: number | null = (ctrl as any).memoryUsed ?? null;
        const vramPct: number | null =
          vramUsed != null && vramTotal > 0
            ? parseFloat(((vramUsed / vramTotal) * 100).toFixed(1))
            : null;
        return {
          load: (ctrl as any).utilizationGpu ?? null,
          vramUsedMb: vramUsed,
          vramTotalMb: vramTotal > 0 ? vramTotal : null,
          vramPercent: vramPct,
          tempC: (ctrl as any).temperatureGpu ?? null,
          clockMhz: (ctrl as any).clockCore ?? null,
          name: ctrl.model ?? null,
        } as GpuTelemetry;
      });
      if (raw) cachedGpu = raw;
      lastGpuTs = Date.now();

    } else if (now - lastProcTs > procTtl) {
      // Task 4: processes (least urgent)
      const raw = await runTimed("processes", () => si.processes().catch(() => null));
      if (raw) cachedProcs = { running: raw.running ?? 0, total: raw.all ?? 0 };
      lastProcTs = Date.now();
    }
  }

  // ── 4. Assemble snapshot from all caches ──────────────────────────────────
  const snapshot: TelemetrySnapshot = {
    ts: Date.now(),
    status: "ready",
    cpu: {
      load: parseFloat(cpuLoad.toFixed(1)),
      speed: parseFloat(cpuSpeed.toFixed(2)),
      cores: loadRes?.cpus?.length ?? 0,
    },
    ram: {
      totalGB: parseFloat(safeTotalGB.toFixed(2)),
      usedGB: parseFloat(safeUsedGB.toFixed(2)),
      usedPercent: parseFloat(usedPercent.toFixed(1)),
    },
    network: {
      rx_sec: Math.round(rx_sec),
      tx_sec: Math.round(tx_sec),
      latency_ms: 0,
    },
    temps: {
      cpu: cachedCpuTemp,
      gpu: cachedGpu.tempC,
    },
    gpu: cachedGpu,
    disk: cachedDisk,
    processes: cachedProcs,
    load_trend: trend,
  };

  cachedSnapshot = snapshot;
}

// ── Async scheduler loop ──────────────────────────────────────────────────────

async function schedulerLoop(): Promise<void> {
  while (loopActive) {
    const t0 = Date.now();
    try {
      await tick();
    } catch (e: any) {
      console.error("[Telemetry:sched] tick error:", e?.message ?? e);
    }
    // Sleep until next tick — adjust for low-end mode
    const targetMs = lowEndMode ? POLL_LOW_END_MS : POLL_BASE_MS;
    const elapsed = Date.now() - t0;
    const sleep = Math.max(0, targetMs - elapsed);
    if (sleep > 0) await new Promise<void>(r => setTimeout(r, sleep));
  }
}

// ── Cache access ──────────────────────────────────────────────────────────────

export function getCachedSnapshot(): TelemetrySnapshot {
  if (cachedSnapshot) return cachedSnapshot;
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

// getSnapshot: return the current cached snapshot without forcing a tick.
// The scheduler loop maintains the cache on its own cadence.
export async function getSnapshot(): Promise<TelemetrySnapshot> {
  if (cachedSnapshot) return cachedSnapshot;
  return getCachedSnapshot();
}

// refreshRamNow: force a fresh si.mem() read and patch the cached snapshot.
// Called immediately after a memory clean so the WebSocket broadcast reflects
// the post-clean RAM value without waiting for the next scheduler tick.
export async function refreshRamNow(): Promise<void> {
  try {
    const memRes = await si.mem().catch(() => null);
    if (!memRes || !cachedSnapshot) return;
    const totalBytes = memRes.total;
    const usedBytes  = memRes.used;
    const totalGB    = totalBytes / 1073741824;
    const usedGB     = usedBytes  / 1073741824;
    const usedPercent = totalGB > 0 ? (usedGB / totalGB) * 100 : 0;
    cachedSnapshot = {
      ...cachedSnapshot,
      ts: Date.now(),
      ram: {
        totalGB:    parseFloat(totalGB.toFixed(2)),
        usedGB:     parseFloat(usedGB.toFixed(2)),
        usedPercent: parseFloat(usedPercent.toFixed(1)),
      },
    };
  } catch (e: any) {
    console.warn("[Telemetry] refreshRamNow error:", e?.message);
  }
}

// ── Scheduler stats ───────────────────────────────────────────────────────────

export function getSchedulerStats(): SchedulerStats {
  return {
    appCpuPct: parseFloat(appCpuPct.toFixed(2)),
    lowEndMode,
    tickCount,
    skippedTicks,
    intervalMs: lowEndMode ? POLL_LOW_END_MS : POLL_BASE_MS,
    taskTimings: { ...taskTimings },
  };
}

// ── Start / Stop ──────────────────────────────────────────────────────────────

export function startTelemetryPolling(_intervalMs = 2000): void {
  if (loopActive) return;
  loopActive = true;

  // Prime the differential APIs (currentLoad, networkStats, disksIO return 0 on first call)
  Promise.allSettled([
    si.currentLoad(),
    si.networkStats(),
    si.disksIO(),
  ]).then(() => {
    // After priming, run first tick immediately then hand off to loop
    tick().catch(() => {}).finally(() => {
      schedulerLoop().catch(() => {});
    });
  });

  console.log("[Telemetry] Scheduler started — base=2s, low-end=6s, budget=5%");
}

export function stopTelemetryPolling(): void {
  loopActive = false;
  if (pollingLoop) {
    clearTimeout(pollingLoop);
    pollingLoop = null;
  }
}

// ── System specs (unchanged) ──────────────────────────────────────────────────

/** Race a systeminformation call against a timeout so the endpoint never hangs. */
function siWithTimeout<T>(fn: () => Promise<T>, ms = 5_000, label = 'si call'): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function getSystemSpecs() {
  const [cpu, mem, os, gpu, disk] = await Promise.allSettled([
    siWithTimeout(() => si.cpu(), 5_000, 'si.cpu()').catch(() => { throw new Error('cpu timeout'); }),
    siWithTimeout(() => si.mem(), 5_000, 'si.mem()').catch(() => { throw new Error('mem timeout'); }),
    siWithTimeout(() => si.osInfo(), 5_000, 'si.osInfo()').catch(() => { throw new Error('osInfo timeout'); }),
    siWithTimeout(() => si.graphics(), 5_000, 'si.graphics()').catch(() => { throw new Error('graphics timeout'); }),
    siWithTimeout(() => si.diskLayout(), 5_000, 'si.diskLayout()').catch(() => { throw new Error('diskLayout timeout'); }),
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
