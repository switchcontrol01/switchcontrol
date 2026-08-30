---
name: AnimatePresence exit boundary
description: Component-level unmount behavior required for Framer Motion exit animations.
---

When a component owns a motion element that must animate out, keep the component mounted and conditionally render the motion child inside its own `AnimatePresence`; do not return `null` immediately when dismissed.

**Why:** Returning `null` removes the motion element in the same render, so Framer Motion never observes an exit state and the UI disappears instantly.

**How to apply:** Put the visibility condition around the keyed motion child inside `AnimatePresence`, keep the exit transition on that child, and let the parent remain mounted until the exit completes.