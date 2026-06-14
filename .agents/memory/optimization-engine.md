---
name: Optimization Engine architecture
description: Key decisions for the Adaptive Optimization Engine (Task #16) — scoring model, isolation pattern, and network separation.
---

## Rule
Keep the engine pure (no React/no side effects) in `shared/`. Score only, never apply. Isolated Zustand slice in `client/src/stores/optimizationStore.ts` means TweaksList never re-renders during analysis.

**Why:** Phase transitions (snapshotting → intent → deciding → plan → applying → done) update only the optimization store. TweaksList only subscribes to `startFlow` (stable function ref), so the list is never disturbed by modal state changes.

## How to apply
- Engine input/output types: `OptimizationEngineInput` → `OptimizationPlan` in `shared/optimizationEngine.ts`
- Per-tweak metadata in `shared/tweakOptimizationMeta.ts` (measurability class, intentWeights, conflictsWith, windowsBuildDecay)
- Hardware compatibility multiplier comes from `evaluateTweakForHardware()` in `shared/hardwareIntelligence.ts` — 0.0 = avoid, 1.0 = neutral, 1.3 = recommended
- Network optimization = intent routing only (not a separate code path); `networkTweakOnly` metadata flag gates those tweaks to network-responsiveness intent
- Session rollback: `sessionAppliedIds` tracked in optimization store; `bulkRevertTweaks()` in `use-tweak-executor.ts` calls Electron IPC `execute(id, 'revert', { context: 'bulk' })`
- Scoring formula: `baseConfidence × (intentWeight/10) × buildFactor × hwFactor × (1 − riskPenalty)`. Recommend ≥ 55, emit-avoided ≥ 35.
- unsafe-placebo tweaks always excluded via `skipAlwaysForEngine: true` + `antiRecommendReason` in metadata
