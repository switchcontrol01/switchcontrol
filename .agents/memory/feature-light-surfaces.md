---
name: Feature light surfaces
description: Avoid unreadable controls when a light feature theme lives inside SwitchControl's dark app.
---

When applying an approved light feature theme, verify computed foreground and background together for shared inputs, safety notices, sort menus, cards, and portal dialogs. Test actual shared Button variants in normal, hover, disabled, and keyboard-focus states. A page-level dark-ink text override is not enough; shared components may retain dark backgrounds.

**Why:** The Debloater watercolor redesign left shared outline buttons and secondary cards unreadable after its main panels and search field had already been corrected. Checking only the feature's main surfaces missed shared component variants.

**How to apply:** Add explicit feature-scoped surface hooks for these controls and independent theme roots for body-portaled overlays. Pair control text with opaque fallback surfaces, preserve destructive-action contrast, and cover GlassCard hover backgrounds as well as resting states. Verify representative computed styles using the actual shared components without bypassing app authentication; distinguish isolated fixture checks from actual signed-in Windows UI verification.
