---
name: electronAPI global typing conflict
description: Per-page `declare global { interface Window { electronAPI } }` conflicts with the canonical types file — pre-existing, do not "fix" inline.
---

`window.electronAPI` is declared canonically in `client/src/types/electron.d.ts`.
Several pages (e.g. `Debloater.tsx`, `NetworkTweaks.tsx`) ALSO re-declare a narrower
`declare global { interface Window { electronAPI?: {...} } }` block locally.

This produces pre-existing `tsc --noEmit` errors (TS2717 "Subsequent property
declarations must have the same type" + TS2339 "Property 'debloat' does not exist").

**Why:** The local augmentations narrow the type and clash with the global one.
The Vite/esbuild build IGNORES these (no full type-check), so the app builds & runs fine.

**How to apply:** When editing these pages, do NOT treat these tsc errors as your
regression — verify they predate your change. The real fix (out of scope for UI work)
is to unify all electronAPI typing into `electron.d.ts` and remove per-page `declare global`.
