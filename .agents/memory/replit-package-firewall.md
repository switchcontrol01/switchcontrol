---
name: Replit package firewall recovery
description: Refresh a blocked transitive lockfile entry without bypassing package policy.
---

When a registry or package-firewall block points at an existing locked transitive version, inspect the parent package's allowed semver range and available safe releases. Updating the parent to latest may leave the old lock entry; adding the safe compatible package directly through the managed package tool can refresh it.

**Why:** Updating the parent package alone did not dislodge a blocked locked release, while explicitly installing a compatible safe release succeeded without bypassing the firewall.

**How to apply:** Keep the package firewall enabled. Use only releases permitted by the parent package's range, update through Replit's package tooling, then verify the lockfile and runtime installation.
