---
name: Zustand selector stability
description: Object selectors in Zustand components must use useShallow to avoid React render loops in the Electron renderer.
---

When selecting multiple fields from a Zustand store, use `useShallow` or separate primitive selectors; returning a fresh object from a plain selector can trigger React error 185 and a blank Electron window.

**Why:** The renderer blanked after Dashboard mount because non-shallow preference selectors produced unstable snapshots.

**How to apply:** Audit every new multi-field Zustand selector, especially global layout/preferences consumers, before packaging the desktop renderer.