---
name: Feature light surfaces
description: Avoid unreadable controls when a light feature theme lives inside SwitchControl's dark app.
---

When applying an approved light feature theme, verify computed foreground and background together for shared inputs, safety notices, sort menus, hover states, and portal dialogs. A page-level dark-ink text override is not enough; shared components may retain dark backgrounds.

**Why:** The Debloater watercolor redesign initially left the search query and protected-app notice dark-on-dark even though its primary panels were light.

**How to apply:** Add explicit feature-scoped surface hooks for these controls and independent theme roots for body-portaled overlays. Verify representative computed styles without bypassing app authentication; distinguish isolated fixture checks from actual signed-in Windows UI verification.
