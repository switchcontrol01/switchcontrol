/**
 * Issue Detector — finds real, evidence-backed system issues.
 *
 * All detections are driven by:
 *   - getSnapshot()              → live telemetry (CPU, RAM, processes, disk)
 *   - getCachedSystemIntelligence() → deep hardware profile (RAM layout, security, VBS, XMP, network)
 *   - tweakStates (from client)  → what SwitchControl tweaks are currently applied
 *   - startupAppCount (from client) → number of startup entries (client fetches from /api/startup)
 *   - powerPlanName (from client) → active power plan name
 *
 * If a metric cannot be confirmed, confidence is "likely" or "unknown" — never invented.
 */
import { Router } from "express";
import { getSnapshot } from "../lib/telemetry";
import { getCachedSystemIntelligence } from "../lib/systemIntelligence";

const router = Router();

export interface DetectedIssue {
  id: string;
  category:
    | "memory"
    | "cpu"
    | "gpu"
    | "network"
    | "services"
    | "startup"
    | "firmware"
    | "security"
    | "storage";
  severity: "low" | "medium" | "high";
  confidence: "confirmed" | "likely" | "unknown";
  title: string;
  reason: string;
  impact: string;
  recommendedAction: string;
  linkedTweakIds?: string[];
  autoFixAvailable: boolean;
}

router.post("/detect", (req, res) => {
  try {
    const {
      tweakStates = {} as Record<string, boolean>,
      startupAppCount,
      powerPlanName,
    } = (req.body ?? {}) as {
      tweakStates?: Record<string, boolean>;
      startupAppCount?: number;
      powerPlanName?: string;
    };

    const snapshot = getSnapshot();
    const intel = getCachedSystemIntelligence();

    const issues: DetectedIssue[] = [];

    // ── Security / Platform ───────────────────────────────────────────────────

    if (intel?.platform?.vbsEnabled === true) {
      issues.push({
        id: "vbs-on",
        category: "security",
        severity: "medium",
        confidence: "confirmed",
        title: "Virtualization-Based Security (VBS) Enabled",
        reason: "VBS is running and adds a hypervisor layer between software and hardware.",
        impact: "Increases DPC latency, adds CPU overhead of 5–15%, and can cause GPU performance regressions in DX12/Vulkan.",
        recommendedAction: "Disable VBS in Windows Security → Device Security → Core Isolation if you prioritize gaming performance.",
        autoFixAvailable: false,
      });
    }

    if (intel?.platform?.memoryIntegrityEnabled === true) {
      issues.push({
        id: "memory-integrity-on",
        category: "security",
        severity: "medium",
        confidence: "confirmed",
        title: "Memory Integrity (HVCI) Active",
        reason: "Kernel-mode code integrity is enforced via the hypervisor, adding overhead to every system call.",
        impact: "5–10% GPU frame overhead in DX12/Vulkan titles; elevated interrupt and scheduling latency.",
        recommendedAction: "Disable Memory Integrity in Windows Security → Core Isolation if gaming performance is the priority.",
        autoFixAvailable: false,
      });
    }

    if (intel?.platform?.hypervisorPresent === true) {
      issues.push({
        id: "hyperv-on",
        category: "services",
        severity: "medium",
        confidence: "confirmed",
        title: "Hyper-V Hypervisor Detected",
        reason: "Hyper-V places Windows itself inside a virtual machine, increasing latency on all hardware access paths.",
        impact: "Raises timer resolution floor, worsens interrupt latency, can cause frame pacing irregularities.",
        recommendedAction: "Disable Hyper-V via Windows Features (Turn Windows features on or off) if you don't need virtual machines.",
        autoFixAvailable: false,
      });
    }

    // ── Memory ────────────────────────────────────────────────────────────────

    if (
      intel?.memory?.sticks &&
      intel.memory.sticks.length === 1
    ) {
      const stick = intel.memory.sticks[0];
      issues.push({
        id: "single-channel-ram",
        category: "memory",
        severity: "high",
        confidence: "confirmed",
        title: "Single-Channel RAM Configuration",
        reason: `Only 1 memory module detected${stick.bank ? ` in slot ${stick.bank}` : ""}. A second matching stick in the paired slot enables dual-channel mode.`,
        impact: "Up to 30–50% lower memory bandwidth. CPU-bound and GPU-limited games are most affected.",
        recommendedAction: "Install a matching RAM module in the correct paired slot (check your motherboard manual for dual-channel layout).",
        autoFixAvailable: false,
      });
    }

    const xmpState = intel?.inference?.expoOrXmp?.state;
    if (xmpState === "unknown") {
      const sticks = intel?.memory?.sticks ?? [];
      const maxConfigured = Math.max(
        ...sticks.map((s) => s.configuredClockMhz ?? 0)
      );
      const maxRated = Math.max(...sticks.map((s) => s.clockMhz ?? 0));
      if (maxRated > 0 && maxConfigured > 0 && maxConfigured < maxRated * 0.95) {
        issues.push({
          id: "xmp-likely-off",
          category: "memory",
          severity: "high",
          confidence: "likely",
          title: "XMP/EXPO Profile Appears Disabled",
          reason: intel.inference.expoOrXmp.reason,
          impact: `RAM running at ${maxConfigured}MHz instead of rated ${maxRated}MHz — losing ${Math.round((1 - maxConfigured / maxRated) * 100)}% of rated bandwidth.`,
          recommendedAction: "Enable XMP (Intel) or EXPO (AMD) profile in BIOS under the Memory/OC settings section.",
          autoFixAvailable: false,
        });
      }
    }

    // ── Processes & Services ──────────────────────────────────────────────────

    if (snapshot && snapshot.processes.total > 200) {
      const count = snapshot.processes.total;
      issues.push({
        id: "high-process-count",
        category: "services",
        severity: count > 260 ? "high" : "medium",
        confidence: "confirmed",
        title: `${count} Background Processes Running`,
        reason: "High process count indicates significant background work competing for CPU scheduling slots.",
        impact: "Increases scheduler jitter, reduces available CPU headroom, and adds memory pressure.",
        recommendedAction: "Use Debloater and Tweaks to disable unnecessary services and startup programs.",
        linkedTweakIds: ["disable-services"],
        autoFixAvailable: false,
      });
    }

    if (snapshot && snapshot.ram.usedPercent > 85) {
      const pct = Math.round(snapshot.ram.usedPercent);
      const usedGB = snapshot.ram.usedGB.toFixed(1);
      const totalGB = snapshot.ram.totalGB.toFixed(1);
      issues.push({
        id: "high-ram-usage",
        category: "memory",
        severity: pct > 92 ? "high" : "medium",
        confidence: "confirmed",
        title: `RAM ${pct}% Used  (${usedGB} / ${totalGB} GB)`,
        reason: "Very high RAM utilization forces Windows to use the disk page file for overflow.",
        impact: "Page file access adds 10–500ms+ latency spikes — directly visible as stutters during gameplay.",
        recommendedAction: "Close background applications or use the Dashboard RAM Cleaner to reclaim standby memory.",
        autoFixAvailable: false,
      });
    }

    // ── Tweak-linked issues (only when real tweak state is known) ─────────────

    if (tweakStates["game-bar"] === false) {
      issues.push({
        id: "game-bar-enabled",
        category: "services",
        severity: "low",
        confidence: "confirmed",
        title: "Xbox Game Bar Is Running",
        reason: "Game Bar keeps background recording and overlay processes active at all times.",
        impact: "Constant background CPU draw; accidental Win+G presses can cause stutters.",
        recommendedAction: "Disable Game Bar via the Tweaks page (Services category).",
        linkedTweakIds: ["game-bar"],
        autoFixAvailable: true,
      });
    }

    if (tweakStates["delivery-optimization"] === false) {
      issues.push({
        id: "delivery-opt-on",
        category: "network",
        severity: "low",
        confidence: "confirmed",
        title: "Delivery Optimization Uploading to Other PCs",
        reason: "Windows Update Delivery Optimization uses your upload bandwidth to distribute updates to other devices.",
        impact: "Can spike upload during gameplay, increasing effective ping and causing packet loss.",
        recommendedAction: "Disable Delivery Optimization in Tweaks (Network category).",
        linkedTweakIds: ["delivery-optimization"],
        autoFixAvailable: true,
      });
    }

    // ── Network ───────────────────────────────────────────────────────────────

    if (intel?.network?.interfaces && intel.network.interfaces.length > 0) {
      const activeIfaces = intel.network.interfaces.filter(
        (n) => n.ipv4 && n.ipv4 !== "" && n.ipv4 !== "0.0.0.0"
      );
      const hasEthernet = activeIfaces.some((n) => !n.wifi);
      const hasWifi = activeIfaces.some((n) => n.wifi);
      if (hasEthernet && hasWifi) {
        issues.push({
          id: "wifi-and-ethernet-both-active",
          category: "network",
          severity: "low",
          confidence: "confirmed",
          title: "Both Wi-Fi and Ethernet Are Active",
          reason: "Two network interfaces are simultaneously connected and assigned IP addresses.",
          impact: "Can cause routing metric conflicts and inconsistent latency paths — ping may appear higher than the physical connection warrants.",
          recommendedAction: "Disable Wi-Fi in Windows network settings since Ethernet provides a more stable connection.",
          autoFixAvailable: false,
        });
      }
    }

    // ── Power Plan ────────────────────────────────────────────────────────────

    if (powerPlanName && typeof powerPlanName === "string") {
      const name = powerPlanName.toLowerCase();
      if (!name.includes("high performance") && !name.includes("ultimate")) {
        issues.push({
          id: "suboptimal-power-plan",
          category: "cpu",
          severity: "medium",
          confidence: "confirmed",
          title: `Power Plan: "${powerPlanName}"`,
          reason: "A balanced or power-saver plan throttles CPU frequency scaling, which increases DPC latency and limits boost clock duration.",
          impact: "Noticeable input latency increases; CPU may not maintain peak clock during sustained loads.",
          recommendedAction: "Switch to High Performance or Ultimate Performance via the Power Plan page.",
          autoFixAvailable: false,
        });
      }
    }

    // ── Startup Apps ──────────────────────────────────────────────────────────

    if (typeof startupAppCount === "number" && startupAppCount > 12) {
      issues.push({
        id: "too-many-startup-apps",
        category: "startup",
        severity: startupAppCount > 20 ? "high" : "medium",
        confidence: "confirmed",
        title: `${startupAppCount} Apps Launch at Startup`,
        reason: "Each startup app consumes CPU, memory, and disk on boot — and many continue running in background.",
        impact: "Slower boot, increased background RAM and CPU consumption during gaming sessions.",
        recommendedAction: "Review and disable unnecessary entries on the Startup Apps page.",
        autoFixAvailable: false,
      });
    }

    // ── Sort: high first, then medium, then low ───────────────────────────────
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    issues.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

    res.json({ issues, detectedAt: Date.now() });
  } catch (err) {
    console.error("[IssueDetector] Error:", err);
    res.json({ issues: [], detectedAt: Date.now() });
  }
});

export default router;
