---
name: First-run handoff sequencing
description: Transition sequencing for authenticated first-run gates and the shared visual cover.
---

The source screen must remain mounted until the handoff cover reaches full opacity; only then should the target phase mount. This applies to login-to-language as well as later first-run gates.

**Why:** Switching the React phase before starting the cover removes the source screen, leaving an uncovered visual cut and making the transition appear to happen instantly.

**How to apply:** Start the handoff while retaining the source phase, perform the phase swap from the cover midpoint callback, and let the same overlay reveal the target.

The final Welcome-to-Dashboard reveal has a separate constraint: hold the dashboard scrim opaque and blurred until the dashboard route has actually mounted. `AnimatePresence mode="wait"` can otherwise let the scrim finish before the dashboard exists.

**Why:** The dashboard route waits for the Welcome exit, while an independently mounted scrim starts when the phase changes; starting both clocks together creates a race at the reveal boundary.

**How to apply:** Drive the scrim reveal from a dashboard-mounted/ready signal, not from the authenticated phase alone.