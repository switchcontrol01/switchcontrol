---
title: State dedup & batched telemetry updates
---
# State Deduplication & Batched Telemetry Updates

## What & Why
Some state is currently tracked in more than one place: applied-tweak state exists in both the main app store and the tweak ownership store, and the latest CPU metric is duplicated between the telemetry store and the performance store. Keeping two sources of truth for the same data risks drift and adds unnecessary re-renders. Separately, when a telemetry frame delivers multiple values at once (CPU, RAM, GPU, etc.), each value updates state independently instead of as one batched update, causing extra React re-renders per frame.

## Done looks like
- Applied-tweak state lives in exactly one store; anything that previously read/wrote the duplicate copy now reads/writes the single source of truth, with no behavior change for tweak apply/revert/ownership tracking.
- The latest CPU (and other shared telemetry) metric lives in exactly one store; the performance store derives from it instead of holding its own duplicate copy.
- A single telemetry frame containing multiple metrics results in one React state update / one re-render cycle for subscribed components, not one per metric.
- No feature relying on the removed duplicate state breaks (tweak reversion, ownership metadata, low-performance-mode detection, telemetry graphs).

## Out of scope
- Changing the shape of telemetry data sent from the server/Electron backend.
- Virtualization or on-demand page loading (separate tasks).
- Building the performance debug page (separate task, but will consume the cleaned-up state from this one).

## Steps
1. **Consolidate tweak state** — merge `tweakOwnershipStore`'s tracking into the single authoritative source (or vice versa), preserving ownership metadata (appliedByApp, timestamp, previousState) needed for reversion, and update every consumer to use the one store.
2. **Consolidate telemetry/performance CPU state** — have the performance store derive its low-performance-mode logic from the telemetry store's live value instead of holding its own copy.
3. **Batch multi-metric telemetry updates** — when a telemetry frame arrives with several values, apply them to the store in a single update so subscribers re-render once per frame instead of once per field.
4. **Regression check** — verify tweak apply/revert/ownership flows, low-performance-mode triggers, and live telemetry graphs all behave identically after consolidation.

## Relevant files
- `client/src/lib/store.ts`
- `client/src/stores/tweakOwnershipStore.ts`
- `client/src/stores/telemetryStore.ts`
- `client/src/stores/performanceStore.ts`
- `client/src/lib/telemetryManager.ts`