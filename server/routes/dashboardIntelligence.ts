import { Router } from "express";
import { getCachedSnapshot } from "../lib/telemetry";
import si from "systeminformation";

const router = Router();

// ── Server-side caches for expensive routes ───────────────────────────────────
// /ram-analysis:        calls si.mem() + si.processes() — 8s TTL
// /what-caused-that:    calls si.processes()             — 8s TTL
// /display-signal:      calls si.graphics()              — 60s TTL

const RAM_ANALYSIS_TTL       = 8_000;
const WHAT_CAUSED_THAT_TTL   = 8_000;
const DISPLAY_SIGNAL_TTL     = 60_000;

let ramAnalysisCache:      { data: any; ts: number } | null = null;
let whatCausedThatCache:   { data: any; ts: number } | null = null;
let displaySignalCache:    { data: any; ts: number } | null = null;

// ── Stability / Instability score ──────────────────────────────────────────────

router.get("/instability", (_req, res) => {
  try {
    const snap = getCachedSnapshot();
    const cpuLoad  = snap.cpu.load;
    const ramPct   = snap.ram.usedPercent;
    const procs    = snap.processes.total;
    const netKbs   = (snap.network.rx_sec + snap.network.tx_sec) / 1024;

    let score = 100;

    // RAM penalty (0–35)
    if      (ramPct > 93) score -= 35;
    else if (ramPct > 88) score -= 27;
    else if (ramPct > 80) score -= 18;
    else if (ramPct > 70) score -= 9;
    else if (ramPct > 60) score -= 4;

    // CPU penalty (0–25)
    if      (cpuLoad > 88) score -= 25;
    else if (cpuLoad > 72) score -= 18;
    else if (cpuLoad > 55) score -= 10;
    else if (cpuLoad > 38) score -= 4;

    // Process count penalty (0–12)
    if      (procs > 350) score -= 12;
    else if (procs > 250) score -= 8;
    else if (procs > 175) score -= 4;

    // Load trend penalty (0–10)
    if (snap.load_trend === "rising" && cpuLoad > 25) score -= 10;
    else if (snap.load_trend === "rising")            score -= 4;
    else if (snap.load_trend === "falling")           score -= 1;

    // Network spike (0–5)
    if (netKbs > 8000) score -= 5;
    else if (netKbs > 3000) score -= 2;

    score = Math.max(20, Math.min(100, Math.round(score)));

    const state =
      score >= 85 ? "stable" :
      score >= 65 ? "minor_pressure" :
      score >= 45 ? "unstable" : "severe";

    const stateLabel =
      score >= 85 ? "Stable" :
      score >= 65 ? "Minor Pressure" :
      score >= 45 ? "Unstable" : "Severe";

    // Primary source
    let source = "none";
    let sourceDetail = "System running within normal parameters.";

    if (ramPct > 85) {
      source = "memory";
      sourceDetail = `RAM at ${ramPct.toFixed(0)}% — OS paging likely active`;
    } else if (cpuLoad > 68) {
      source = "cpu";
      sourceDetail = `CPU at ${cpuLoad.toFixed(0)}% — scheduling contention possible`;
    } else if (procs > 280) {
      source = "processes";
      sourceDetail = `${procs} active processes — background overhead elevated`;
    } else if (snap.load_trend === "rising" && cpuLoad > 25) {
      source = "trend";
      sourceDetail = "Load rising — system demand is building";
    } else if (netKbs > 3000) {
      source = "network";
      sourceDetail = `${(netKbs / 1024).toFixed(1)} MB/s background network — update or sync activity`;
    }

    res.json({
      score,
      state,
      stateLabel,
      source,
      sourceDetail,
      metrics: {
        cpuLoad: parseFloat(cpuLoad.toFixed(1)),
        ramPct:  parseFloat(ramPct.toFixed(1)),
        processCount: procs,
        loadTrend: snap.load_trend,
        networkKbs: parseFloat(netKbs.toFixed(0)),
      },
      ts: Date.now(),
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to compute instability" });
  }
});

// ── What just caused that? ────────────────────────────────────────────────────
//
// Real attribution engine — calls si.processes() live, Windows-aware.
//
// Named group detection (in priority order):
//   1. powershell burst        → Tweak Verification Activity
//   2. Windows Defender        → Antivirus Scan (MsMpEng / MpCopyAccelerator)
//   3. Windows Update          → Windows Update Activity (TiWorker / TrustedInstaller)
//   4. Search / Indexer        → File Indexing (SearchIndexer / SearchProtocolHost)
//   5. WSL / Hyper-V           → VM / Subsystem Activity (vmmem / vmwp)
//   6. SwitchControl backend   → Backend Analysis Activity
//   7. Renderer / GPU          → UI / Renderer Workload
//   8. RAM pressure            → Memory Pressure
//   9. Network burst           → Background Network Transfer
//  10. Game platforms / overlays → Gaming Platform Overhead (Steam / EA / NVIDIA)
//  11. Browser                 → Browser Activity (Chrome / Edge / Firefox)
//  12. Any external process    → External Process Spike (threshold: pcpu > 2%)
//  13. CPU elevated, spread    → Distributed Background Load (show real proc list)
//  14. nothing elevated        → No significant anomaly

router.get("/what-caused-that", async (req, res) => {
  // Allow explicit cache-bust (?bust or ?t=...) from "Analyze Again" button
  const forceFresh = !!(req.query.bust || req.query.t);
  if (!forceFresh && whatCausedThatCache && (Date.now() - whatCausedThatCache.ts) < WHAT_CAUSED_THAT_TTL) {
    return res.json(whatCausedThatCache.data);
  }

  try {
    const snap    = getCachedSnapshot();
    const cpuLoad = snap.cpu.load;
    const ramPct  = snap.ram.usedPercent;
    const procs   = snap.processes.total;
    const netKbs  = (snap.network.rx_sec + snap.network.tx_sec) / 1024;

    // ── Live per-process attribution ──────────────────────────────────────────

    interface ProcRow { name: string; pid: number; pcpu: number; memRss: number }
    let procList: ProcRow[] = [];
    try {
      const siProcs = await si.processes();
      procList = siProcs.list
        .filter((p: any) => typeof p.pcpu === "number" && p.pcpu >= 0)
        .map((p: any) => ({
          name:   String(p.name ?? "unknown").toLowerCase().replace(/\.exe$/i, ""),
          pid:    p.pid ?? 0,
          pcpu:   p.pcpu,
          memRss: p.memRss ?? 0,
        }));
    } catch (_) {}

    // Helper: sum CPU of all procs matching any of the given name fragments
    const groupCpu = (...frags: string[]) =>
      procList.filter(p => frags.some(f => p.name.includes(f)))
              .reduce((s, p) => s + p.pcpu, 0);

    const groupTop = (...frags: string[]) =>
      procList.filter(p => frags.some(f => p.name.includes(f)))
              .sort((a, b) => b.pcpu - a.pcpu)[0] ?? null;

    // PowerShell instances
    const psProcs   = procList.filter(p => p.name.startsWith("powershell"));
    const psCount   = psProcs.length;
    const topPsProc = psProcs.sort((a, b) => b.pcpu - a.pcpu)[0] ?? null;

    // Top 6 CPU processes (exclude idle/system placeholders)
    const topCpuProcs = [...procList]
      .filter(p => !["idle", "system idle process", ""].includes(p.name))
      .sort((a, b) => b.pcpu - a.pcpu)
      .slice(0, 6);

    // Combined CPU explained by top 6 processes
    const top6Sum = topCpuProcs.reduce((s, p) => s + p.pcpu, 0);

    // SwitchControl backend: node / electron main
    const backendProcs  = procList.filter(p =>
      p.name.includes("node") || p.name === "electron" || p.name.includes("switchcontrol")
    );
    const backendMaxCpu = backendProcs.reduce((m, p) => Math.max(m, p.pcpu), 0);
    const hotBackend    = backendProcs.find(p => p.pcpu === backendMaxCpu) ?? null;

    // Renderer / GPU (Electron helpers)
    const rendererProcs  = procList.filter(p =>
      p.name.includes("renderer") || p.name.includes(" gpu") ||
      p.name.includes("gpu process") || (p.name.includes("electron") && p.name.includes("helper"))
    );
    const rendererMaxCpu = rendererProcs.reduce((m, p) => Math.max(m, p.pcpu), 0);

    // Named Windows groups
    const defenderCpu = groupCpu("msmpeng", "mpdefendercore", "mpcopyaccelerator", "nisSrv", "securityhealthservice");
    const defenderTop = groupTop("msmpeng", "mpdefendercore", "mpcopyaccelerator");

    const updateCpu   = groupCpu("tiworker", "trustedinstaller", "waasmedic", "wuauclt", "wuauserv", "musnotification");
    const updateTop   = groupTop("tiworker", "trustedinstaller", "waasmedic");

    const indexerCpu  = groupCpu("searchindexer", "searchprotocolhost", "searchfilterhost");
    const indexerTop  = groupTop("searchindexer", "searchprotocolhost");

    const wslCpu      = groupCpu("vmmem", "vmwp", "vmcompute");
    const wslTop      = groupTop("vmmem", "vmwp", "vmcompute");

    const gamingCpu   = groupCpu("steam", "eabackgroundservice", "eadesktop", "nvcontainer", "nvtmmon",
                                 "origin", "epicgameslauncher", "galaxyclient", "gog", "riotclientservices");
    const gamingTop   = groupTop("steam", "eabackgroundservice", "eadesktop", "nvcontainer", "epicgameslauncher");

    const browserCpu  = groupCpu("chrome", "msedge", "firefox", "opera", "brave", "vivaldi");
    const browserTop  = groupTop("chrome", "msedge", "firefox", "opera", "brave");

    // ── Cause interface ───────────────────────────────────────────────────────

    interface Cause {
      id: string;
      label: string;
      evidence: string[];
      confidence: "high" | "medium" | "low";
      subsystem: string;
      score: number;
      suggestion: string;
      destination: string;
    }

    const causes: Cause[] = [];

    // ── 1. PowerShell burst ───────────────────────────────────────────────────
    if (psCount >= 2) {
      const conf: "high" | "medium" | "low" = psCount >= 4 ? "high" : "medium";
      const ev: string[] = [`${psCount} PowerShell instance${psCount !== 1 ? "s" : ""} running`];
      if (topPsProc && topPsProc.pcpu > 0.1)
        ev.push(`top powershell at ${topPsProc.pcpu.toFixed(1)}% CPU`);
      ev.push("Tweak verification or registry write in progress");
      causes.push({
        id: "tweak-verification", label: "Tweak Verification Activity", evidence: ev,
        confidence: conf, subsystem: "SwitchControl / PowerShell",
        score: 55 + Math.min(40, psCount * 8),
        suggestion: "Normal after applying tweaks — completes in seconds",
        destination: "/tweaks",
      });
    } else if (psCount === 1 && cpuLoad > 25) {
      causes.push({
        id: "tweak-check-single", label: "Single Tweak Check Running",
        evidence: [
          "1 PowerShell task active",
          topPsProc && topPsProc.pcpu > 0.1 ? `powershell at ${topPsProc.pcpu.toFixed(1)}% CPU` : "powershell.exe spawned",
        ],
        confidence: "low", subsystem: "SwitchControl / PowerShell", score: 38,
        suggestion: "Single PowerShell check — completes shortly", destination: "/tweaks",
      });
    }

    // ── 2. Windows Defender / Antivirus ──────────────────────────────────────
    if (defenderCpu > 3) {
      const top = defenderTop;
      const ev: string[] = [
        top ? `${top.name} at ${top.pcpu.toFixed(1)}% CPU` : `Windows Defender using ${defenderCpu.toFixed(1)}% CPU`,
        defenderCpu > 20 ? "Full antivirus scan in progress" : "Antivirus background scan or definition update",
      ];
      if (defenderCpu > 10) ev.push("Pause Defender Real-Time Protection temporarily during gaming to regain CPU");
      causes.push({
        id: "defender-scan", label: "Windows Defender Scan",
        evidence: ev,
        confidence: defenderCpu > 20 ? "high" : defenderCpu > 8 ? "medium" : "low",
        subsystem: "Antivirus",
        score: 40 + Math.min(50, defenderCpu * 1.8),
        suggestion: defenderCpu > 15 ? "Temporarily pause Defender real-time protection" : "Wait for scan to complete — typically finishes within minutes",
        destination: "/tweaks",
      });
    }

    // ── 3. Windows Update ────────────────────────────────────────────────────
    if (updateCpu > 3) {
      const top = updateTop;
      const ev: string[] = [
        top ? `${top.name} at ${top.pcpu.toFixed(1)}% CPU` : `Windows Update using ${updateCpu.toFixed(1)}% CPU`,
        updateCpu > 15 ? "Active update installation or patch extraction" : "Windows is checking for or staging updates",
        "Downloads and installs silently in the background",
      ];
      causes.push({
        id: "windows-update", label: "Windows Update Activity",
        evidence: ev,
        confidence: updateCpu > 15 ? "high" : "medium",
        subsystem: "Windows Update",
        score: 42 + Math.min(45, updateCpu * 2),
        suggestion: "Pause Windows Updates in Settings → Update & Security if impacting gaming",
        destination: "/tweaks",
      });
    }

    // ── 4. Search / Indexer ──────────────────────────────────────────────────
    if (indexerCpu > 4) {
      const top = indexerTop;
      const ev: string[] = [
        top ? `${top.name} at ${top.pcpu.toFixed(1)}% CPU` : `Search Indexer using ${indexerCpu.toFixed(1)}% CPU`,
        "Windows is cataloguing new or changed files",
        "Indexing typically spikes after reboot or large file changes",
      ];
      causes.push({
        id: "search-indexer", label: "File Indexing",
        evidence: ev,
        confidence: indexerCpu > 15 ? "medium" : "low",
        subsystem: "Search",
        score: 35 + Math.min(35, indexerCpu * 1.5),
        suggestion: "Disable Search Indexing for game drives via the Tweaks page",
        destination: "/tweaks",
      });
    }

    // ── 5. WSL / Hyper-V ─────────────────────────────────────────────────────
    if (wslCpu > 5) {
      const top = wslTop;
      const ev: string[] = [
        top ? `${top.name} at ${top.pcpu.toFixed(1)}% CPU` : `VM subsystem using ${wslCpu.toFixed(1)}% CPU`,
        "WSL 2 or Hyper-V virtual machine is active",
        "Linux container or dev environment consuming resources",
      ];
      causes.push({
        id: "wsl-vm", label: "WSL / Virtual Machine Activity",
        evidence: ev,
        confidence: wslCpu > 20 ? "high" : "medium",
        subsystem: "Hyper-V / WSL",
        score: 38 + Math.min(42, wslCpu * 1.5),
        suggestion: "Shut down WSL (wsl --shutdown) or pause Hyper-V VMs while gaming",
        destination: "/",
      });
    }

    // ── 6. SwitchControl backend ──────────────────────────────────────────────
    if (backendMaxCpu > 15) {
      const procName = hotBackend?.name ?? "node";
      const ev: string[] = [
        `${procName} at ${backendMaxCpu.toFixed(1)}% CPU`,
        "App engine: telemetry collection, AI analysis, or disk inspection",
      ];
      if (topCpuProcs[0] && !topCpuProcs[0].name.startsWith("powershell"))
        ev.push(`top overall: ${topCpuProcs[0].name} at ${topCpuProcs[0].pcpu.toFixed(1)}%`);
      causes.push({
        id: "backend-activity", label: "Backend Analysis Activity",
        evidence: ev,
        confidence: backendMaxCpu > 40 ? "high" : "medium",
        subsystem: "Backend",
        score: 45 + Math.min(40, backendMaxCpu * 0.9),
        suggestion: "Background scan in progress — CPU will settle when complete",
        destination: "/",
      });
    }

    // ── 7. Renderer / GPU ─────────────────────────────────────────────────────
    if (rendererMaxCpu > 20) {
      causes.push({
        id: "renderer-load", label: "UI / Renderer Workload",
        evidence: [
          `renderer process at ${rendererMaxCpu.toFixed(1)}% CPU`,
          "Heavy UI rendering, animation, or GPU compositing",
        ],
        confidence: rendererMaxCpu > 45 ? "high" : "medium",
        subsystem: "Renderer",
        score: 40 + Math.min(35, rendererMaxCpu * 0.75),
        suggestion: "Reduce open panels or complex animations",
        destination: "/",
      });
    }

    // ── 8. Memory pressure ────────────────────────────────────────────────────
    if (ramPct > 78) {
      causes.push({
        id: "memory-pressure", label: "Memory Pressure",
        evidence: [
          `RAM at ${ramPct.toFixed(0)}% — ${snap.ram.usedGB.toFixed(1)} GB / ${snap.ram.totalGB.toFixed(1)} GB`,
          ramPct > 90 ? "OS is actively paging to disk — severe performance impact" : "Standby memory is being trimmed — stutter risk elevated",
        ],
        confidence: ramPct > 90 ? "high" : ramPct > 85 ? "medium" : "low",
        subsystem: "Memory",
        score: 50 + Math.min(50, (ramPct - 78) * 2.5),
        suggestion: "Apply memory-opt tweaks or clear RAM standby via Tweaks",
        destination: "/tweaks",
      });
    }

    // ── 9. Network burst ──────────────────────────────────────────────────────
    if (netKbs > 800) {
      const netStr = netKbs > 1024 ? `${(netKbs / 1024).toFixed(1)} MB/s` : `${netKbs.toFixed(0)} KB/s`;
      causes.push({
        id: "network-burst", label: "Background Network Transfer",
        evidence: [
          `Network I/O: ${netStr}`,
          netKbs > 3000 ? "Large background download or upload in progress" : "Moderate background network activity",
          "Common causes: Windows Update, cloud sync (OneDrive), antivirus definitions",
        ],
        confidence: netKbs > 5000 ? "high" : netKbs > 2000 ? "medium" : "low",
        subsystem: "Network",
        score: netKbs > 5000 ? 72 : netKbs > 2000 ? 50 : 32,
        suggestion: "Check Task Manager → Resource Monitor → Network for the active process",
        destination: "/network",
      });
    }

    // ── 10. Gaming platform / overlay overhead ────────────────────────────────
    if (gamingCpu > 4 && causes.length === 0) {
      const top = gamingTop;
      const ev: string[] = [
        top ? `${top.name} at ${top.pcpu.toFixed(1)}% CPU` : `Gaming platform using ${gamingCpu.toFixed(1)}% CPU`,
        "Game store, launcher, or GPU overlay consuming background resources",
      ];
      if (gamingCpu > 10) ev.push("Consider disabling in-game overlays and background launchers");
      causes.push({
        id: "gaming-platform", label: "Gaming Platform Overhead",
        evidence: ev,
        confidence: gamingCpu > 15 ? "medium" : "low",
        subsystem: "Gaming",
        score: 32 + Math.min(35, gamingCpu * 1.4),
        suggestion: "Disable Steam, EA, NVIDIA overlays when not actively using them",
        destination: "/tweaks",
      });
    }

    // ── 11. Browser activity ──────────────────────────────────────────────────
    if (browserCpu > 8 && causes.length === 0) {
      const top = browserTop;
      const ev: string[] = [
        top ? `${top.name} at ${top.pcpu.toFixed(1)}% CPU` : `Browser using ${browserCpu.toFixed(1)}% CPU`,
        "Background tabs, video, or extensions consuming CPU",
      ];
      causes.push({
        id: "browser-load", label: "Browser Activity",
        evidence: ev,
        confidence: browserCpu > 20 ? "medium" : "low",
        subsystem: "Browser",
        score: 30 + Math.min(35, browserCpu * 1.2),
        suggestion: "Close unused browser tabs or suspend background tabs",
        destination: "/",
      });
    }

    // ── 12. Named external process ────────────────────────────────────────────
    if (causes.length === 0 && cpuLoad > 20 && topCpuProcs.length > 0) {
      const knownInternal = ["powershell", "node", "electron", "switchcontrol",
                             "msmpeng", "tiworker", "trustedinstaller", "searchindexer",
                             "vmmem", "vmwp", "steam", "nvcontainer", "chrome", "msedge", "firefox"];
      const externalTop = topCpuProcs.find(p =>
        !knownInternal.some(n => p.name.includes(n)) && p.pcpu > 2
      );
      if (externalTop) {
        const ev: string[] = [
          `${externalTop.name} at ${externalTop.pcpu.toFixed(1)}% CPU`,
        ];
        if (topCpuProcs[1] && topCpuProcs[1] !== externalTop && topCpuProcs[1].pcpu > 1)
          ev.push(`also: ${topCpuProcs[1].name} at ${topCpuProcs[1].pcpu.toFixed(1)}%`);
        ev.push(`system total: ${cpuLoad.toFixed(0)}% CPU`);
        causes.push({
          id: "external-process", label: "External Process Spike",
          evidence: ev,
          confidence: externalTop.pcpu > 30 ? "high" : externalTop.pcpu > 12 ? "medium" : "low",
          subsystem: "External",
          score: 38 + Math.min(42, externalTop.pcpu * 1.3),
          suggestion: "Open Task Manager to identify and close this process if unneeded",
          destination: "/",
        });
      }
    }

    // ── 13. CPU elevated, load distributed across many small processes ────────
    if (causes.length === 0 && cpuLoad > 25) {
      const hasProcs = topCpuProcs.length > 0;
      const topStr = topCpuProcs
        .slice(0, 4)
        .filter(p => p.pcpu > 0.3)
        .map(p => `${p.name} ${p.pcpu.toFixed(1)}%`)
        .join(", ");
      const explained = top6Sum.toFixed(0);
      const ev: string[] = [
        `CPU at ${cpuLoad.toFixed(0)}% — load spread across many small tasks`,
      ];
      if (hasProcs && topStr) ev.push(`Top processes: ${topStr}`);
      ev.push(top6Sum < cpuLoad * 0.5
        ? `Top 6 processes account for only ${explained}% — kernel/DPC/interrupt overhead likely`
        : `${procs} total processes — high background process count adds scheduler overhead`
      );
      if (procs > 200) ev.push(`${procs} processes running — consider debloat tweaks`);
      causes.push({
        id: "distributed-load", label: "Distributed Background Load",
        evidence: ev,
        confidence: "medium",
        subsystem: "System",
        score: 22,
        suggestion: procs > 200
          ? "Run debloat / startup tweaks to reduce background process count"
          : "No single process to target — this is normal Windows overhead at this CPU level",
        destination: procs > 200 ? "/tweaks" : "/",
      });
    }

    // ── Sort by score and pick primary ───────────────────────────────────────
    causes.sort((a, b) => b.score - a.score);

    const primaryCause: Cause = causes[0] ?? {
      id: "baseline",
      label: "No significant anomaly detected",
      evidence: [
        `CPU at ${cpuLoad.toFixed(0)}% — within normal range`,
        `RAM at ${ramPct.toFixed(0)}%`,
        psCount === 0 ? "No PowerShell activity" : `${psCount} PowerShell task${psCount !== 1 ? "s" : ""} running`,
        topCpuProcs[0] ? `Highest process: ${topCpuProcs[0].name} at ${topCpuProcs[0].pcpu.toFixed(1)}%` : "No process spike detected",
      ],
      confidence: "high",
      subsystem: "None",
      score: 0,
      suggestion: "",
      destination: "",
    };

    const result = {
      primaryCause,
      allCauses: causes.slice(0, 4),
      noIssue: causes.length === 0,
      cpuLoad:      parseFloat(cpuLoad.toFixed(1)),
      ramPct:       parseFloat(ramPct.toFixed(1)),
      psCount,
      topProcesses: topCpuProcs.slice(0, 5).map(p => ({
        name:   p.name,
        cpuPct: parseFloat(p.pcpu.toFixed(1)),
      })),
      ts: Date.now(),
    };

    whatCausedThatCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to analyze cause" });
  }
});

// ── System DNA — behavioral fingerprint ─────────────────────────────────────

router.get("/system-dna", (_req, res) => {
  try {
    const snap    = getCachedSnapshot();
    const cpuLoad = snap.cpu.load;
    const ramPct  = snap.ram.usedPercent;
    const procs   = snap.processes.total;
    const netKbs  = (snap.network.rx_sec + snap.network.tx_sec) / 1024;

    // All dimensions scored 0-100 from real telemetry
    const latencyTendency = Math.min(100, Math.round(
      (cpuLoad * 0.38) +
      (Math.max(0, ramPct - 55) * 0.75) +
      (snap.load_trend === "rising" ? 14 : 0)
    ));

    const memoryComfort = Math.max(0, Math.round(100 - ramPct));

    const bgNoise = Math.min(100, Math.round(
      (procs / 4.2) + (cpuLoad * 0.28) + Math.min(22, netKbs / 120)
    ));

    const networkActivity = Math.min(100, Math.round(netKbs / 45));

    const responsiveness = Math.max(0, Math.round(
      100 -
      (cpuLoad * 0.45) -
      (Math.max(0, ramPct - 65) * 0.82) -
      (snap.load_trend === "rising" ? 12 : 0)
    ));

    const schedulingPressure = Math.min(100, Math.round(
      (procs / 3.2) + (snap.processes.running * 4.5)
    ));

    const dimensions = [
      { id: "latency",     label: "Latency Tendency",     score: latencyTendency,    color: "hsl(338,85%,62%)", higherIsBad: true  },
      { id: "memory",      label: "Memory Comfort",        score: memoryComfort,      color: "hsl(152,75%,50%)", higherIsBad: false },
      { id: "background",  label: "Background Noise",      score: bgNoise,            color: "hsl(45,90%,55%)",  higherIsBad: true  },
      { id: "network",     label: "Network Activity",      score: networkActivity,    color: "hsl(200,85%,55%)", higherIsBad: false },
      { id: "responsive",  label: "Responsiveness",        score: responsiveness,     color: "hsl(270,65%,65%)", higherIsBad: false },
      { id: "scheduling",  label: "Scheduling Pressure",   score: schedulingPressure, color: "hsl(24,90%,58%)",  higherIsBad: true  },
    ];

    const avgPositive = (memoryComfort + responsiveness + networkActivity) / 3;
    const avgNegative = (latencyTendency + bgNoise + schedulingPressure) / 3;
    const profile =
      avgPositive > 62 && avgNegative < 32 ? "Responsive" :
      avgNegative > 58 ? "Pressured" : "Mixed Load";

    const profileNote =
      profile === "Responsive" ? "System is running cleanly — good scheduling headroom" :
      profile === "Pressured"  ? "Multiple subsystems under pressure — consider tweaking" :
      "Normal operating state with moderate background activity";

    res.json({ dimensions, profile, profileNote, ts: Date.now() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to compute system DNA" });
  }
});

// ── Active problems ───────────────────────────────────────────────────────────

router.get("/active-problems", (_req, res) => {
  try {
    const snap    = getCachedSnapshot();
    const cpuLoad = snap.cpu.load;
    const ramPct  = snap.ram.usedPercent;
    const procs   = snap.processes.total;
    const netKbs  = (snap.network.rx_sec + snap.network.tx_sec) / 1024;

    interface Problem {
      id: string;
      severity: "high" | "warning" | "info";
      title: string;
      message: string;
      metric: string;
      suggestion: string;
      destination: string;
    }

    const problems: Problem[] = [];

    if (ramPct > 92) {
      problems.push({ id: "mem-critical", severity: "high", title: "Critical Memory Pressure", message: `RAM at ${ramPct.toFixed(0)}% — OS is actively paging to disk. Performance is degraded.`, metric: `${ramPct.toFixed(0)}%`, suggestion: "Clear RAM or apply mem-opt tweak", destination: "/tweaks" });
    } else if (ramPct > 80) {
      problems.push({ id: "mem-high", severity: "warning", title: "High Memory Usage", message: `RAM at ${ramPct.toFixed(0)}%. Standby trimming active — stutter risk elevated.`, metric: `${ramPct.toFixed(0)}%`, suggestion: "Apply memory optimization tweaks", destination: "/tweaks" });
    }

    if (cpuLoad > 72) {
      problems.push({ id: "cpu-high", severity: "warning", title: "Elevated Background CPU", message: `CPU at ${cpuLoad.toFixed(0)}% near-idle. Background services consuming headroom.`, metric: `${cpuLoad.toFixed(0)}%`, suggestion: "Disable background apps", destination: "/tweaks" });
    }

    if (snap.load_trend === "rising" && cpuLoad > 28) {
      problems.push({ id: "rising-load", severity: "info", title: "System Load Increasing", message: "CPU load is trending upward. Monitor for sustained spikes that indicate background activity.", metric: "Rising", suggestion: "Monitor activity", destination: "/" });
    }

    if (procs > 280) {
      problems.push({ id: "proc-high", severity: "warning", title: "High Process Count", message: `${procs} active processes. Excess services add scheduling overhead and latency jitter.`, metric: `${procs}`, suggestion: "Run debloat tweaks", destination: "/tweaks" });
    } else if (procs > 190) {
      problems.push({ id: "proc-moderate", severity: "info", title: "Above-Average Process Count", message: `${procs} processes running. Consider disabling startup applications.`, metric: `${procs}`, suggestion: "Check startup tweaks", destination: "/tweaks" });
    }

    if (netKbs > 2500) {
      problems.push({ id: "net-active", severity: "info", title: "Background Network Activity", message: `${netKbs > 1024 ? (netKbs / 1024).toFixed(1) + " MB/s" : netKbs.toFixed(0) + " KB/s"} background traffic. May be Windows Update or cloud sync.`, metric: netKbs > 1024 ? `${(netKbs / 1024).toFixed(1)} MB/s` : `${netKbs.toFixed(0)} KB/s`, suggestion: "Check network diagnostics", destination: "/network" });
    }

    res.json({
      problems: problems.slice(0, 5),
      allClear: problems.length === 0,
      problemCount: problems.length,
      ts: Date.now(),
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to detect problems" });
  }
});

// ── Input latency estimate ────────────────────────────────────────────────────

router.get("/latency-estimate", (_req, res) => {
  try {
    const snap    = getCachedSnapshot();
    const cpuLoad = snap.cpu.load;
    const ramPct  = snap.ram.usedPercent;
    const procs   = snap.processes.total;

    // Conservative grounded estimate — labeled honestly
    const base     = 0.8;
    const cpuDelta = cpuLoad > 72 ? 3.2 : cpuLoad > 52 ? 1.9 : cpuLoad > 32 ? 0.8 : 0.2;
    const ramDelta = ramPct  > 90 ? 4.5 : ramPct  > 80 ? 2.8 : ramPct  > 68 ? 1.2 : 0.3;
    const procDelta = procs  > 320 ? 1.6 : procs   > 210 ? 0.9 : procs  > 150 ? 0.3 : 0.1;

    const total = Math.round((base + cpuDelta + ramDelta + procDelta) * 10) / 10;

    const quality =
      total < 3   ? "Excellent" :
      total < 5.5 ? "Good"      :
      total < 9   ? "Fair"      : "Poor";

    const confidence =
      (ramPct > 85 || cpuLoad > 70) ? "medium" : "high";

    const trend =
      snap.load_trend === "rising"  ? "rising" :
      snap.load_trend === "falling" ? "falling" : "stable";

    res.json({
      estimatedMs: total,
      quality,
      confidence,
      trend,
      breakdown: [
        { label: "Base OS overhead", ms: base,      note: "Minimum kernel scheduler latency" },
        { label: "CPU scheduling",   ms: cpuDelta,  note: `CPU at ${cpuLoad.toFixed(0)}%` },
        { label: "Memory paging",    ms: ramDelta,  note: `RAM at ${ramPct.toFixed(0)}%` },
        { label: "Process overhead", ms: procDelta, note: `${procs} active processes` },
      ],
      ts: Date.now(),
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to estimate latency" });
  }
});

// ── Smart RAM analysis (real state engine) ────────────────────────────────────

router.get("/ram-analysis", async (req, res) => {
  try {
    // ?bust=1 allows the client to invalidate the cache after a RAM clean
    if (req.query.bust === "1") ramAnalysisCache = null;

    // Serve cached result if within TTL — avoids si.processes() on every fast refresh
    if (ramAnalysisCache && (Date.now() - ramAnalysisCache.ts) < RAM_ANALYSIS_TTL) {
      return res.json(ramAnalysisCache.data);
    }

    const snap    = getCachedSnapshot();
    const usedGB  = snap.ram.usedGB;
    const totalGB = snap.ram.totalGB;
    const usedPct = snap.ram.usedPercent;

    // Get richer memory data from si.mem() — buffcache is real cached+buffered pages
    let buffcacheGB: number | null = null;
    let availableGB: number | null = null;
    let swapUsedGB:  number | null = null;

    try {
      const mem = await si.mem();
      buffcacheGB = mem.buffcache  > 0 ? parseFloat((mem.buffcache  / 1073741824).toFixed(1)) : null;
      availableGB = mem.available  > 0 ? parseFloat((mem.available  / 1073741824).toFixed(1)) : null;
      swapUsedGB  = mem.swapused   > 0 ? parseFloat((mem.swapused   / 1073741824).toFixed(2)) : null;
    } catch (_) {}

    // Top 5 RAM-consuming processes sorted by memRss (resident set size)
    type TopProc = { name: string; pid: number | null; ramMb: number | null; cpuPct: number | null };
    let topProcesses: TopProc[] = [];
    try {
      const procs = await si.processes();
      topProcesses = procs.list
        .filter((p: any) => p.memRss > 0)
        .sort((a: any, b: any) => b.memRss - a.memRss)
        .slice(0, 5)
        .map((p: any) => ({
          name:   p.name ?? "unknown",
          pid:    typeof p.pid === "number" ? p.pid : null,
          ramMb:  typeof p.memRss === "number" ? Math.round(p.memRss / 1024) : null,
          cpuPct: typeof p.pcpu === "number"   ? parseFloat(p.pcpu.toFixed(1)) : null,
        }));
    } catch (_) {}

    // Reclaimable: if we have real buffcache data, use it — otherwise estimate conservatively
    let reclaimableGB: number;
    let reclaimableSource: "measured" | "estimated";
    if (buffcacheGB !== null && buffcacheGB > 0) {
      // On Linux, buffcache is the real reclaimable page cache.
      // On Windows via si, this approximates standby pages.
      reclaimableGB  = Math.round(Math.min(buffcacheGB, usedGB * 0.45) * 10) / 10;
      reclaimableSource = "measured";
    } else {
      // Conservative estimate — never overclaim
      const factor   = usedPct > 85 ? 0.18 : usedPct > 70 ? 0.14 : 0.10;
      reclaimableGB  = Math.round(usedGB * factor * 10) / 10;
      reclaimableSource = "estimated";
    }

    const freeGB      = availableGB ?? Math.max(0, parseFloat((totalGB - usedGB).toFixed(1)));
    const newUsedPct  = Math.round(Math.max(0, usedPct - (reclaimableGB / totalGB) * 100));

    // ── State engine ──────────────────────────────────────────────────────────
    // "cached_heavy": lots of page cache, real memory is fine
    // "pressure_rising": increasing usage, standby being trimmed
    // "bottleneck": high usage, reduced headroom
    // "critical": OS paging / swap active
    // "stable": all good

    type RamState = "stable" | "cached_heavy" | "pressure_rising" | "bottleneck" | "critical";
    let state: RamState;
    let reason: string;
    let recommendation: string;

    const loadTrend = snap.load_trend;

    if (usedPct > 92 || (swapUsedGB !== null && swapUsedGB > 0.5)) {
      state  = "critical";
      reason = swapUsedGB
        ? `RAM at ${usedPct.toFixed(0)}% with ${swapUsedGB} GB in swap — OS is paging to disk`
        : `RAM at ${usedPct.toFixed(0)}% — OS is actively swapping, performance degraded`;
      recommendation = "Clear RAM now or close high-pressure applications to stop paging";
    } else if (usedPct > 80) {
      state  = "bottleneck";
      reason = `RAM at ${usedPct.toFixed(0)}% — standby memory pool is shrinking, headroom is limited`;
      recommendation = "Clear standby pages or reduce background process count";
    } else if (usedPct > 65 && loadTrend === "rising") {
      state  = "pressure_rising";
      reason = `RAM at ${usedPct.toFixed(0)}% and trending upward — available headroom is narrowing`;
      recommendation = "Monitor active processes; consider clearing RAM if trend continues";
    } else if (buffcacheGB !== null && buffcacheGB > usedGB * 0.30) {
      state  = "cached_heavy";
      reason = `${buffcacheGB} GB held as page cache — reclaimable by OS on demand. Real memory is healthy`;
      recommendation = "No action required — cached memory improves disk-read performance";
    } else {
      state  = "stable";
      reason = `RAM at ${usedPct.toFixed(0)}% with ${freeGB} GB available — system is comfortable`;
      recommendation = "No action needed";
    }

    const standbyGb = buffcacheGB;

    const ramResult = {
      totalGb:          parseFloat(totalGB.toFixed(1)),
      usedGb:           parseFloat(usedGB.toFixed(1)),
      freeGb:           parseFloat(freeGB.toFixed(1)),
      availableGb:      availableGB,
      standbyGb,
      swapUsedGb:       swapUsedGB,
      reclaimableGb:    reclaimableGB,
      reclaimableSource,
      newUsedPct,
      usedPct:          Math.round(usedPct),
      state,
      reason,
      recommendation,
      topProcesses,
      ts: Date.now(),
    };
    ramAnalysisCache = { data: ramResult, ts: Date.now() };
    res.json(ramResult);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to analyze RAM" });
  }
});

// ── Display Signal profile ────────────────────────────────────────────────────

router.get("/display-signal", async (_req, res) => {
  try {
    // Serve cached result if within TTL — display config changes very rarely
    if (displaySignalCache && (Date.now() - displaySignalCache.ts) < DISPLAY_SIGNAL_TTL) {
      return res.json(displaySignalCache.data);
    }

    const gfx = await si.graphics();

    // Normalize a display from systeminformation — be explicit when data is absent
    const rawDisps = gfx.displays ?? [];
    const rawCtrl  = gfx.controllers?.[0] ?? null;

    const gpuName: string | null = rawCtrl?.model?.trim() || null;

    interface DisplaySignalProfile {
      monitorName:    string | null;
      resolution:     string | null;
      refreshHz:      number | null;
      bitDepth:       number | null;
      hdrEnabled:     boolean | null;
      vrrEnabled:     boolean | null;
      connectionType: string | null;
      gpuName:        string | null;
      isNativeMode:   boolean | null;
      qualityScore:   number | null;
      qualityReason:  string;
      qualityAction:  string | null;
      notes:          string[];
      displayCount:   number;
      ts:             number;
    }

    function normalizeDisplay(d: any): DisplaySignalProfile {
      const resX = d.currentResX ?? d.resolutionX ?? null;
      const resY = d.currentResY ?? d.resolutionY ?? null;
      const hz   = d.currentRefreshRate ?? d.refreshRate ?? null;

      const resolution     = (resX && resY) ? `${resX}×${resY}` : null;
      const connectionType = typeof d.connection === "string" && d.connection.trim()
        ? d.connection.trim() : null;
      const monitorName    = typeof d.model === "string" && d.model.trim()
        ? d.model.trim() : null;

      // pixelDepth from si — only trust when explicitly non-null
      const bitDepth: number | null = (typeof d.pixelDepth === "number" && d.pixelDepth > 0)
        ? d.pixelDepth : null;

      // HDR and VRR — si does not expose these fields reliably; never guess
      const hdrEnabled: boolean | null = null;
      const vrrEnabled: boolean | null = null;

      // Native mode — si does not expose native/max resolution separately
      const isNativeMode: boolean | null = null;

      // ── Quality score ─────────────────────────────────────────────────────
      // Only score axes where we have real confirmed data
      const notes: string[] = [];
      let score: number | null = null;
      let points = 0;
      let maxPoints = 0;
      const qualityActions: string[] = [];

      // Axis 1: Refresh rate (40 pts)
      if (hz !== null) {
        maxPoints += 40;
        if      (hz >= 240) { points += 40; notes.push(`${hz}Hz ultra-high refresh rate`); }
        else if (hz >= 144) { points += 36; notes.push(`${hz}Hz high-refresh display`); }
        else if (hz >= 100) { points += 28; notes.push(`${hz}Hz above standard refresh`); }
        else if (hz >= 60)  { points += 18; notes.push(`${hz}Hz standard refresh rate`);
          qualityActions.push(`Display supports ${hz}Hz — verify maximum is being used`); }
        else                { points += 6;  notes.push(`${hz}Hz — below typical desktop rate`);
          qualityActions.push("Enable a higher refresh rate in Display Settings"); }
      }

      // Axis 2: Resolution (35 pts)
      if (resX !== null && resY !== null) {
        maxPoints += 35;
        const px = resX * resY;
        if      (px >= 7680 * 4320) { points += 35; notes.push(`8K resolution active`); }
        else if (px >= 3840 * 2160) { points += 35; notes.push(`4K (${resX}×${resY}) resolution`); }
        else if (px >= 2560 * 1440) { points += 30; notes.push(`1440p (${resX}×${resY}) resolution`); }
        else if (px >= 1920 * 1080) { points += 22; notes.push(`1080p (${resX}×${resY}) resolution`);
          qualityActions.push("1080p detected — 1440p or higher would improve clarity"); }
        else                         { points += 10; notes.push(`${resolution} — below 1080p`);
          qualityActions.push("Resolution is below Full HD"); }
      }

      // Axis 3: Bit depth (15 pts)
      if (bitDepth !== null) {
        maxPoints += 15;
        if      (bitDepth >= 12) { points += 15; notes.push(`${bitDepth}-bit deep color`); }
        else if (bitDepth >= 10) { points += 13; notes.push(`${bitDepth}-bit wide color`); }
        else if (bitDepth >= 8)  { points += 10; notes.push(`${bitDepth}-bit standard color depth`); }
        else                     { points += 4;  notes.push(`${bitDepth}-bit limited color depth`); }
      }

      // Axis 4: Connection type (10 pts)
      if (connectionType !== null) {
        maxPoints += 10;
        const conn = connectionType.toUpperCase();
        if      (conn.includes("DP") || conn.includes("DISPLAYPORT")) { points += 10; notes.push(`DisplayPort connection`); }
        else if (conn.includes("HDMI 2.1"))                           { points += 10; notes.push("HDMI 2.1 connection"); }
        else if (conn.includes("HDMI"))                               { points += 7;  notes.push(`${connectionType} connection`); }
        else if (conn.includes("VNC"))                                { points += 0;  notes.push("VNC virtual display — not a physical monitor"); }
        else                                                          { points += 5;  notes.push(`${connectionType} connection`); }
      }

      if (maxPoints > 0) {
        score = Math.round((points / maxPoints) * 100);
      }

      const qualityReason = notes.length > 0
        ? notes.slice(0, 2).join(" · ")
        : "Display data limited — connect a physical monitor for full analysis";

      const qualityAction = qualityActions.length > 0 ? qualityActions[0] : null;

      return {
        monitorName,
        resolution,
        refreshHz: hz,
        bitDepth,
        hdrEnabled,
        vrrEnabled,
        connectionType,
        gpuName,
        isNativeMode,
        qualityScore: score,
        qualityReason,
        qualityAction,
        notes,
        displayCount: rawDisps.length,
        ts: Date.now(),
      };
    }

    const profile = rawDisps.length > 0 ? normalizeDisplay(rawDisps[0]) : null;

    const displayResult = profile ?? {
      monitorName: null, resolution: null, refreshHz: null,
      bitDepth: null, hdrEnabled: null, vrrEnabled: null,
      connectionType: null, gpuName: null, isNativeMode: null,
      qualityScore: null,
      qualityReason: "No display detected",
      qualityAction: null,
      notes: [],
      displayCount: 0,
      ts: Date.now(),
    };
    displaySignalCache = { data: displayResult, ts: Date.now() };
    res.json(displayResult);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to collect display signal data" });
  }
});

// ── Exported getter for other modules (advisorContext.ts) ─────────────────────
export function getCachedDisplaySignal(): any | null {
  if (!displaySignalCache) return null;
  if (Date.now() - displaySignalCache.ts > DISPLAY_SIGNAL_TTL) return null;
  return displaySignalCache.data;
}

export default router;
