/**
 * Issue Detector — finds real, evidence-backed system issues.
 *
 * All detections are driven by:
 *   - getSnapshot()              → live telemetry (CPU, RAM, GPU, temps, disk, processes)
 *   - getCachedSystemIntelligence() → deep hardware profile (RAM layout, security, VBS, XMP, network, storage)
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

// Known-bad power plan names — only flag these, never flag custom/gaming plans
const BAD_POWER_PLAN_KEYWORDS = ["balanced", "power saver", "powersaver", "economy", "eco mode"];

// Helper: tweak is confirmed OFF (in store as false — synced from registry in Electron)
function off(states: Record<string, boolean>, id: string): boolean {
  return states[id] === false;
}

router.post("/detect", async (req, res) => {
  try {
    const body = req.body;
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ ok: false, error: "Request body must be an object" });
    }
    const {
      tweakStates = {} as Record<string, boolean>,
      startupAppCount,
      powerPlanName,
    } = body as {
      tweakStates?: Record<string, boolean>;
      startupAppCount?: number;
      powerPlanName?: string;
    };

    if (tweakStates == null || typeof tweakStates !== "object" || Array.isArray(tweakStates) ||
        Object.entries(tweakStates).some(([key, value]) => typeof key !== "string" || typeof value !== "boolean")) {
      return res.status(400).json({ ok: false, error: "tweakStates must be an object of boolean values" });
    }
    if (startupAppCount !== undefined &&
        (typeof startupAppCount !== "number" || !Number.isFinite(startupAppCount) ||
         startupAppCount < 0 || !Number.isInteger(startupAppCount))) {
      return res.status(400).json({ ok: false, error: "startupAppCount must be a non-negative integer" });
    }
    if (powerPlanName !== undefined &&
        (typeof powerPlanName !== "string" || powerPlanName.length > 256)) {
      return res.status(400).json({ ok: false, error: "powerPlanName must be a string of at most 256 characters" });
    }

    const snapshot = await getSnapshot();
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

    if (intel?.platform?.resizeBarEnabled === false) {
      issues.push({
        id: "rebar-disabled",
        category: "gpu",
        severity: "medium",
        confidence: "confirmed",
        title: "Resizable BAR (SAM) Is Disabled",
        reason: "Resizable BAR allows the CPU to address the full GPU VRAM instead of 256MB chunks at a time.",
        impact: "5–15% GPU performance loss in modern titles. AMD SAM and NVIDIA RTX 30/40 series both benefit significantly.",
        recommendedAction: "Enable Resizable BAR (or AMD SAM) in your BIOS under PCI Express settings. Requires UEFI boot and CSM disabled.",
        autoFixAvailable: false,
      });
    }

    // ── Memory ────────────────────────────────────────────────────────────────

    if (intel?.memory?.sticks && intel.memory.sticks.length === 1) {
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
      const maxConfigured = Math.max(...sticks.map((s) => s.configuredClockMhz ?? 0));
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

    // ── Live RAM pressure ─────────────────────────────────────────────────────

    if (snapshot?.ram?.usedPercent != null && snapshot.ram.usedPercent > 85) {
      const pct = Math.round(snapshot.ram.usedPercent);
      const usedGB = snapshot.ram.usedGB?.toFixed(1) ?? "?";
      const totalGB = snapshot.ram.totalGB?.toFixed(1) ?? "?";
      issues.push({
        id: "high-ram-usage",
        category: "memory",
        severity: pct > 92 ? "high" : "medium",
        confidence: "confirmed",
        title: `RAM at ${pct}%  (${usedGB} / ${totalGB} GB used)`,
        reason: "Very high RAM utilization forces Windows to spill overflow to the disk page file.",
        impact: "Page file access adds 10–500ms+ latency spikes — directly visible as stutters during gameplay.",
        recommendedAction: "Close background applications or use the Dashboard RAM Cleaner to reclaim standby memory.",
        autoFixAvailable: false,
      });
    }

    // ── Thermals ──────────────────────────────────────────────────────────────

    if (snapshot?.temps?.cpu != null && snapshot.temps.cpu > 80) {
      const t = Math.round(snapshot.temps.cpu);
      issues.push({
        id: "cpu-temp-high",
        category: "cpu",
        severity: t > 90 ? "high" : "medium",
        confidence: "confirmed",
        title: `CPU Temperature: ${t}°C`,
        reason: `CPU is running at ${t}°C. Modern CPUs begin thermal throttling when approaching their TjMax (typically 95–105°C).`,
        impact: t > 90
          ? "Thermal throttling is likely active — clock speeds are being reduced to protect the chip."
          : "Sustained high temperatures reduce boost clock duration and increase thermal throttle risk under load.",
        recommendedAction: "Check CPU cooler contact and thermal paste condition. Verify cooler fan RPM and case airflow. Reseat cooler if paste is old.",
        autoFixAvailable: false,
      });
    }

    if (snapshot?.temps?.gpu != null && snapshot.temps.gpu > 83) {
      const t = Math.round(snapshot.temps.gpu);
      issues.push({
        id: "gpu-temp-high",
        category: "gpu",
        severity: t > 90 ? "high" : "medium",
        confidence: "confirmed",
        title: `GPU Temperature: ${t}°C`,
        reason: `GPU is running at ${t}°C. Modern GPUs typically throttle between 83–90°C depending on the card's limit.`,
        impact: t > 90
          ? "GPU is likely power/thermal throttling — sustained frame rate loss and potential instability."
          : "Reduced GPU boost headroom; sustained loads may cause clock drops and frame pacing issues.",
        recommendedAction: "Clean GPU fans and heatsink of dust. Improve case airflow. Consider an undervolt to reduce thermals without performance loss.",
        autoFixAvailable: false,
      });
    }

    // ── GPU VRAM ──────────────────────────────────────────────────────────────

    if (snapshot?.gpu?.vramPercent != null && snapshot.gpu.vramPercent > 88) {
      const pct = Math.round(snapshot.gpu.vramPercent);
      const usedMb = snapshot.gpu.vramUsedMb;
      const totalMb = snapshot.gpu.vramTotalMb;
      const usedStr = usedMb != null ? `${(usedMb / 1024).toFixed(1)} GB` : `${pct}%`;
      const totalStr = totalMb != null ? `${(totalMb / 1024).toFixed(0)} GB` : "";
      issues.push({
        id: "vram-near-full",
        category: "gpu",
        severity: pct > 95 ? "high" : "medium",
        confidence: "confirmed",
        title: `GPU VRAM at ${pct}%${totalStr ? ` (${usedStr} / ${totalStr})` : ` (${usedStr} used)`}`,
        reason: "VRAM capacity is nearly exhausted. When VRAM fills up, the GPU must spill textures to system RAM over the PCIe bus.",
        impact: "Severe frame time spikes (100ms+) and visible stutter when the GPU is forced to page textures across the bus.",
        recommendedAction: "Lower in-game texture quality or resolution. Close other GPU-using applications. Consider a higher VRAM GPU if this persists.",
        autoFixAvailable: false,
      });
    }

    // ── Disk ──────────────────────────────────────────────────────────────────

    if (snapshot?.disk?.activeTimePct != null && snapshot.disk.activeTimePct > 85) {
      const pct = Math.round(snapshot.disk.activeTimePct);
      issues.push({
        id: "disk-saturated",
        category: "storage",
        severity: pct > 95 ? "high" : "medium",
        confidence: "confirmed",
        title: `Disk at ${pct}% Active`,
        reason: "The storage device is nearly fully saturated with read/write requests, leaving no headroom for additional I/O.",
        impact: "Game asset streaming stalls, hitching during level loads, and significant stutter if the page file is also active.",
        recommendedAction: "Check Task Manager → Performance → Disk for which process is driving I/O. Disable background indexing and Windows Search if not needed.",
        autoFixAvailable: false,
      });
    }

    // Check system drive free space from intel
    if (intel?.storage?.filesystems) {
      const sysDrive = intel.storage.filesystems.find(
        (f) => f.mount === "C:" || f.mount === "/" || f.fs?.toLowerCase().includes("c:")
      );
      if (sysDrive?.sizeGb != null && sysDrive.usedGb != null) {
        const freeGb = sysDrive.sizeGb - sysDrive.usedGb;
        const freePct = (freeGb / sysDrive.sizeGb) * 100;
        if (freePct < 10) {
          issues.push({
            id: "low-disk-space",
            category: "storage",
            severity: freePct < 5 ? "high" : "medium",
            confidence: "confirmed",
            title: `System Drive Almost Full (${freeGb.toFixed(0)} GB free)`,
            reason: `Only ${freeGb.toFixed(1)} GB (${freePct.toFixed(0)}%) remains on the system drive. Windows needs free space for the page file, temp files, and updates.`,
            impact: "Windows page file cannot expand — causing crashes or hard freezes under memory pressure. Shader caches and game updates may also fail.",
            recommendedAction: "Free up space by removing unused programs, clearing Temp folders, and running Disk Cleanup. Move game installs to a secondary drive if available.",
            autoFixAvailable: false,
          });
        }
      }
    }

    // ── Processes & Services ──────────────────────────────────────────────────

    if (snapshot?.processes?.total != null && snapshot.processes.total > 200) {
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

    // ── Power Plan ────────────────────────────────────────────────────────────
    // Only flag KNOWN bad plan names (balanced, power saver) — never flag custom
    // gaming/performance plans created by SwitchControl or other tools.

    if (powerPlanName && typeof powerPlanName === "string") {
      const nameLower = powerPlanName.toLowerCase();
      const isKnownBad = BAD_POWER_PLAN_KEYWORDS.some((kw) => nameLower.includes(kw));
      if (isKnownBad) {
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

    // ── Network ───────────────────────────────────────────────────────────────

    if (intel?.network?.interfaces && intel.network.interfaces.length > 0) {
      const activeIfaces = intel.network.interfaces.filter(
        (n) => n.ip4 && n.ip4 !== "" && n.ip4 !== "0.0.0.0" && !n.internal
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
      } else if (!hasEthernet && hasWifi) {
        issues.push({
          id: "wifi-only-gaming",
          category: "network",
          severity: "medium",
          confidence: "confirmed",
          title: "Gaming on Wi-Fi — No Ethernet Detected",
          reason: "Wi-Fi introduces variable latency, retransmissions, and interference that Ethernet connections avoid entirely.",
          impact: "Ping spikes of 5–50ms are common on Wi-Fi and unpredictable. Packet loss causes rubber-banding and desync in competitive titles.",
          recommendedAction: "Connect via Ethernet for the lowest and most consistent latency. If wiring is not possible, use a 5GHz or 6GHz band and keep the router line-of-sight.",
          autoFixAvailable: false,
        });
      }
    }

    // ── Tweak-linked issues ───────────────────────────────────────────────────
    // These fire when a tweak is CONFIRMED off (value === false, synced from
    // registry in Electron mode). They are silent in web / unauthenticated mode.

    // CPU / Latency
    if (off(tweakStates, "timer-res")) {
      issues.push({
        id: "timer-res-off",
        category: "cpu",
        severity: "high",
        confidence: "confirmed",
        title: "Timer Resolution at Default 15.6ms",
        reason: "Windows runs its global scheduler timer at 15.625ms by default. Every sleep, frame vsync wait, and input poll is rounded to this quantum.",
        impact: "Frame delivery timing inaccuracies up to 15ms per tick; input latency spikes and inconsistent wakeup timing for the game loop.",
        recommendedAction: "Enable Timer Resolution in Tweaks → CPU to pin Windows to 0.5ms resolution.",
        linkedTweakIds: ["timer-res"],
        autoFixAvailable: true,
      });
    }

    if (off(tweakStates, "synth-timers")) {
      issues.push({
        id: "synth-timers-on",
        category: "cpu",
        severity: "medium",
        confidence: "confirmed",
        title: "Hyper-V Synthetic Timer Drivers Loaded",
        reason: "Synthetic timer drivers remain registered even when Hyper-V is disabled, adding an extra layer of interrupt abstraction.",
        impact: "Measurable DPC latency increase on timer interrupts — shows up in LatencyMon as elevated timer DPC times.",
        recommendedAction: "Disable synthetic timer drivers via Tweaks → CPU.",
        linkedTweakIds: ["synth-timers"],
        autoFixAvailable: true,
      });
    }

    if (off(tweakStates, "irq-priority")) {
      issues.push({
        id: "irq-priority-default",
        category: "cpu",
        severity: "medium",
        confidence: "confirmed",
        title: "IRQ / DPC Priority Not Elevated",
        reason: "Default Windows IRQ priority leaves game-related hardware interrupts competing with lower-priority device driver DPCs.",
        impact: "Higher DPC latency; uneven frame pacing in latency-sensitive titles — typically 200–600µs of jitter measurable in LatencyMon.",
        recommendedAction: "Raise IRQ / DPC priority via Tweaks → CPU.",
        linkedTweakIds: ["irq-priority"],
        autoFixAvailable: true,
      });
    }

    if (off(tweakStates, "p-states")) {
      issues.push({
        id: "p-states-on",
        category: "cpu",
        severity: "medium",
        confidence: "confirmed",
        title: "CPU P-States (Frequency Stepping) Active",
        reason: "P-States allow the processor to drop to lower frequency states between workloads to save power. Each P-State transition adds a brief latency penalty during re-ramp.",
        impact: "Clock speed dips during brief idle moments within frame render — directly measurable as frame time spikes and DPC latency variance.",
        recommendedAction: "Disable CPU P-States via Tweaks → CPU.",
        linkedTweakIds: ["p-states"],
        autoFixAvailable: true,
      });
    }

    if (off(tweakStates, "power-throttling")) {
      issues.push({
        id: "power-throttling-on",
        category: "cpu",
        severity: "medium",
        confidence: "confirmed",
        title: "CPU Power Throttling (EcoQoS) Active",
        reason: "Windows EcoQoS silently throttles CPU threads it classifies as non-interactive — and some game engine threads are misclassified.",
        impact: "Unpredictable CPU clock reduction on game threads; most noticeable as stutter on CPU-bound titles.",
        recommendedAction: "Disable Power Throttling via Tweaks → CPU.",
        linkedTweakIds: ["power-throttling"],
        autoFixAvailable: true,
      });
    }

    if (off(tweakStates, "win32-priority-sep")) {
      issues.push({
        id: "win32-priority-sep-default",
        category: "cpu",
        severity: "medium",
        confidence: "confirmed",
        title: "Win32 Priority Separation Not Gaming-Optimized",
        reason: "Win32PrioritySeparation controls how aggressively Windows boosts foreground thread priority. The default value (2) gives modest boost; the gaming value gives maximum foreground priority.",
        impact: "Game threads compete more equally with background processes for CPU time — causing frame timing variance.",
        recommendedAction: "Set Win32 Priority Separation to gaming value via Tweaks → CPU.",
        linkedTweakIds: ["win32-priority-sep"],
        autoFixAvailable: true,
      });
    }

    if (off(tweakStates, "sys-responsiveness")) {
      issues.push({
        id: "sys-responsiveness-default",
        category: "cpu",
        severity: "low",
        confidence: "confirmed",
        title: "MMCSS System Responsiveness at Default",
        reason: "SystemResponsiveness controls what percentage of CPU time MMCSS reserves for background tasks. Default (20%) leaves significant CPU budget for non-game processes.",
        impact: "Background services can claim up to 20% of scheduler time even when a game is in the foreground.",
        recommendedAction: "Reduce MMCSS system responsiveness via Tweaks → CPU.",
        linkedTweakIds: ["sys-responsiveness"],
        autoFixAvailable: true,
      });
    }

    // GPU
    if (off(tweakStates, "disable-mpo")) {
      issues.push({
        id: "mpo-enabled",
        category: "gpu",
        severity: "medium",
        confidence: "confirmed",
        title: "Multi-Plane Overlay (MPO) Enabled",
        reason: "MPO is a GPU compositing feature with a known bug in Windows 10/11 DX12/WDDM drivers causing black screen flashes and frame drops on many GPU models.",
        impact: "Random black screen flashes, frame drops, and compositor-related stutters — most common on NVIDIA hardware in multi-monitor setups.",
        recommendedAction: "Disable MPO via Tweaks → GPU.",
        linkedTweakIds: ["disable-mpo"],
        autoFixAvailable: true,
      });
    }

    if (off(tweakStates, "disable-fso")) {
      issues.push({
        id: "fso-enabled",
        category: "gpu",
        severity: "medium",
        confidence: "confirmed",
        title: "Full Screen Optimizations Not Disabled",
        reason: "Windows Full Screen Optimizations override exclusive fullscreen with a borderless-like mode, inserting the DWM compositor into the frame path.",
        impact: "Adds 1–3 frames of display pipeline latency vs. true exclusive fullscreen. Blocks some DX11 optimizations and can interfere with G-Sync/FreeSync.",
        recommendedAction: "Disable Full Screen Optimizations via Tweaks → GPU.",
        linkedTweakIds: ["disable-fso"],
        autoFixAvailable: true,
      });
    }

    if (off(tweakStates, "pcie-link-state")) {
      issues.push({
        id: "pcie-link-state-on",
        category: "gpu",
        severity: "low",
        confidence: "confirmed",
        title: "PCIe Link State Power Management Active",
        reason: "PCIe ASPM allows the PCIe bus to enter low-power states between GPU data transfers. Recovery from L1 state adds latency.",
        impact: "Micro-stutters visible when GPU rapidly transitions between idle and active PCIe states — especially at the start of a burst workload.",
        recommendedAction: "Disable PCIe Link State power management via Tweaks → Power.",
        linkedTweakIds: ["pcie-link-state"],
        autoFixAvailable: true,
      });
    }

    // Services / Game features
    if (off(tweakStates, "xbox-bar")) {
      issues.push({
        id: "xbox-bar-running",
        category: "services",
        severity: "low",
        confidence: "confirmed",
        title: "Xbox Game Bar Running in Background",
        reason: "Game Bar keeps background recording, overlay, and social features active at all times — regardless of whether you use them.",
        impact: "Constant background CPU draw; accidental Win+G presses cause overlay stutters; recording buffers consume RAM.",
        recommendedAction: "Disable Xbox Game Bar via Tweaks → Services.",
        linkedTweakIds: ["xbox-bar"],
        autoFixAvailable: true,
      });
    }

    if (off(tweakStates, "xbox-services")) {
      issues.push({
        id: "xbox-services-running",
        category: "services",
        severity: "low",
        confidence: "confirmed",
        title: "Xbox Background Services Running",
        reason: "Xbox Identity Provider and Xbox Live services run background processes continuously regardless of whether Xbox features are used.",
        impact: "Ongoing background CPU and memory consumption; occasional disk activity from service syncing.",
        recommendedAction: "Disable Xbox Services via Tweaks → Services.",
        linkedTweakIds: ["xbox-services"],
        autoFixAvailable: true,
      });
    }

    if (off(tweakStates, "disable-delivery-opt")) {
      issues.push({
        id: "delivery-opt-on",
        category: "network",
        severity: "low",
        confidence: "confirmed",
        title: "Windows Update Delivery Optimization Active",
        reason: "Delivery Optimization uses your upload bandwidth to distribute Windows updates to other devices on your network and the internet.",
        impact: "Can spike upload during gameplay, increasing effective ping and causing packet loss on congested links.",
        recommendedAction: "Disable Delivery Optimization via Tweaks → Network.",
        linkedTweakIds: ["disable-delivery-opt"],
        autoFixAvailable: true,
      });
    }

    if (off(tweakStates, "net-throttle-index")) {
      issues.push({
        id: "net-throttle-active",
        category: "network",
        severity: "low",
        confidence: "confirmed",
        title: "MMCSS Network Bandwidth Reserve Active",
        reason: "Windows reserves 20% of available network bandwidth for MMCSS multimedia streaming. This cap applies to all traffic including game server connections.",
        impact: "Game server throughput capped at ~80% of available bandwidth — shows as artificially lower in-game download speeds.",
        recommendedAction: "Remove the MMCSS network throttle limit via Tweaks → Network.",
        linkedTweakIds: ["net-throttle-index"],
        autoFixAvailable: true,
      });
    }

    if (off(tweakStates, "gaming-mode")) {
      issues.push({
        id: "gaming-mode-off",
        category: "services",
        severity: "low",
        confidence: "confirmed",
        title: "Windows Game Mode Disabled",
        reason: "Game Mode signals to the Windows scheduler that a game is the priority foreground task — enabling GPU priority and suppressing some background updates.",
        impact: "Scheduler does not apply foreground GPU priority — background processes may compete for GPU resources without being deprioritized.",
        recommendedAction: "Enable Game Mode via Tweaks → Services.",
        linkedTweakIds: ["gaming-mode"],
        autoFixAvailable: true,
      });
    }

    // ── Sort: high first, then medium, then low ───────────────────────────────
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    issues.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

    res.json({ issues, detectedAt: Date.now() });
  } catch (err) {
    console.error("[IssueDetector] Fatal route error:", err);
    res.status(500).json({ ok: false, error: "Issue detection failed" });
  }
});

export default router;
