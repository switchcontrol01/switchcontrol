---
name: First-run motion policy
description: The onboarding handoff must not depend on the Windows Animation effects setting.
---

First-run onboarding uses SwitchControl's explicit Reduced motion preference as its motion boundary. The Windows `prefers-reduced-motion` media query remains valid for general app motion, but it must not collapse the login, language, consent, disclaimer, welcome, or onboarding handoff timing.

Tour card changes and the language picker view switch are separate interactions: both use a 200ms restrained transition, while the full-screen first-run gate handoff retains its deliberate longer cover.

**Why:** Performance-focused Windows users commonly disable system animation effects. Requiring that global setting for a tweaking app's own onboarding made the handoff appear to be a broken packaged build.

**How to apply:** Keep first-run timers, blur/fade transitions, and completion screens on the app-level preference. Keep per-step tour interaction timing on the dedicated tour token. Only collapse them when the user enables SwitchControl's own Reduced motion setting.