---
name: Replit package firewall recovery
description: Keep Replit installs in its managed firewall and adapt external Docker builds safely.
---

When a registry or package-firewall block points at an existing locked transitive version, inspect the parent package's allowed semver range and available safe releases. Updating the parent to latest may leave the old lock entry; adding the safe compatible package directly through the managed package tool can refresh it.

Replit's Package Firewall does not run inside custom Dockerfile builds. For Replit publishing, use the managed Node builder. For an external Railway Docker build, keep Replit mirror URLs in the committed lockfile and rewrite only the container's copied lockfile to public npm URLs; do not use that rewrite for Replit builds.

**Why:** The internal mirror is reachable to Replit's managed package installation, not from inside custom Docker builds; Railway needs a public registry when building externally.

**How to apply:** Keep the firewall enabled. Use Replit's managed package tooling for Replit builds. When one repository targets both platforms, move the Railway Dockerfile off the root `Dockerfile` name and point Railway's config to it, so Replit does not auto-select the custom Docker build.
