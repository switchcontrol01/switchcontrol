import {
  SecurityStatus,
  StartupItem,
  ProcessItem,
  SecurityRecommendation,
  ScanSummary,
  SystemAnalysisRequest,
  SystemAnalysisResult,
} from "./types";

const LAUNCHER_PATTERNS = ["steam", "epic", "origin", "battlenet", "gog", "ubisoft", "ea app", "riot", "rockstar"];
const OVERLAY_PATTERNS = ["discord", "geforce", "nvidiaoverlay", "shadowplay", "afterburner", "obs", "fraps", "xsplit", "overwolf"];
const UPDATER_PATTERNS = ["update", "updater", "autoupdate", "patch", "onedrive"];
const SECURITY_PATTERNS = ["defender", "msmpeng", "antimalware", "securityhealth", "firewall", "crowdstrike", "malwarebytes"];
const BROWSER_PATTERNS = ["chrome", "firefox", "msedge", "opera", "brave", "vivaldi"];

export function classifyProcess(name: string): { category: ProcessItem["category"]; impact: "low" | "medium" | "high" } {
  const lower = name.toLowerCase().replace(/\.exe$/i, "");
  if (LAUNCHER_PATTERNS.some(p => lower.includes(p))) return { category: "launcher", impact: "medium" };
  if (OVERLAY_PATTERNS.some(p => lower.includes(p))) return { category: "overlay", impact: "medium" };
  if (SECURITY_PATTERNS.some(p => lower.includes(p))) return { category: "security", impact: "low" };
  if (BROWSER_PATTERNS.some(p => lower.includes(p))) return { category: "browser", impact: "medium" };
  if (UPDATER_PATTERNS.some(p => lower.includes(p))) return { category: "updater", impact: "low" };
  if (["svchost", "system", "wininit", "csrss", "lsass", "services", "dwm", "winlogon"].some(p => lower === p)) {
    return { category: "system", impact: "low" };
  }
  return { category: "unknown", impact: "low" };
}

export function classifyStartup(name: string, command: string): {
  category: StartupItem["category"];
  impact: "low" | "medium" | "high";
  recommendation: "keep" | "review" | "disable";
} {
  const lower = (name + " " + command).toLowerCase();
  if (LAUNCHER_PATTERNS.some(p => lower.includes(p))) {
    return { category: "launcher", impact: "medium", recommendation: "review" };
  }
  if (OVERLAY_PATTERNS.some(p => lower.includes(p))) {
    return { category: "overlay", impact: "medium", recommendation: "review" };
  }
  if (UPDATER_PATTERNS.some(p => lower.includes(p))) {
    return { category: "updater", impact: "low", recommendation: "review" };
  }
  if (SECURITY_PATTERNS.some(p => lower.includes(p))) {
    return { category: "security", impact: "low", recommendation: "keep" };
  }
  if (BROWSER_PATTERNS.some(p => lower.includes(p))) {
    return { category: "browser", impact: "medium", recommendation: "review" };
  }
  if (["windows", "microsoft", "shell", "ctfmon", "rundll"].some(p => lower.includes(p))) {
    return { category: "system", impact: "low", recommendation: "keep" };
  }
  return { category: "utility", impact: "low", recommendation: "keep" };
}

export function generateRecommendations(data: SystemAnalysisRequest): SystemAnalysisResult {
  const recs: SecurityRecommendation[] = [];
  const { status, startupItems, topProcesses } = data;

  // ── Protection status ─────────────────────────────────────────────────────
  if (status?.realtimeProtection === true) {
    recs.push({
      id: "realtime-active",
      title: "Real-time protection is active",
      summary: "Windows Defender is actively protecting your system. Protection overhead is typically minimal during gaming sessions.",
      severity: "info",
      category: "protection",
      performanceImpact: "low",
      securityImpact: "none",
      actionLabel: null,
      actionType: "info",
    });
  } else if (status?.realtimeProtection === false) {
    recs.push({
      id: "realtime-off",
      title: "Real-time protection is disabled",
      summary: "Windows Defender real-time protection is off. While this eliminates scan overhead, your system is exposed to active threats.",
      severity: "high",
      category: "protection",
      performanceImpact: "none",
      securityImpact: "high",
      actionLabel: "Open Windows Security",
      actionType: "external",
    });
  }

  // ── Firewall ──────────────────────────────────────────────────────────────
  if (status?.firewallEnabled === false) {
    recs.push({
      id: "firewall-off",
      title: "Windows Firewall is disabled",
      summary: "Your firewall is not active. Network-based threats and unwanted connections can reach your system without it.",
      severity: "medium",
      category: "protection",
      performanceImpact: "none",
      securityImpact: "high",
      actionLabel: "Enable in Windows Security",
      actionType: "external",
    });
  } else if (status?.firewallEnabled === true) {
    recs.push({
      id: "firewall-ok",
      title: "Firewall is enabled and healthy",
      summary: "Windows Firewall is active. Network traffic filtering is working normally with no performance concerns.",
      severity: "info",
      category: "protection",
      performanceImpact: "none",
      securityImpact: "none",
      actionLabel: null,
      actionType: "info",
    });
  }

  // ── Startup overhead ──────────────────────────────────────────────────────
  const reviewItems = startupItems.filter(i => i.recommendation === "review" || i.recommendation === "disable");
  if (reviewItems.length >= 3) {
    recs.push({
      id: "startup-overhead",
      title: `${reviewItems.length} startup apps worth reviewing`,
      summary: `Multiple launchers, overlays, and updaters are loading at boot. These can add 10–30 seconds to startup time and continue consuming resources while you game.`,
      severity: "medium",
      category: "startup",
      performanceImpact: "medium",
      securityImpact: "none",
      actionLabel: "Review in Startup Watch",
      actionType: "review",
    });
  } else if (reviewItems.length > 0 && reviewItems.length < 3) {
    recs.push({
      id: "startup-minor",
      title: `${reviewItems.length} startup ${reviewItems.length === 1 ? "app" : "apps"} to consider`,
      summary: `${reviewItems.map(i => i.name).join(", ")} ${reviewItems.length === 1 ? "is" : "are"} loading at startup. Review whether you need ${reviewItems.length === 1 ? "it" : "them"} running constantly.`,
      severity: "low",
      category: "startup",
      performanceImpact: "low",
      securityImpact: "none",
      actionLabel: "View in Startup Watch",
      actionType: "review",
    });
  }

  // ── Launcher count ────────────────────────────────────────────────────────
  const launchers = startupItems.filter(i => i.category === "launcher");
  if (launchers.length >= 2) {
    recs.push({
      id: "launcher-count",
      title: `${launchers.length} game launchers at startup`,
      summary: `${launchers.slice(0, 3).map(l => l.name).join(", ")} are set to start with Windows. Disabling launchers you don't use daily can reduce boot time and background RAM usage.`,
      severity: "low",
      category: "startup",
      performanceImpact: "medium",
      securityImpact: "none",
      actionLabel: "Disable via Task Manager",
      actionType: "review",
    });
  }

  // ── Background process overhead ───────────────────────────────────────────
  const heavyProcs = topProcesses.filter(p => p.impact === "high" || (p.cpuSec !== null && p.cpuSec > 10));
  if (heavyProcs.length > 0) {
    recs.push({
      id: "background-load",
      title: "High-impact background processes detected",
      summary: `${heavyProcs.slice(0, 3).map(p => p.name).join(", ")} ${heavyProcs.length === 1 ? "is" : "are"} consuming significant CPU resources. Close them before starting a gaming session for the best performance.`,
      severity: "medium",
      category: "performance",
      performanceImpact: "high",
      securityImpact: "none",
      actionLabel: "View in Background Watch",
      actionType: "review",
    });
  }

  // ── Realtime scanning overhead ────────────────────────────────────────────
  if (status?.realtimeProtection === true) {
    const securityProcs = topProcesses.filter(p => p.category === "security");
    if (securityProcs.length > 0) {
      recs.push({
        id: "scan-overhead",
        title: "Consider game folder exclusions for smoother performance",
        summary: "Real-time protection scans executables as games load assets. Adding trusted game install folders to Windows Defender exclusions can reduce stutters during asset streaming.",
        severity: "low",
        category: "performance",
        performanceImpact: "medium",
        securityImpact: "low",
        actionLabel: "Add exclusions (advanced)",
        actionType: "review",
      });
    }
  }

  // ── All-clear ─────────────────────────────────────────────────────────────
  const hasIssues = recs.some(r => r.severity === "medium" || r.severity === "high");
  if (!hasIssues && (status !== null || startupItems.length > 0)) {
    recs.push({
      id: "all-clear",
      title: "System integrity looks healthy",
      summary: "No critical issues detected. Your security posture and startup load appear well-balanced for gaming performance.",
      severity: "info",
      category: "protection",
      performanceImpact: "none",
      securityImpact: "none",
      actionLabel: null,
      actionType: "info",
    });
  }

  const summary = computeSummary(recs, status, startupItems, topProcesses);
  return { recommendations: recs, summary };
}

export function computeSummary(
  recs: SecurityRecommendation[],
  status: SecurityStatus | null,
  startupItems: StartupItem[],
  processes: ProcessItem[]
): ScanSummary {
  const threatCount =
    (status?.realtimeProtection === false ? 1 : 0) +
    (status?.firewallEnabled === false ? 1 : 0);
  const startupIssues = startupItems.filter(i => i.recommendation !== "keep").length;
  const backgroundIssues = processes.filter(p => p.impact === "high").length;

  const highCount = recs.filter(r => r.severity === "high").length;
  const medCount = recs.filter(r => r.severity === "medium").length;
  const healthScore = Math.max(20, Math.min(100, 100 - highCount * 20 - medCount * 8 - Math.min(backgroundIssues * 5, 20)));

  const systemState: ScanSummary["systemState"] =
    highCount > 0 ? "attention" :
    medCount > 0 ? "optimize" :
    "secure";

  return { threatCount, startupIssues, backgroundIssues, healthScore, systemState };
}
