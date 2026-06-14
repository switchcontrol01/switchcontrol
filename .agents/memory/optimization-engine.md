---
name: Optimization Engine architecture
description: Durable decisions for the Adaptive Optimization Engine — separation, field-name trap, outcome-driven apply/revert, impact levels, deterministic IDs.
---

## Separate network engine (never merge into main engine)
`shared/networkOptimizationEngine.ts` is a distinct scoring path from the main engine. Uses network-specific signals (wired detection, WiFi adapter presence, RX/TX traffic). Different safety rules: WiFi-disable gated on `isWired === true`; Bluetooth gated on wired status. Returns the same `OptimizationPlan` shape so the plan UI is shared. **Why:** Main engine hardware signals (CPU/GPU family, RAM) are irrelevant to network scoring; network tweaks carry catastrophic safety risks (WiFi-disable on wireless = disconnect) requiring dedicated guards.

## cpuBrand vs cpuName — field-name trap
`HardwareProfileInput` uses `cpuBrand` (not `cpuName`). When collecting Electron specs, map `cpu.model → hardware.cpuBrand`. Wrong field name silently bypasses X3D/Intel hybrid classification.

## Apply/revert require explicit success === true
`bulkApplyTweaks` / `bulkRevertTweaks` return `Record<string, TweakResult>`. Missing results must be treated as failure, not assumed success. Only call `setTweak(id, true/false)` when `results[id]?.success === true`. **Why:** Optimistic fallback desynchronizes UI from actual system state under partial executor anomalies.

## Revert failure handling
On partial/total Electron revert failure: only clear local state for confirmed successes; surface stuck count in DonePhase amber notice. Never clear state on total failure. **Why:** Clearing state on failure masks real system state — user must know which tweaks may still be active.

## Plan cache busted after apply
`finishApplying()` sets `_planCache: {}`. Re-opening the flow after an apply always recomputes plans with current `alreadyApplied` flags. **Why:** Stale plan cache would re-offer already-applied tweaks.

## Web apply uses applyRecommended() from api.ts
Not `apiRequest()` from queryClient. `applyRecommended` calls `apiPost` with `withCsrf: true`, which attaches `x-csrf-token`.

## PlanEntry fields
- `expectedImpact: "high" | "medium" | "low"` — derived from final score (≥80/≥65/<65). Both engines populate this.
- `sessionId` — deterministic hash of (intent + sorted tweak IDs) for main engine; (signal fingerprint + sorted tweaks) for network engine. Uses djb2 via `deterministicHash()` in `shared/optimizationEngine.ts`.
