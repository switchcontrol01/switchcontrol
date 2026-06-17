---
name: Electron flash — GPU layer pre-warm
description: CameraGlow's filter:blur outer container must always be rendered so Chromium creates its GPU compositing layer while the window is hidden, not after it's visible.
---

## Rule
Any `filter: blur()` element that mounts conditionally after `mainWindow.show()` will cause a one-frame white stall on Windows when it first appears. Always pre-render the outer filter container (even when content is invisible) so the GPU layer is created during the hidden-window phase.

## Why
On Windows, promoting a brand-new full-screen GPU compositing layer while the window is already visible shows one frame of the layer's uninitialized texture (white). Even if the element has `opacity: 0`, inner scale-animated sub-layers inside a `filter:blur` parent need one additional frame to propagate their textures through the filter chain — this frame can flash white.

## How to apply
- CameraGlow: outer `<div style={{ filter: "blur(12px)" }}>` is **always** rendered; the `AnimatePresence` + fade `motion.div` are nested inside it.
- Any future full-screen filter overlay: render its filter container immediately on app mount, gate content visibility via inner AnimatePresence or opacity, not by conditional render of the filter container itself.
- The three other confirmed flash fixes (devTools:isDev, no scale on Splash exit, single outer filter) remain required in addition to this pre-warm.
- After any of these source changes, the packaged app requires `npm run electron:build` to update the installer.
