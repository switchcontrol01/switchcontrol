---
name: Network and slider cross-sync
description: The Network Throttling Index toggle and numeric slider are two live views of one registry value.
---

The Network Throttling Index surfaces must synchronize through a verified cross-surface event: `0xFFFFFFFF` means throttling disabled/enabled in the UI, while ordinary values mean the Windows limit is active.

**Why:** Updating only Zustand or only a component's local hook state leaves the other surface showing stale current/pending values and contradictory applied status.

**How to apply:** After either surface verifies a write, update the shared value, mirror the boolean network state, and dispatch the cross-surface sync event so mounted cards adopt the same current and pending value immediately. In Electron, native verification is authoritative; backend state is audit/history data and must not overwrite it when responses race.