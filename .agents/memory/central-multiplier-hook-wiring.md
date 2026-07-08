---
name: Central multiplier hook wiring
description: Retrofitting a global timing multiplier (e.g. a light/low-power mode) across many timers in a codebase.
---

When a codebase has a shared polling hook used by many components (e.g. `useVisibilityInterval`, `usePollingInterval`), adding a mode-aware multiplier inside that hook instantly retrofits every caller — no per-call-site changes needed.

**Why:** This is the highest-leverage single edit, but it only covers call sites that already use the shared hook. Raw `setInterval`/`setTimeout` calls scattered in components, pages, and singleton managers (WebSocket handlers, debug overlays, singleton service modules) do NOT go through the hook and are silently unaffected.

**How to apply:** After wiring the shared hook(s), grep the whole codebase for raw `setInterval(` / `setTimeout(` call sites and triage each one individually: apply the multiplier, or explicitly document why it's excluded (e.g. a safety dead-man's-switch timer, or a sub-second foreground animation tied to active user action that must not degrade). Don't report "done" based on the hook change alone — enumerate and classify every raw timer site to make an honest completion claim.
