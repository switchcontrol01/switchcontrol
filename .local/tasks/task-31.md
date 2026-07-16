---
title: On-demand page loading & cleanup
---
# On-Demand Page Loading & Cleanup

## What & Why
Several background systems currently run for the whole app session regardless of which page is open: network diagnostics ping every 30s via the global heartbeat, telemetry starts globally on auth, and some page-level timers/listeners are not guaranteed to tear down on unmount. This wastes idle CPU/RAM and battery on Electron. Pages like AI Advisor, BIOS Advisor, Driver Intelligence, Network, and Extreme Labs should only start their polling/refresh work while their page is actually open, and must fully release timers, listeners, observers, IPC subscriptions, and WebSocket handlers the moment the page closes.

## Done looks like
- Opening the Network page starts network diagnostics polling; navigating away stops it completely (no background pings).
- Opening AI Advisor starts its data polling/streaming; leaving the page stops it.
- Opening Extreme Labs starts its refresh cycle; leaving the page stops all Extreme Labs timers.
- BIOS Advisor and Driver Intelligence continue to be scan-on-demand (already lazy) — verified no regression and any residual timers still get cleaned up on unmount.
- No page leaves behind a running `setInterval`/`setTimeout`, event listener, `ResizeObserver`/`IntersectionObserver`, IPC listener, or WebSocket handler after navigating away — confirmed by manually checking each page's cleanup path.
- Idle CPU/RAM on a page other than the one actively polling measurably drops (spot-checked, not necessarily instrumented — instrumentation is a separate task).

## Out of scope
- Building the Performance Debug admin page or any instrumentation UI (separate task).
- Virtualizing lists (separate task).
- Consolidating duplicate Zustand stores (separate task).
- Changing the splash/auth/dashboard startup sequence itself (separate task), though this task's cleanup patterns should be reusable there.

## Steps
1. **Audit every polling/timer entry point** — catalog each `setInterval`, `setTimeout` loop, WebSocket/IPC subscription, and global listener that currently starts outside of its consuming page's mount (network heartbeat, telemetry auto-start, any others found during audit).
2. **Gate network diagnostics to the Network page** — network ping/benchmark polling must only run while the Network page is mounted and visible; confirm it already stops on unmount/hidden and extend the same gating to the heartbeat interval in the network store so it does not run when the Network page isn't open.
3. **Gate AI Advisor and Extreme Labs polling to their pages** — ensure all interval-driven refresh/status logic in these areas starts on page mount and fully stops on unmount, with no dangling timers if the user navigates away mid-cycle.
4. **Verify BIOS Advisor / Driver Intelligence lazy behavior** — confirm these remain scan-on-demand with no store-level auto-start, and add cleanup for any animation/timeout handles left dangling if the user navigates away mid-scan.
5. **Systematic unmount cleanup pass** — for every page/component touched above, ensure `useEffect` cleanup functions clear all timers, remove all listeners/observers, unsubscribe from IPC, and close/detach WebSocket handlers tied to that page.

## Relevant files
- `client/src/hooks/useNetworkDiagnostics.ts`
- `client/src/stores/networkStore.ts`
- `client/src/components/layout/AppLayout.tsx`
- `client/src/pages/AiAdvisor.tsx`
- `client/src/pages/ExtremeLabs.tsx`
- `client/src/pages/BiosAdvisor.tsx`
- `client/src/stores/driverIntelStore.ts`
- `client/src/lib/telemetryManager.ts`
- `client/src/App.tsx`