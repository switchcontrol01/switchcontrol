---
name: Electron startup flash and fade-in
description: How to eliminate the DWM white flash AND get a smooth fade-in on Windows Electron startup — without transparent:true overhead.
---

## Rule
Use `backgroundColor: '#07090D'` (matching app CSS background) + CSS opacity transition driven by `app:window-shown` IPC. **Do NOT use `transparent: true`** — it causes persistent DWM per-pixel alpha compositing lag for the window's entire lifetime.

## Why
- `transparent: true` was the old approach to prevent white flash. It works, but forces DWM into "layered window" mode (per-pixel alpha compositing on every frame forever) — causes animation jank and startup lag, especially visible during the Splash sequence.
- `backgroundColor: '#07090D'`: Win32 window brush is dark from the first DWM frame. On modern Windows + Chromium, this is sufficient to prevent a white flash when combined with the CSS opacity lock.
- `setOpacity(0→1)` is three synchronous native calls in one tick — a snap, not a fade. The app "instantly pops" visible with no animation.
- CSS `opacity` transition (280ms ease-out) driven by `app:window-shown` is compositor-accelerated and gives a smooth appearance with zero DWM overhead.

## The confirmed working pattern

**BrowserWindow options:**
```js
show: false,
backgroundColor: '#07090D',   // dark brush — no white flash, no transparent overhead
// transparent: true  ← DO NOT use; causes per-pixel DWM alpha lag forever
```

**`_tryShowWindow()` (both the normal path and 5s fallback):**
```js
mainWindow.show();
mainWindow.focus();
mainWindow.webContents.send('app:window-shown');  // triggers CSS fade
// setOpacity(0/1) ← DO NOT use; they snap, not animate, and need transparent:true
```

**`electron/preload.js`** (top-level, runs before contextBridge):
```js
// CSS opacity lock — content invisible while window is hidden
document.documentElement.style.setProperty('opacity', '0', 'important');

// Fade-in: triggered by app:window-shown IPC from main
ipcRenderer.once('app:window-shown', () => {
  const h = document.documentElement;
  h.style.setProperty('transition', 'opacity 280ms ease-out', 'important');
  requestAnimationFrame(() => {
    h.style.removeProperty('opacity');  // triggers 280ms ease-out from 0→1
    setTimeout(() => { h.style.removeProperty('transition'); }, 320);
  });
});
```

**`Splash.tsx` double-rAF** — only signals main, does NOT clear opacity:
```js
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    // Do NOT do: document.documentElement.style.opacity = ''
    // The preload's app:window-shown handler drives the fade-in.
    (window as any).electronAPI?.signalFirstFrameReady?.();
  });
});
```

## What NOT to do
- Do NOT use `transparent: true` — fixes flash but causes DWM compositing lag for the window's entire lifetime.
- Do NOT clear `html.style.opacity` in Splash.tsx's double-rAF — let `app:window-shown` drive the fade.
- Do NOT use `setOpacity(0→1)` — snaps, doesn't animate, and requires `transparent:true`.
- Do NOT use always-rendered `filter:blur` divs in CameraGlow to pre-warm GPU layers — adds constant per-frame blur shader cost. CameraGlow must render conditionally (`visible=true` only).

## Build note
After source changes, the packaged installer requires `npm run electron:build` (not `npm run dist:win`). Frontend changes need `npm run build` first.
