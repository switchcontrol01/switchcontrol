---
name: Light Mode architecture
description: How the global low-resource Application Mode works and the rules to keep it centralized
---

# Light Mode (Application Mode) architecture

Rule: all Light Mode behavior flows from ONE store — `client/src/lib/appModeStore.ts`
(persisted `sc-app-mode`). Never add per-component `if (lightMode)` checks.

**How to apply:**
- Visual stripping: purely CSS via `html.app-light-mode` rules at the bottom of
  `index.css` (class synced by `AppModeClassSync` in App.tsx). New decorative
  effects should be strippable by class/selector, not JS branches.
- Polling: every timer reads `getPollingProfile()` (POLLING_PROFILES) and
  reschedules via `subscribeToAppMode`; hidden windows multiply the interval
  (`hiddenMultiplier`). telemetryManager is the reference implementation.
- Live graphs: gate with `LiveGraphsGate` / `useLiveGraphsActive()` — paused by
  default in light, per-session resume flag (`liveGraphsResumed`, not persisted).
- Mode switch uses `switchModeWithTransition` (~3s overlay, mode flips at 1400ms).
  The overlay's own keyframes must be re-exempted from the global
  `animation-duration: 0.01ms` clamp with explicit `html.app-light-mode` overrides.

**Why:** scattered mode checks were explicitly forbidden by the user and are the
main way this feature would rot; the CSS-class + central-profile pattern keeps
every feature functional in both modes.

Recommendation prompt is one-time (`recommendationShown`/`dontAskAgain`), only
fires after onboarding fully completes (gated in App.tsx on phase stable +
activeFlow none + tour flags), skips & retries next launch when confidence <40,
and only interrupts when Light is actually recommended.
