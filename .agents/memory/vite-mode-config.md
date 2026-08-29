---
name: Vite mode-aware config
description: Custom server setup must resolve a mode-aware Vite config before spreading it into createViteServer.
---

Mode-aware Vite configs export a function, not a plain config object. Any custom dev-server setup that imports the config must resolve it with the serve/development config environment before passing it to Vite.

**Why:** Spreading the function silently drops root and aliases, causing Vite to scan generated build directories and fail on optional imports.

**How to apply:** When adding build-specific aliases or settings, update both the build script modes and the custom server’s config resolution path.