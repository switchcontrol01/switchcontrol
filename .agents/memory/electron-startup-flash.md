---
name: Electron startup white flash fix
description: Two-gate show pattern for zero-flash Electron startup — why ready-to-show alone is not enough
---

## The rule
Never call `mainWindow.show()` on `ready-to-show` alone. Use a two-gate pattern: only show after BOTH Chromium's first frame (`ready-to-show`) AND React's first composited frame (`app:first-frame-ready` via double-rAF) have fired.

## Why
`ready-to-show` fires when Chromium finishes its own render pass — but React hasn't committed the Splash component yet at that point. So showing on `ready-to-show` alone shows a white frame before the Splash is visible.

`useEffect` in React runs after commit but BEFORE the browser composites the frame. So calling `signalFirstFrameReady()` inside `useEffect` means the IPC arrives before the first painted frame is actually on screen.

Solution: double-rAF wrapping the `signalFirstFrameReady()` call in Splash.tsx guarantees the dark background is composited before the signal fires.

## How to apply
- `electron/main.js`: `_chromiumFrameReady` + `_reactSplashReady` flags; `_tryShowWindow()` checks both
- `client/src/screens/Splash.tsx`: `rAF(rAF(() => signalFirstFrameReady()))` in first useEffect
- All three `backgroundColor`s must match exactly: `#07090D` in BrowserWindow, preload.js, and HTML/CSS
- Fallback timer (5 s) still shows if IPC is ever lost
