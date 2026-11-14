---
name: Driver Inspector motion
description: Requested motherboard sweep behavior and the feature-specific motion preference boundary.
---

The user wants a clean 1.5-second motherboard light sweep from top-left to bottom-right, once on entry and again on Rescan. They do not want a blue CPU selection highlight.

**Why:** The user repeatedly reported that the promised sweep was invisible in the installed app and that Driver Intelligence felt static.

**How to apply:** Preserve the explicit one-shot behavior; do not introduce an idle loop or retrigger it when switching components. Keep keyboard focus visible without restoring the cyan selection glow.

Driver Inspector's deliberate entrance/exit, selection transitions, reflection, and sweep follow SwitchControl's own Reduce Motion setting rather than Windows Animation Effects.

**Why:** Windows Animation Effects can be disabled by the user's performance tweak, while they still explicitly want these feature animations. App Reduce Motion remains the opt-out.

**How to apply:** Keep this policy scoped to Driver Inspector, not the whole application. Verify image effects with the real asset over file://, including entry, Rescan, re-entry, cleanup, and the app motion opt-out; an HTTP-only check does not establish packaged-renderer compatibility.
