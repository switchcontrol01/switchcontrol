---
name: Windows firewall profile status
description: Firewall health must be derived from the active Windows network profile, not a single hard-coded profile.
---

Check all Windows firewall profiles, resolve the active network category, and normalize PowerShell boolean values before reporting firewall health. If Windows returns no trustworthy profile data, report unknown rather than disabled.

**Why:** A machine can have Public or DomainAuthenticated as its active profile while Private is disabled or absent. Checking only Private creates a false security warning.

**How to apply:** Keep profile selection and boolean normalization in the shared Windows security probe; never duplicate `Private`-only checks in UI or recommendation code.