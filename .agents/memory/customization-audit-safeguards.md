---
name: Customization audit safeguards
description: Settings remains an unhideable recovery route and graph animation has an independent motion preference.
---

The Settings navigation item must always remain visible, and graph animation preferences must not disable unrelated application motion.

**Why:** Customization must never lock users out of recovery, and accessibility/reduced-motion behavior should not be conflated with chart-only animation control.

**How to apply:** Exclude Settings from hideable navigation controls and keep reduced-motion and graph-animation classes/effects separate.