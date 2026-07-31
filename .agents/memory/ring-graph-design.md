---
name: Ring graph design rule
description: Visual rule for circular gauge/ring charts — no inner tick ring or decorative border inside the arc.
---

# Ring gauge — no inner tick ring

**Rule:** Circular progress rings (SVG arc gauges) must NOT have an inner tick ring, dashed decorative circle, or any additional SVG `<circle>` stroke drawn inside the main arc track.

**Why:** The dashboard's ring (Performance Lab, System Stability) is the design reference — it renders only the outer track + value arc, giving a clean, uncluttered look. An inner dashed/solid ring adds visual noise and creates the impression the component is decorated rather than data-driven. The user explicitly confirmed this standard when removing the dashed inner ring from `StartupScore`.

**How to apply:** When building any new ring/gauge component:
- SVG contains exactly two `<circle>` elements: the **track** (faint, full 360°) and the **value arc** (coloured, animated dashoffset).
- No third `<circle>` for ticks, inner borders, or decorative rings.
- Glow is applied via `filter: drop-shadow(...)` on the value arc only — not via an extra circle stroke.
