---
name: Electron log noise patterns
description: Known patterns that produce false [ERROR] or repeated log noise in the Electron main-process log, and how to fix each.
---

## renderer console.warn → main [ERROR]
The Electron main process maps renderer `console.warn(...)` calls to `[ERROR] [Renderer:warn]` in the main log. Expected race conditions logged as `warn` appear as errors.

**Fix:** Use `console.info(...)` for known, expected situations. Main process maps `info` → `[LOG]`.

**Applied to:** `use-slider-tweak.ts` — the "busy" error (PS limiter occupied at startup) was `console.warn`, now `console.info`.

## useRef scan guard resets on unmount
`useRef(false)` inside a component resets to `false` every time the component unmounts and remounts (page navigation). Any "run once per session" guard built with `useRef` will re-run on every page visit.

**Fix:** Promote to a module-level `let` variable outside the component function. Module scope persists for the app's lifetime.

**Applied to:** `AppBooster.tsx` — `hasAutoScanned = useRef(false)` → `let _sessionAutoScanDone = false` (module-level). Eliminated duplicate 5-second game scan on every page visit.

## Slider hydration "busy" race at startup
8 slider reads fire simultaneously on Tweaks mount. PS limiter allows only 1 concurrent `slider:readValue`. The first read acquires the limiter; the other 7 get "acquire SKIPPED" and return `{ error: "busy", value: null }`. This is expected behavior, not a failure.

Previously logged as `console.warn` → 14 `[ERROR]` lines per session (7 on first mount, 7 on re-mount). Now `console.info` → `[LOG]` lines.
