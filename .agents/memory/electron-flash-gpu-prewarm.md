---
name: Electron startup flash and smooth fade-in
description: How to eliminate the DWM white flash AND get a smooth animated fade-in on Windows Electron startup — the only confirmed-working approach.
---

## Rule
Use `transparent: true` + `setOpacity(0)→show()` to kill the flash, then animate `setOpacity` from 0→1 over ~280ms with ease-out for a smooth fade-in. **Do NOT** use `backgroundColor` alone (can't prevent DWM white init frame on some GPU/driver combos). **Do NOT** snap `setOpacity(1)` immediately (no fade = instant pop).

## Why
- `backgroundColor: '#07090D'` alone: tells DWM to use dark as the native surface. But on some Windows GPU/driver combos there is still a one-frame white compositor init frame when `show()` is called. Confirmed NOT sufficient.
- `transparent: true`: DWM surface is transparent — no white to flash. Also required for `setOpacity()` to function on Windows (it's a documented no-op without this flag).
- `setOpacity(0) → show()`: window is OS-invisible at the moment Windows composites it, so no white frame can appear.
- `setOpacity` animated 0→1: fades the entire OS window (dark background + splash content) from invisible to fully visible — premium cross-fade from desktop background.
- CSS opacity lock in preload + cleared by Splash.tsx double-rAF: ensures content is at CSS opacity=1 before the OS-level fade starts, so no partial render is visible during the animation.

## The confirmed working pattern

**BrowserWindow options:**
```js
show: false,
transparent: true,
backgroundColor: '#00000000',  // required companion to transparent:true
```

**`_tryShowWindow()` (and 5s fallback):**
```js
mainWindow.setOpacity(0);
mainWindow.show();
mainWindow.focus();
mainWindow.webContents.send('app:window-shown');

// Animate OS-level opacity 0 → 1 with ease-out over 280ms
const _FADE_MS = 280, _FADE_TICK = 16;
let _fadeElapsed = 0;
const _fadeTimer = setInterval(() => {
  if (!mainWindow || mainWindow.isDestroyed()) { clearInterval(_fadeTimer); return; }
  _fadeElapsed += _FADE_TICK;
  const t = Math.min(1, _fadeElapsed / _FADE_MS);
  const eased = 1 - (1 - t) * (1 - t); // ease-out quad
  mainWindow.setOpacity(eased);
  if (t >= 1) { clearInterval(_fadeTimer); mainWindow.setOpacity(1); }
}, _FADE_TICK);
```

**`electron/preload.js`** — CSS opacity lock only, no fade handler needed:
```js
document.documentElement.style.setProperty('opacity', '0', 'important');
// Splash.tsx double-rAF clears this before signaling main.js
```

**`Splash.tsx` double-rAF** — clears CSS opacity lock AND signals:
```js
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.documentElement.style.opacity = '';  // must clear BEFORE signal
    (window as any).electronAPI?.signalFirstFrameReady?.();
  });
});
```

## What NOT to do
- Do NOT use `backgroundColor` alone without `transparent:true` — flash returns on some GPU/driver combos. Confirmed user-reported.
- Do NOT snap `setOpacity(1)` synchronously after `show()` — instant pop, no animation.
- Do NOT add a CSS opacity transition in preload driven by `app:window-shown` instead of the setOpacity animation — with transparent:true, CSS opacity:0 shows the desktop through the transparent Electron window (not the dark background), so the "fade" is from desktop → app, which looks wrong and is confusing.
- Do NOT use always-rendered `filter:blur` divs in CameraGlow — adds constant per-frame blur shader cost every frame. CameraGlow must render conditionally (`visible=true` only).

## Build note
After source changes, packaged installer requires `npm run electron:build` (not `npm run dist:win`). Frontend changes need `npm run build` first.
