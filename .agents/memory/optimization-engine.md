---
name: Optimization Engine architecture
description: Key decisions for the Adaptive Optimization Engine — scoring model, isolation pattern, cache TTLs, network engine separation, and outcome-driven apply.
---

## Rule
Keep the main engine pure (no React/no side effects) in `shared/`. Score only, never apply. Isolated Zustand slice in `client/src/stores/optimizationStore.ts` means TweaksList never re-renders during analysis.

**Why:** Phase transitions (snapshotting → intent → deciding → plan → applying → done) update only the optimization store. TweaksList only subscribes to `startFlow` (stable function ref), so the list is never disturbed by modal state changes.

## Network optimization is a separate engine
`shared/networkOptimizationEngine.ts` is a completely distinct scoring path from the main engine:
- Uses network-specific signals: wired detection, WiFi adapter presence, live RX/TX traffic
- Different safety rules: never recommend WiFi-disable unless `isWired === true`; bluetooth avoid unless wired
- Only scores network-relevant tweaks (main engine excluded tweaks filter)
- Returns the same `OptimizationPlan` shape so the plan UI is reused unchanged
- Triggered ONLY when `intent === "network-responsiveness"` in the deciding phase

## Apply/revert must be outcome-driven
`handleApply` tracks per-tweak success from `bulkApplyTweaks(ids)` → `Record<string, TweakResult>`. Only calls `setTweak(id, true)` and adds to `appliedIds` if `result.success !== false`. Web path checks `res.ok` before marking applied. `finishApplying(appliedIds, failedIds)` takes both arrays — DonePhase shows partial failure state.

`handleRevert` clears local state only for confirmed reverts (Electron: `result.success !== false`); on total failure still clears local state to avoid permanent stuck state.

## Cache TTLs
- Snapshot cache: 10 min (avoids re-running `collectOptimizationSnapshot`)
- Plan cache: 15 min per intent (keyed by intent, avoids re-running engine)
- Both caches survive `reset()` — only `startFlow()` checks them

## How to apply
- Engine input/output types: `OptimizationEngineInput` → `OptimizationPlan` in `shared/optimizationEngine.ts`
- Per-tweak metadata in `shared/tweakOptimizationMeta.ts` (measurability class, intentWeights, conflictsWith, windowsBuildDecay)
- Hardware compatibility multiplier comes from `evaluateTweakForHardware()` in `shared/hardwareIntelligence.ts` — 0.0 = avoid, 1.0 = neutral, 1.3 = recommended
- Session rollback: `sessionAppliedIds` tracked in optimization store; `bulkRevertTweaks()` in `use-tweak-executor.ts` calls Electron IPC `execute(id, 'revert', { context: 'bulk' })`
- Scoring formula: `baseConfidence × (intentWeight/10) × buildFactor × hwFactor × (1 − riskPenalty)`. Recommend ≥ 55, emit-avoided ≥ 35.
- unsafe-placebo tweaks always excluded via `skipAlwaysForEngine: true` + `antiRecommendReason` in metadata
