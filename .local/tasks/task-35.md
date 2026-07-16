---
title: Performance budget & admin debug page
---
# Performance Budget & Admin Performance Debug Page

## What & Why
The app needs explicit, documented performance targets (dashboard open time, idle CPU/RAM, minimum timer interval, no duplicate polling) and a way to verify them at runtime. Add an admin-only Performance Debug page that surfaces what's actually running under the hood — active timers, pollers, WebSocket connections, IPC listeners, React render counts, and live RAM/CPU/GPU usage — so regressions are visible instead of assumed.

## Done looks like
- A written performance budget exists and is checked against: dashboard opens in under 2 seconds, idle CPU under 1%, idle RAM under 350 MB, no timer under 1 second unless explicitly justified, no duplicate polling for the same data.
- An admin-only "Performance Debug" page is reachable from the admin area and shows, live: active timers/intervals, active pollers (network/telemetry/etc.), active WebSocket connections, active IPC listeners, a React render-count indicator, and current RAM/CPU/GPU usage in normal app mode.
- The debug page is only visible/reachable to admin users, consistent with existing admin route protection.
- The listed metrics reflect the real, consolidated timer/store architecture from the on-demand loading and state-dedup work (no stale duplicate entries shown).

## Out of scope
- Automated CI enforcement of the performance budget (this task delivers the documented budget and the visibility tooling, not a build-blocking check).
- Light Mode-specific instrumentation (already exists) — this page reports on normal app mode as requested.
- Any further reduction of polling/timers beyond what's already been consolidated by the dependency tasks.

## Steps
1. **Write the performance budget** — document the target numbers (dashboard load time, idle CPU/RAM ceilings, minimum timer interval, no duplicate polling) in a clear, checkable form.
2. **Build a lightweight runtime registry** — a central place where active timers/pollers/WebSocket connections/IPC listeners can register themselves (and deregister on cleanup) so they can be introspected at runtime without scattering debug code everywhere.
3. **Wire existing systems into the registry** — hook telemetry manager, network diagnostics, AI Advisor/Extreme Labs pollers, and IPC/WebSocket handlers into the registry so the debug page reflects real state.
4. **Build the admin-only Performance Debug page** — new route/page under the existing admin area showing live timers, pollers, WebSocket/IPC listener counts, a React render-count indicator, and RAM/CPU/GPU usage, protected the same way as other admin routes.
5. **Validate against the budget** — use the new page to check the app against the documented targets and note any that aren't currently met.

## Relevant files
- `client/src/pages/Admin.tsx`
- `client/src/lib/telemetryManager.ts`
- `client/src/hooks/useNetworkDiagnostics.ts`
- `server/routes/admin.ts`