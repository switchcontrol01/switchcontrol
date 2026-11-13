---
name: Startup action safety and delay semantics
description: Why startup controls must carry exact source identity, verify Windows results, and replace rather than duplicate immediate launch.
---

A delayed startup must suppress the original immediate launch, retain the executable's
arguments and working directory, and persist the chosen duration across scans. Enable
or Disable must cancel the matching delayed launch. Respect user versus machine scope
and keep delayed applications non-elevated. Do not change an unidentified startup source.

**Why:** The user reported failed Disable and missing Delay behavior. The Security
startup UI and native handler expected incompatible fields, the delay menu was clipped,
and the old delay implementation scheduled an additional launch without suppressing the
original one.

**How to apply:** Carry the exact startup identity through UI and native operations.
Require post-write Windows evidence before showing success. Treat task registration
and immediate-launch suppression as one operation with rollback. Remove legacy delayed
tasks only when their name and executable identify the same application. Keep timing
menus in normal flow or an appropriate portal rather than clipping them inside rows.
