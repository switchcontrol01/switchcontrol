/**
 * Adaptive performance is deliberately pure and platform-neutral.
 *
 * Electron owns collection of the capability snapshot. The renderer owns the
 * user override and applies the resulting visual/telemetry policies. Keeping
 * normalization and scoring here makes the decision deterministic and easy to
 * test without requiring Windows or a running Electron process.
 */

export type CapabilityAvailability = "available" | "unavailable" | "unknown";
export type AdaptivePerformanceProfile = "efficiency" | "balanced" | "enhanced" | "unknown";
export type AdaptivePerformanceOverride =
  | "automatic"
  | Exclude<AdaptivePerformanceProfile, "unknown">;

/**
 * Resolve the profile the app should actually use after applying the user's
 * persisted override. Automatic must remain a recommendation, not a second
 * independent profile decision.
 */
export function resolveAdaptivePerformanceProfile(
  detected: AdaptivePerformanceProfile,
  override: AdaptivePerformanceOverride,
): AdaptivePerformanceProfile {
  return override === "automatic" ? detected : override;
}

export interface CapabilitySignal<T> {
  value: T | null;
  availability: CapabilityAvailability;
  reason: string | null;
}

export interface AdaptiveCapabilitySnapshot {
  capturedAt: number;
  gpu: {
    model: CapabilitySignal<string>;
    vendor: CapabilitySignal<string>;
    driverVersion: CapabilitySignal<string>;
    integrated: CapabilitySignal<boolean>;
    hardwareAcceleration: CapabilitySignal<boolean>;
    softwareRendering: CapabilitySignal<boolean>;
    featureStatus: CapabilitySignal<Record<string, string>>;
  };
  rendering: {
    software: CapabilitySignal<boolean>;
  };
  remoteSession: CapabilitySignal<boolean>;
  display: {
    scaleFactor: CapabilitySignal<number>;
    monitorCount: CapabilitySignal<number>;
    highDpi: CapabilitySignal<boolean>;
  };
  power: {
    onBattery: CapabilitySignal<boolean>;
    batteryPercent: CapabilitySignal<number>;
    charging: CapabilitySignal<boolean>;
  };
  cpu: {
    logicalThreads: CapabilitySignal<number>;
    totalRamGb: CapabilitySignal<number>;
    availableRamGb: CapabilitySignal<number>;
  };
}

export interface AdaptivePerformanceDecision {
  profile: AdaptivePerformanceProfile;
  confidence: number;
  score: number;
  availableSignals: number;
  reasons: string[];
  constrainedSignals: string[];
}

export interface AdaptiveVisualPolicy {
  animateAmbient: boolean;
  cursorSpotlight: boolean;
  waveGrid: boolean;
  chartAnimation: boolean;
}

export interface AdaptiveTelemetryPolicy {
  intervalMultiplier: number;
  heavyWorkMultiplier: number;
}

export type AdaptiveTelemetryDemandMode = "full" | "intelligence" | "paused";

const AVAILABILITIES = new Set<CapabilityAvailability>([
  "available",
  "unavailable",
  "unknown",
]);

function normalizeAvailability(value: unknown, signalValue: unknown): CapabilityAvailability {
  if (typeof value === "string" && AVAILABILITIES.has(value as CapabilityAvailability)) {
    return value as CapabilityAvailability;
  }
  return signalValue === null || signalValue === undefined ? "unknown" : "available";
}

function normalizeSignal<T>(
  raw: unknown,
  coerce: (value: unknown) => T | null,
  fallbackReason: string,
): CapabilitySignal<T> {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  const rawValue = source && Object.prototype.hasOwnProperty.call(source, "value")
    ? source.value
    : raw;
  const value = coerce(rawValue);
  const availability = normalizeAvailability(source?.availability, rawValue);
  return {
    value: availability === "available" ? value : null,
    availability,
    reason: typeof source?.reason === "string"
      ? source.reason
      : availability === "available" ? null : fallbackReason,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveNumber(value: unknown): number | null {
  const result = finiteNumber(value);
  return result !== null && result >= 0 ? result : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function objectValue(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => typeof item === "string")
      .map(([key, item]) => [key, item as string]),
  );
}

function nested(raw: unknown, key: string): unknown {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>)[key] : undefined;
}

/**
 * Normalize both the Electron response and small fixture-shaped inputs.
 * A false boolean remains available; only null/undefined means missing.
 */
export function normalizeCapabilitySnapshot(raw: unknown): AdaptiveCapabilitySnapshot {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const gpu = nested(source, "gpu");
  const rendering = nested(source, "rendering");
  const display = nested(source, "display");
  const power = nested(source, "power");
  const cpu = nested(source, "cpu");

  const scale = normalizeSignal(
    nested(display, "scaleFactor"),
    positiveNumber,
    "Display scale was not available",
  );
  const monitorCount = normalizeSignal(
    nested(display, "monitorCount"),
    positiveNumber,
    "Monitor geometry was not available",
  );
  const highDpi = normalizeSignal(
    nested(display, "highDpi"),
    booleanValue,
    "Display scale was not available",
  );
  if (highDpi.availability === "unknown" && scale.availability === "available" && scale.value !== null) {
    highDpi.value = scale.value >= 1.75;
    highDpi.availability = "available";
    highDpi.reason = null;
  }

  return {
    capturedAt: typeof source.capturedAt === "number" ? source.capturedAt : Date.now(),
    gpu: {
      model: normalizeSignal(nested(gpu, "model"), stringValue, "GPU model was not reported"),
      vendor: normalizeSignal(nested(gpu, "vendor"), stringValue, "GPU vendor was not reported"),
      driverVersion: normalizeSignal(nested(gpu, "driverVersion"), stringValue, "GPU driver version was not reported"),
      integrated: normalizeSignal(nested(gpu, "integrated"), booleanValue, "GPU type was not reported"),
      hardwareAcceleration: normalizeSignal(
        nested(gpu, "hardwareAcceleration"),
        booleanValue,
        "GPU acceleration capability was not reported",
      ),
      softwareRendering: normalizeSignal(
        nested(gpu, "softwareRendering"),
        booleanValue,
        "GPU rendering mode was not reported",
      ),
      featureStatus: normalizeSignal(
        nested(gpu, "featureStatus"),
        objectValue,
        "GPU feature status was not available",
      ),
    },
    rendering: {
      software: normalizeSignal(
        nested(rendering, "software"),
        booleanValue,
        "Renderer mode was not reported",
      ),
    },
    remoteSession: normalizeSignal(
      nested(source, "remoteSession"),
      booleanValue,
      "Remote-session status was not available",
    ),
    display: { scaleFactor: scale, monitorCount, highDpi },
    power: {
      onBattery: normalizeSignal(nested(power, "onBattery"), booleanValue, "Power source was not available"),
      batteryPercent: normalizeSignal(nested(power, "batteryPercent"), positiveNumber, "Battery level was not available"),
      charging: normalizeSignal(nested(power, "charging"), booleanValue, "Charging state was not available"),
    },
    cpu: {
      logicalThreads: normalizeSignal(nested(cpu, "logicalThreads"), positiveNumber, "CPU thread count was not available"),
      totalRamGb: normalizeSignal(nested(cpu, "totalRamGb"), positiveNumber, "Total RAM was not available"),
      availableRamGb: normalizeSignal(nested(cpu, "availableRamGb"), positiveNumber, "Available RAM was not available"),
    },
  };
}

function isAvailable<T>(signal: CapabilitySignal<T>): signal is CapabilitySignal<T> & { value: T } {
  return signal.availability === "available" && signal.value !== null;
}

function featureIndicatesSoftware(status: Record<string, string> | null): boolean {
  if (!status) return false;
  const criticalKeys = ["gpu_compositing", "rasterization", "webgl", "webgl2"];
  return criticalKeys.some((key) =>
    typeof status[key] === "string" &&
    /software|disabled|unavailable|blocklisted|swiftshader/i.test(status[key]),
  );
}

/**
 * Score constraints conservatively. Missing evidence lowers confidence but
 * never becomes a fake “low-end” result.
 */
export function deriveAdaptiveProfile(input: unknown): AdaptivePerformanceDecision {
  const snapshot = normalizeCapabilitySnapshot(input);
  let penalty = 0;
  let capability = 0;
  const reasons: string[] = [];
  const constrainedSignals: string[] = [];
  let availableSignals = 0;

  [
    snapshot.cpu.logicalThreads,
    snapshot.cpu.totalRamGb,
    snapshot.gpu.model,
    snapshot.gpu.hardwareAcceleration,
    snapshot.rendering.software,
    snapshot.remoteSession,
    snapshot.display.scaleFactor,
    snapshot.power.onBattery,
  ].forEach((signal) => {
    if (signal.availability === "available" && signal.value !== null) availableSignals += 1;
  });

  if (isAvailable(snapshot.rendering.software) && snapshot.rendering.software.value) {
    penalty += 60;
    constrainedSignals.push("software-rendered");
    reasons.push("Software rendering is active, so animated effects are reduced");
  }
  if (isAvailable(snapshot.gpu.softwareRendering) && snapshot.gpu.softwareRendering.value) {
    penalty += 55;
    constrainedSignals.push("software-gpu");
    reasons.push("The GPU is using a software rendering path");
  }
  if (isAvailable(snapshot.gpu.hardwareAcceleration) && !snapshot.gpu.hardwareAcceleration.value) {
    penalty += 45;
    constrainedSignals.push("gpu-acceleration");
    reasons.push("GPU acceleration is unavailable");
  }
  if (isAvailable(snapshot.gpu.featureStatus) && featureIndicatesSoftware(snapshot.gpu.featureStatus.value)) {
    penalty += 35;
    constrainedSignals.push("gpu-feature-status");
    reasons.push("One or more GPU features are disabled or unavailable");
  }
  if (isAvailable(snapshot.remoteSession) && snapshot.remoteSession.value) {
    penalty += 50;
    constrainedSignals.push("remote-session");
    reasons.push("Remote Desktop/session rendering has extra display overhead");
  }
  if (isAvailable(snapshot.gpu.integrated) && snapshot.gpu.integrated.value) {
    penalty += 18;
    constrainedSignals.push("integrated-gpu");
    reasons.push("Integrated graphics share system resources");
  }
  if (isAvailable(snapshot.power.onBattery) && snapshot.power.onBattery.value) {
    penalty += 22;
    constrainedSignals.push("battery");
    reasons.push("The PC is running on battery power");
  }
  if (isAvailable(snapshot.display.highDpi) && snapshot.display.highDpi.value) {
    penalty += 10;
    constrainedSignals.push("high-dpi");
    reasons.push("High-DPI rendering increases the number of pixels to draw");
  }

  if (isAvailable(snapshot.cpu.logicalThreads)) {
    if (snapshot.cpu.logicalThreads.value <= 4) {
      penalty += 55;
      constrainedSignals.push("cpu-threads");
      reasons.push(`${snapshot.cpu.logicalThreads.value} logical CPU threads leave limited background headroom`);
    } else if (snapshot.cpu.logicalThreads.value >= 12) {
      capability += 20;
    }
  }
  if (isAvailable(snapshot.cpu.totalRamGb)) {
    if (snapshot.cpu.totalRamGb.value < 8) {
      penalty += 55;
      constrainedSignals.push("ram-capacity");
      reasons.push(`${Math.round(snapshot.cpu.totalRamGb.value)} GB RAM leaves limited headroom`);
    } else if (snapshot.cpu.totalRamGb.value >= 16) {
      capability += 20;
    }
  }
  if (isAvailable(snapshot.cpu.availableRamGb) && isAvailable(snapshot.cpu.totalRamGb) &&
      snapshot.cpu.totalRamGb.value > 0) {
    const freePct = snapshot.cpu.availableRamGb.value / snapshot.cpu.totalRamGb.value;
    if (freePct < 0.15) {
      penalty += 18;
      constrainedSignals.push("ram-pressure");
      reasons.push("Very little RAM is currently available");
    }
  }
  if (isAvailable(snapshot.gpu.integrated) && !snapshot.gpu.integrated.value &&
      isAvailable(snapshot.gpu.hardwareAcceleration) && snapshot.gpu.hardwareAcceleration.value) {
    capability += 25;
  }

  const hasCoreEvidence =
    isAvailable(snapshot.cpu.logicalThreads) ||
    isAvailable(snapshot.cpu.totalRamGb) ||
    isAvailable(snapshot.gpu.hardwareAcceleration) ||
    isAvailable(snapshot.rendering.software) ||
    isAvailable(snapshot.remoteSession);
  const unknownReasons = [
    snapshot.gpu.hardwareAcceleration,
    snapshot.rendering.software,
    snapshot.remoteSession,
    snapshot.power.onBattery,
  ].filter((signal) => signal.availability !== "available").length;

  if (!hasCoreEvidence || availableSignals < 2) {
    return {
      profile: "unknown",
      confidence: 0,
      score: 0,
      availableSignals,
      reasons: ["Not enough capability data has been collected yet"],
      constrainedSignals: [],
    };
  }

  let profile: AdaptivePerformanceProfile;
  if (penalty >= 55) {
    profile = "efficiency";
  } else if (penalty >= 18 || unknownReasons >= 3 || capability < 35) {
    profile = "balanced";
  } else {
    profile = "enhanced";
  }

  if (profile === "enhanced" && reasons.length === 0) {
    reasons.push("Hardware acceleration and available system capacity support the full experience");
  }
  if (profile === "balanced" && reasons.length === 0) {
    reasons.push("The available signals support a balanced visual and polling profile");
  }
  if (unknownReasons > 0) {
    reasons.push(`${unknownReasons} capability signal${unknownReasons === 1 ? "" : "s"} still unavailable; staying conservative`);
  }

  const confidence = Math.max(
    35,
    Math.min(98, Math.round((availableSignals / 8) * 65 + Math.min(35, Math.abs(penalty - capability)))),
  );
  return {
    profile,
    confidence,
    score: penalty - capability,
    availableSignals,
    reasons,
    constrainedSignals,
  };
}

export function getAdaptiveVisualPolicy(
  profile: AdaptivePerformanceProfile,
  reducedMotion = false,
): AdaptiveVisualPolicy {
  if (reducedMotion || profile === "efficiency" || profile === "unknown") {
    return { animateAmbient: false, cursorSpotlight: false, waveGrid: false, chartAnimation: false };
  }
  if (profile === "balanced") {
    return { animateAmbient: true, cursorSpotlight: false, waveGrid: false, chartAnimation: false };
  }
  return { animateAmbient: true, cursorSpotlight: true, waveGrid: true, chartAnimation: true };
}

export function getAdaptiveTelemetryPolicy(
  profile: AdaptivePerformanceProfile,
): AdaptiveTelemetryPolicy {
  switch (profile) {
    case "efficiency":
      return { intervalMultiplier: 4, heavyWorkMultiplier: 3 };
    case "balanced":
      return { intervalMultiplier: 1.5, heavyWorkMultiplier: 2 };
    case "enhanced":
      return { intervalMultiplier: 1, heavyWorkMultiplier: 1 };
    default:
      return { intervalMultiplier: 2, heavyWorkMultiplier: 2 };
  }
}

export function getAdaptiveTelemetryIntervalMs(
  profile: AdaptivePerformanceProfile,
  applicationIntervalMs: number,
  demandMode: AdaptiveTelemetryDemandMode,
  hiddenMultiplier = 1,
): number {
  const adaptiveBase = 2000 * getAdaptiveTelemetryPolicy(profile).intervalMultiplier;
  const base = Math.max(applicationIntervalMs, adaptiveBase);
  const demanded = demandMode === "intelligence" ? Math.max(5000, base) : base;
  return Math.round(demanded * hiddenMultiplier);
}