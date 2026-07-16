# Eliminate Electron Startup White Flash

## What & Why
On every launch, the Electron window shows a white rectangle for a noticeable duration before the app's dark content appears. The flash is most visible during the Splash → Booting transition. The current three-layer flash prevention (native `backgroundColor`, preload opacity lock, `#boot-shell`) is not fully effective because the atmospheric background div behind the Splash fades IN from opacity 0 (instead of always being present), leaving a brief gap where neither the Splash nor the background fully covers the content area.

## Done looks like
- App launches and the window is dark from the very first frame — no white rectangle visible at any point
- Splash plays normally over a dark background
- The Splash → Booting → Authenticated transition is visually seamless with no white or light frames

## Out of scope
- Changing the Splash animation timing or design
- Fixing anything web/browser-side (this is Electron-only)
- Changes to the CameraGlow animation

## Steps

1. **Remove the background div's opacity transition** — In `App.tsx`, the persistent atmospheric background div uses `opacity: phase === "splash" ? 0 : 1` with a `transition: "opacity 0.35s ease-out"`. Change this to always be `opacity: 1`. The Splash at `zIndex: 1` already covers it during startup, so keeping it hidden during splash serves no visual purpose and only creates a gap when transitioning out.

2. **Remove the `#boot-shell` fade** — In `main.tsx`, the `#boot-shell` fades out with `opacity: 0` and a 0.15s CSS transition before being removed. Change this to immediately set `display: none` or call `remove()` without the transition, since the dark Splash is already covering it when the double-rAF fires.

3. **Revert the CameraGlow 2-rAF delay** — In `App.tsx`, the `setShowGlow(true)` was delayed by 2 rAFs after `splashDone`. Remove this delay and activate CameraGlow immediately when `splashDone` becomes true. The GPU layer consolidation fix (single `filter: blur(12px)` wrapper) already addresses the underlying compositor issue that motivated the delay.

4. **Verify in packaged build** — After making changes, run `npm run build` to verify the bundle compiles. Note that the real fix is only testable in the packaged Electron app (not dev mode), since `show: false` gate logic behaves differently in dev.

## Relevant files
- `client/src/App.tsx:1362-1396`
- `client/src/App.tsx:1019-1028`
- `client/src/main.tsx:94-108`
- `electron/preload.js:1-22`
