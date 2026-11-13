// One deterministic scoring policy for desktop, web, and server analysis.
// CPU seconds are cumulative since process start, NOT current CPU utilisation.
export interface ScoreProcess {
  impact: string;
  memMb: number | null;
}

export interface ScanCoverage {
  startup: boolean;
  background: boolean;
}

export interface IntegrityInput {
  status: {
    source?: string;
    defenderAvailable?: boolean | null;
    realtimeProtection?: boolean | null;
    firewallEnabled?: boolean | null;
    tamperProtection?: boolean | null;
    antispywareEnabled?: boolean | null;
  } | null | undefined;
  startupItems: Array<{ recommendation: string; impact: string }>;
  topProcesses: ScoreProcess[];
  scanCoverage?: ScanCoverage;
}

export interface IntegritySummary {
  threatCount: number; // Disabled observed protection controls, not detected malware.
  startupIssues: number;
  backgroundIssues: number;
  healthScore: number | null;
  systemState: "secure" | "attention" | "optimize" | "unknown";
  scores: { protection: number | null; startup: number | null; background: number | null };
  coveragePercent: number;
  scoringVersion: 2;
}

export const isHeavyProcess = (p: ScoreProcess): boolean =>
  p.impact === "high" || (Number.isFinite(p.memMb) && p.memMb! >= 1024);

export function scoreIntegrity(data: IntegrityInput): IntegritySummary {
  const { startupItems, topProcesses } = data;
  const status = data.status?.source === "unavailable" ? null : data.status;
  const defenderKnown = status?.defenderAvailable !== false;
  const controls = [
    { value: defenderKnown ? status?.realtimeProtection : null, weight: 40 },
    { value: status?.firewallEnabled, weight: 35 },
    { value: defenderKnown ? status?.tamperProtection : null, weight: 15 },
    { value: defenderKnown ? status?.antispywareEnabled : null, weight: 10 },
  ].filter(c => typeof c.value === "boolean");
  const protectionWeight = controls.reduce((sum, c) => sum + c.weight, 0);
  const enabledWeight = controls.reduce((sum, c) => sum + (c.value ? c.weight : 0), 0);
  const protection = protectionWeight ? 100 * enabledWeight / protectionWeight : null;
  const startupKnown = data.scanCoverage?.startup ?? startupItems.length > 0;
  // A process list without any usable observations is not a clean process scan.
  const backgroundKnown = (data.scanCoverage?.background ?? topProcesses.length > 0) &&
    topProcesses.some(p => Number.isFinite(p.memMb) && p.memMb! >= 0);
  const reviewItems = startupItems.filter(i => i.recommendation === "review" || i.recommendation === "disable");
  const startupPenalty = reviewItems.reduce((sum, i) => sum +
    (i.impact === "high" ? 10 : i.impact === "medium" ? 6 : 3) *
    (i.recommendation === "disable" ? 1.5 : 1), 0);
  const footprintPenalty = topProcesses.reduce((sum, p) => sum +
    (p.impact === "high" ? 8 : 0) +
    (Number.isFinite(p.memMb) && p.memMb! > 0 ? p.memMb! / 512 : 0), 0);
  const startup = startupKnown ? Math.max(0, 100 - startupPenalty) : null;
  const background = backgroundKnown ? Math.max(0, 100 - footprintPenalty) : null;
  // Protection 50%, startup 30%, sampled process footprint 20%.
  // Only observed checks enter the denominator; coverage remains visible.
  const availableWeight = protectionWeight * 0.5 + (startupKnown ? 30 : 0) + (backgroundKnown ? 20 : 0);
  const points = enabledWeight * 0.5 + (startup ?? 0) * 0.3 + (background ?? 0) * 0.2;
  const healthScore = availableWeight ? Math.round(100 * points / availableWeight) : null;
  const threatCount = controls.filter(c => c.value === false).length;
  const backgroundIssues = backgroundKnown ? topProcesses.filter(isHeavyProcess).length : 0;
  const systemState = threatCount ? "attention" :
    healthScore === null || availableWeight < 100 ? "unknown" :
    reviewItems.length || backgroundIssues || healthScore < 90 ? "optimize" : "secure";
  return {
    threatCount, startupIssues: startupKnown ? reviewItems.length : 0, backgroundIssues,
    healthScore, systemState,
    scores: {
      protection: protection === null ? null : Math.round(protection),
      startup: startup === null ? null : Math.round(startup),
      background: background === null ? null : Math.round(background),
    },
    coveragePercent: Math.round(availableWeight), scoringVersion: 2,
  };
}
