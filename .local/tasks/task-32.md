---
title: Startup sequence & animation polish
---
# Startup Sequence & Animation Polish

## What & Why
The app currently loads in visible stages: splash animation, auth/entitlement check, then the dashboard where hardware cards, telemetry graphs, and intelligence data pop in individually as each async call resolves. The goal is a single clean sequence — splash, then auth, then load data in the background, then one smooth fade into a fully-ready dashboard — with no loading cards popping in one at a time. This pairs with a general animation quality pass: fewer, better-timed 60fps transitions rather than many small flashy ones.

## Done looks like
- From splash to dashboard, the user sees: splash → (background auth + data fetch, no visible UI) → one smooth fade-in of the fully populated dashboard.
- No individual stat cards, graphs, or sections visibly pop in one-by-one after the dashboard is shown — data is ready (or explicitly skeleton-complete as a single state) before the fade-in begins.
- The fade-in transition is smooth and consistent (targeting 60fps), replacing any janky or overlapping entry animations.
- Existing per-session effects (e.g. dashboard startup glow) are preserved or intentionally folded into the new single transition — no duplicate/competing intro animations.
- Time-to-interactive dashboard is not worse than before, and ideally improves since work that previously blocked visible rendering is parallelized in the background.

## Out of scope
- Changing what data is fetched or how it's fetched (backend/API logic unchanged).
- On-demand loading for non-dashboard pages (handled in the on-demand page loading task).
- Adding new animations elsewhere in the app beyond the startup/fade-in sequence.

## Steps
1. **Define the unified loading gate** — determine the single readiness condition (specs loaded, auth resolved, first telemetry frame or acceptable timeout) that must be true before the dashboard is allowed to render, replacing the current per-component skeleton pattern.
2. **Background-load during auth/splash** — kick off hardware spec fetch, entitlement check, and any other startup data fetches in parallel during the splash/auth phase so they're ready (or gracefully timed out) by the time the gate opens.
3. **Single fade-in transition** — replace the current staged pop-in of dashboard cards with one coordinated fade/transition into the fully-populated dashboard, reusing or adapting the existing startup glow effect rather than stacking a new one on top.
4. **Animation quality pass** — review transition timings/easing used during startup and tighten them for a consistent 60fps feel; remove or merge redundant intro animations that fire in close succession.
5. **Verify no regression** — confirm login, trial activation, and returning-user flows all still work correctly through the new sequence, including error/timeout paths (e.g. slow network, entitlement check failure).

## Relevant files
- `client/src/App.tsx`
- `client/src/screens/Splash.tsx`
- `client/src/pages/Home.tsx`
- `client/src/components/layout/AppLayout.tsx`
- `client/src/lib/entitlementService.ts`
- `client/src/lib/motion.tsx`
- `client/src/lib/motionTokens.ts`