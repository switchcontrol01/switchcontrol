---
name: Timer resolution single control
description: The Global Timer Resolution toggle and System Timer Resolution slider are two live views of one NtSetTimerResolution request.
---

Both timer-resolution controls must stay bidirectionally synchronized in Zustand and local card state, and switching surfaces must release the other surface's keeper process before changing the request.

**Why:** They target the same Windows timer-resolution behavior; treating them as independent controls leaves stale UI or two competing keeper processes.

**How to apply:** Keep `timer-res` fixed at 0.5 ms when enabled, map slider value 5 to enabled and 156 to disabled, and use the shared cross-state event when a control has local React state.