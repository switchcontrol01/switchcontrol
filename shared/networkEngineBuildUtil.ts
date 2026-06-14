/**
 * networkEngineBuildUtil.ts — shared Windows build decay for the network engine.
 * Kept separate to avoid circular deps between optimizationEngine and networkOptimizationEngine.
 */

const BUILD_WIN11_22H2 = 22621;
const BUILD_WIN11_24H2 = 26100;

const NETWORK_BUILD_DECAY: Record<string, Array<{ buildMin: number; multiplier: number }>> = {
  "sys-responsiveness": [
    { buildMin: BUILD_WIN11_24H2, multiplier: 0.85 },
  ],
  "irq-priority": [
    { buildMin: BUILD_WIN11_22H2, multiplier: 0.8 },
    { buildMin: BUILD_WIN11_24H2, multiplier: 0.65 },
  ],
};

export function windowsBuildFactor(tweakId: string, build: number | null): number {
  if (!build) return 1.0;
  const decay = NETWORK_BUILD_DECAY[tweakId];
  if (!decay) return 1.0;
  let factor = 1.0;
  for (const entry of decay) {
    if (build >= entry.buildMin) factor = Math.min(factor, entry.multiplier);
  }
  return factor;
}
