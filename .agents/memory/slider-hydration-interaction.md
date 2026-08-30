---
name: Slider hydration interaction
description: How slider controls should behave when native readback is delayed or unavailable during startup.
---

When a native slider read is unavailable, the UI may not have a confirmed current value yet, but an explicit user selection is still valid intent and must be applyable. Untouched controls must remain clean so startup does not create false Apply states.

**Why:** Startup PowerShell contention can return a deliberate busy result for several hydration attempts. Treating the missing current value as “not dirty” made users click Reset before a normal selection could be applied.

**How to apply:** Track whether the user explicitly interacted with the control. Compare pending and confirmed values whenever current state is known; when current state is unknown, use explicit interaction as the dirty signal. Clear that marker after verified apply, reset, or revert.