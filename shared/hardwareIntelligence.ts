/**
 * hardwareIntelligence.ts — single source of truth for hardware-aware reasoning.
 *
 * Pure, dependency-free functions shared by BOTH the server (AI Advisor prompts)
 * and the client (hardware-aware tweak verdicts, performance-mode hints).
 *
 * CRITICAL: every input here must come from the USER's machine (the Electron app
 * collects it from the real OS), NEVER from the cloud server's own hardware. The
 * server's systeminformation reflects the Replit VM, not the user's PC.
 *
 * This module realizes the product vision's core idea: "detect hardware first,
 * then recommend ONLY the optimizations that make sense for THAT system" — e.g.
 * "Detected Ryzen X3D → Windows already manages parking, don't override it."
 */

// ── CPU architecture ──────────────────────────────────────────────────────────

export type CpuFamily =
  | "x3d" // AMD 3D V-Cache (cache-stacked CCD)
  | "intel-hybrid" // 12th gen+ / Core Ultra — P-cores + E-cores
  | "ryzen" // AMD Ryzen, non-X3D
  | "intel-conventional" // pre-12th-gen Intel, or modern Intel with no E-cores
  | "unknown";

export type GpuVendor = "nvidia" | "amd" | "intel" | "unknown";

/**
 * classifyCpuArchitecture — derive the scheduler-relevant family from the CPU
 * brand string the user's machine reports.
 *
 * Intel hybrid is decided by tier + generation + K-suffix, NOT by generation
 * alone: i3 (12100/13100) and 12th-gen non-K i5 (12400/12500) have no E-cores
 * and must NOT be treated as hybrid.
 */
export function classifyCpuArchitecture(cpuBrand: string | undefined | null): CpuFamily {
  if (!cpuBrand || typeof cpuBrand !== "string") return "unknown";
  const b = cpuBrand.toLowerCase();

  if (/x3d|3d\s*v-?cache/.test(b)) return "x3d";
  if (/core\s*ultra/.test(b)) return "intel-hybrid";

  // Intel Core 12th gen onward — parse tier/gen/suffix. Tolerates "i7-13700k"
  // and "i7 13700".
  const m = b.match(/\bi([3579])[\s-]?(1[2-9])(\d{3})([a-z]*)\b/);
  if (m) {
    const tier = parseInt(m[1], 10); // 3,5,7,9
    const gen = parseInt(m[2], 10); // 12..19
    const isK = /k/.test(m[4] || ""); // K/KF/KS unlocked SKUs
    // i7/i9 (12th+) always ship E-cores; i5 has E-cores on 13th-gen+ or 12th-gen
    // K SKUs; i3 (12th+) has none.
    const hybrid = tier >= 7 || (tier === 5 && (gen >= 13 || isK));
    return hybrid ? "intel-hybrid" : "intel-conventional";
  }

  if (/ryzen|amd/.test(b)) return "ryzen";
  if (/intel|core\s*i|xeon/.test(b)) return "intel-conventional";
  return "unknown";
}

const ARCH_NOTES: Record<Exclude<CpuFamily, "unknown">, string> = {
  "x3d":
    "AMD 3D V-Cache (X3D) — Windows already parks and prioritizes the cache-stacked CCD intelligently. Do NOT recommend aggressive core-parking overrides, forced timer-resolution hacks, or scheduler edits; on X3D these raise DPC latency and worsen frametimes. Favor scheduler-safe, frametime-focused tuning.",
  "intel-hybrid":
    "Intel hybrid architecture (P-cores + E-cores) — Intel Thread Director and the Windows scheduler assign threads automatically. Do NOT recommend disabling E-cores or forcing global CPU affinity; it breaks scheduling and hurts 1% lows. Favor scheduler-safe tuning.",
  "ryzen":
    "AMD Ryzen (non-X3D) — standard CCX/CCD scheduling. PBO / Curve Optimizer are valid on desktop only; avoid aggressive core-parking or timer overrides that destabilize frametimes.",
  "intel-conventional":
    "Intel (conventional, no E-cores) — single core-type scheduling. Avoid forced timer-resolution and mass service-disabling; prioritize latency and frametime stability over raw FPS.",
};

/** Human-readable scheduler-safety guidance for the detected CPU family, or null. */
export function inferCpuArchitectureNote(cpuBrand: string | undefined | null): string | null {
  const family = classifyCpuArchitecture(cpuBrand);
  if (family === "unknown") return null;
  return ARCH_NOTES[family];
}

// ── GPU vendor ────────────────────────────────────────────────────────────────

/** classifyGpuVendor — derive the GPU vendor from a GPU name/brand string. */
export function classifyGpuVendor(gpuName: string | undefined | null): GpuVendor {
  if (!gpuName || typeof gpuName !== "string") return "unknown";
  const g = gpuName.toLowerCase();
  if (/nvidia|geforce|\brtx\b|\bgtx\b|quadro|\bmx\d/.test(g)) return "nvidia";
  if (/radeon|\brx\s?\d|\bamd\b|vega|firepro/.test(g)) return "amd";
  if (/intel|\buhd\b|\bhd graphics\b|\biris\b|\barc\b/.test(g)) return "intel";
  return "unknown";
}

// ── Hardware profile ──────────────────────────────────────────────────────────

export interface HardwareProfile {
  cpu: { family: CpuFamily; isLaptop: boolean; raw: string };
  gpu: { vendor: GpuVendor; isIntegratedOnly: boolean; raw: string };
  ram: { totalGb: number | null };
  display: { refreshHz: number | null; highRefresh: boolean };
}

export interface HardwareProfileInput {
  cpuBrand?: string | null;
  gpuName?: string | null;
  isLaptop?: boolean | null;
  totalRamGb?: number | null;
  refreshHz?: number | null;
}

/** buildHardwareProfile — assemble a normalized profile from primitive inputs. */
export function buildHardwareProfile(input: HardwareProfileInput): HardwareProfile {
  const gpuVendor = classifyGpuVendor(input.gpuName);
  const refreshHz =
    typeof input.refreshHz === "number" && input.refreshHz > 0 ? input.refreshHz : null;
  return {
    cpu: {
      family: classifyCpuArchitecture(input.cpuBrand),
      isLaptop: input.isLaptop === true,
      raw: input.cpuBrand ?? "",
    },
    gpu: {
      vendor: gpuVendor,
      isIntegratedOnly: gpuVendor === "intel",
      raw: input.gpuName ?? "",
    },
    ram: {
      totalGb:
        typeof input.totalRamGb === "number" && input.totalRamGb > 0
          ? input.totalRamGb
          : null,
    },
    display: { refreshHz, highRefresh: refreshHz != null && refreshHz >= 100 },
  };
}

/**
 * summarizeHardwareIntelligence — a compact multi-line briefing for the AI
 * Advisor prompts. Combines CPU scheduler note + GPU + laptop + display so the
 * model reasons about the user's actual silicon. Returns null when nothing is
 * classifiable.
 */
export function summarizeHardwareIntelligence(input: HardwareProfileInput): string | null {
  const profile = buildHardwareProfile(input);
  const lines: string[] = [];

  const cpuNote = inferCpuArchitectureNote(input.cpuBrand);
  if (cpuNote) lines.push(`CPU: ${cpuNote}`);

  if (profile.gpu.vendor !== "unknown") {
    if (profile.gpu.vendor === "intel") {
      lines.push(
        "GPU: Intel integrated graphics — gains from GPU-scheduling/driver tweaks are minimal; focus on CPU, RAM and thermal headroom instead.",
      );
    } else {
      lines.push(
        `GPU: ${profile.gpu.vendor.toUpperCase()} discrete — Hardware GPU Scheduling and driver-level latency tuning are valid here; do not recommend vendor tweaks for the wrong vendor.`,
      );
    }
  }

  if (profile.cpu.isLaptop) {
    lines.push(
      "Form factor: LAPTOP — do NOT recommend desktop-only BIOS/PBO/undervolt tuning or always-on power-throttling-off; respect battery and thermals, suggest plugged-in-only changes where relevant.",
    );
  }

  if (profile.display.refreshHz) {
    if (profile.display.highRefresh) {
      lines.push(
        `Display: ${profile.display.refreshHz}Hz high-refresh — frame pacing and consistent frametimes matter most; prioritize stability over chasing raw FPS far above the refresh ceiling.`,
      );
    } else {
      lines.push(
        `Display: ${profile.display.refreshHz}Hz — FPS far above this ceiling brings little benefit; prioritize frametime stability and input latency.`,
      );
    }
  }

  return lines.length ? lines.join("\n") : null;
}

// ── Hardware-aware tweak verdicts ─────────────────────────────────────────────

export type TweakVerdictLevel = "recommended" | "caution" | "avoid";

export interface TweakHardwareVerdict {
  level: TweakVerdictLevel;
  reason: string;
}

/**
 * evaluateTweakForHardware — given a tweak id and the user's hardware profile,
 * return adaptive guidance, or null when the tweak is hardware-neutral.
 *
 * Keyed to real tweak ids in client/src/lib/tweak-registry.ts. Kept to a curated
 * set of well-understood, defensible rules — this is the "don't apply blindly"
 * intelligence from the product vision, not an exhaustive matrix.
 */
export function evaluateTweakForHardware(
  tweakId: string,
  profile: HardwareProfile,
): TweakHardwareVerdict | null {
  switch (tweakId) {
    // Timer/scheduler-sensitive: risky on cache-stacked X3D and on hybrid Intel,
    // where the OS scheduler already does the right thing.
    case "synth-timers":
      if (profile.cpu.family === "x3d") {
        return {
          level: "avoid",
          reason:
            "Detected AMD X3D — Windows already manages timers and CCD parking for the cache die. Forcing timer changes here can raise DPC latency and worsen frametimes.",
        };
      }
      if (profile.cpu.family === "intel-hybrid") {
        return {
          level: "caution",
          reason:
            "Intel hybrid CPU — timer changes can interfere with Thread Director scheduling across P/E cores. Apply only if you measure a real frametime improvement.",
        };
      }
      return null;

    // Win32PrioritySeparation: forcing aggressive foreground-only quanta can
    // starve E-cores on hybrid Intel.
    case "win32-priority-sep":
      if (profile.cpu.family === "intel-hybrid") {
        return {
          level: "caution",
          reason:
            "Intel hybrid CPU — Thread Director already balances foreground threads across P/E cores. Aggressive foreground-only presets can starve background work; prefer the balanced preset.",
        };
      }
      return null;

    // Hardware GPU Scheduling (HAGS): real benefit on modern discrete NVIDIA/AMD;
    // negligible / not applicable on Intel integrated graphics.
    // Always warn about latency tradeoffs — do not enable for latency-sensitive users.
    case "preemption":
      if (profile.gpu.vendor === "nvidia" || profile.gpu.vendor === "amd") {
        return {
          level: "recommended",
          reason: `Supported on your ${profile.gpu.vendor.toUpperCase()} GPU — Hardware GPU Scheduling can reduce CPU overhead, but may increase latency and frame-time variance in some titles. Not recommended for latency-sensitive competitive setups.`,
        };
      }
      if (profile.gpu.vendor === "intel") {
        return {
          level: "caution",
          reason:
            "Intel integrated graphics — Hardware GPU Scheduling brings little benefit here and behavior varies by driver. May increase latency and frame-time variance. Not recommended for latency-sensitive competitive setups.",
        };
      }
      return null;

    // Disabling power throttling system-wide hurts laptops on battery.
    case "power-throttling":
      if (profile.cpu.isLaptop) {
        return {
          level: "caution",
          reason:
            "You're on a laptop — disabling power throttling raises heat and drains the battery. Best left on for battery life; apply only while plugged in.",
        };
      }
      return null;

    default:
      return null;
  }
}
