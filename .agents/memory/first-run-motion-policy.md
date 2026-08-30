---
name: First-run motion policy
description: The onboarding handoff must not depend on the Windows Animation effects setting.
---

First-run onboarding uses SwitchControl's explicit Reduced motion preference as its motion boundary. The Windows `prefers-reduced-motion` media query remains valid for general app motion, but it must not collapse the login, language, consent, disclaimer, welcome, or onboarding handoff timing.

**Why:** Performance-focused Windows users commonly disable system animation effects. Requiring that global setting for a tweaking app's own onboarding made the handoff appear to be a broken packaged build.

**How to apply:** Keep first-run timers, blur/fade transitions, and completion screens on the app-level preference. Only collapse them when the user enables SwitchControl's own Reduced motion setting.