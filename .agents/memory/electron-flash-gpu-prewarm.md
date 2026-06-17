---
name: Electron flash — transparent+setOpacity nuclear fix
description: The only bulletproof zero-flash startup on Windows Electron is transparent:true + setOpacity(0→1). backgroundColor alone cannot prevent DWM white init frames.
---

## Rule
To completely eliminate the white startup flash in Electron on Windows, you MUST use `transparent: true` in BrowserWindow options and the `setOpacity(0) → show() → setOpacity(1)` pattern in `_tryShowWindow()`.

**DO NOT** rely on `backgroundColor` alone — it sets the DWM surface color but cannot prevent the one-frame white compositor init frame that Windows shows when a window first becomes visible.

**DO NOT** use `setOpacity()` without `transparent: true` — on Windows, `setOpacity()` is a documented no-op unless `transparent: true` is set at window creation.

## Why
- `backgroundColor: '#07090D'`: tells DWM to use dark as the native surface color. But on some Windows GPU/driver combos, there is still a one-frame white flash when `mainWindow.show()` is called, before Chromium's renderer content takes over the DWM surface.
- `transparent: true`: makes the DWM surface fully transparent — no white to flash. The visual dark background comes from CSS (`.app-root`, `html`, `body`). `setOpacity()` works with this flag.
- `setOpacity(0) → show() → setOpacity(1)`: three synchronous native calls in the same JS tick. DWM composites at opacity:1 on the very first frame — no window-reveal flicker possible.

## How to apply
In `_tryShowWindow()` (and the 5s fallback):
```js
mainWindow.setOpacity(0);
mainWindow.show();
mainWindow.focus();
mainWindow.setOpacity(1);
```

BrowserWindow options:
```js
transparent: true,
backgroundColor: '#00000000',   // companion required with transparent:true
show: false,
```

CSS must provide the dark background (`.app-root { background: hsl(var(--background)) }` = #14181D). The CSS opacity lock in preload.js (opacity:0, cleared by Splash.tsx double-rAF) remains as belt-and-suspenders.

## What NOT to do
- Do NOT use always-rendered filter:blur divs in CameraGlow "to pre-warm GPU layers." This adds constant per-frame GPU overhead (blur shader runs every frame even with no content) and adds compositor complexity during the critical startup path. CameraGlow should render conditionally (only when `visible=true`).
- After these source changes, the packaged app requires `npm run electron:build` to update the installer.
