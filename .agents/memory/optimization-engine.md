---
name: Optimization Engine architecture
description: Durable decisions for the Adaptive Optimization Engine — network separation, cache TTLs, outcome-driven apply/revert, and key field-name trap.
---

## Separate network engine (never merge back into main engine)
`shared/networkOptimizationEngine.ts` is a completely distinct scoring path:
- Uses network-specific signals collected by `client/src/lib/networkOptimizationSnapshot.ts` (wired detection via Electron interface list, WiFi adapter presence, live RX/TX traffic)
- Different safety rules: WiFi-disable gated on `isWired === true`; Bluetooth gated on wired status
- Only scores network-relevant tweaks — never general hardware tweaks
- Returns the same `OptimizationPlan` shape so the plan UI is shared

**Why:** The main engine's hardware signals (CPU/GPU family, RAM, laptop detection) are irrelevant to network scoring; mixing them caused incorrect recommendations. Network tweaks have different risk/safety semantics (WiFi disable on wireless = catastrophic) requiring dedicated guards.

## cpuBrand vs cpuName — critical field name trap
`HardwareProfileInput` uses `cpuBrand` (not `cpuName`). When collecting hardware from Electron specs, map `cpu.model → hardware.cpuBrand`. Wrong field name silently bypasses X3D/Intel hybrid classification.

## Apply/revert must require explicit success === true
`bulkApplyTweaks` and `bulkRevertTweaks` return `Record<string, TweakResult>`. Treat missing results as failure (not assumed success). Only call `setTweak(id, true/false)` when `results[id]?.success === true`. Missing entries indicate executor anomaly, not success.

**Why:** Optimistic fallback (`success !== false`) can desync UI from actual system state under partial executor failures, showing tweaks as applied/reverted when they aren't.

## Revert failure handling
On Electron revert: only clear local state for confirmed successes. On partial/total failure: surface stuck count in DonePhase with amber notice; preserve local state so user can retry or manually investigate. Never clear local state on total failure just to "avoid stuck state" — that masks real system state.

## Plan cache invalidation
`finishApplying()` in the store busts `_planCache = {}`. This ensures re-opening the flow after an apply always recomputes plans reflecting the new `alreadyApplied` flags — prevents re-offering already-applied tweaks.

## Web apply uses applyRecommended() from api.ts
Not `apiRequest()` from queryClient. `apiRequest` does not attach `x-csrf-token`; `applyRecommended` calls `apiPost` which uses `apiFetch` with `withCsrf: true`.
