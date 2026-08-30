---
name: Electron packaged bundle verification
description: The installed Windows app can remain on an older renderer even when the Replit workflow and current source are fixed.
---

The development preview and the packaged Electron renderer are separate artifacts. A UI string that no longer exists in client source or dist-electron proves the user is running an older installed package, not that the current fix failed.

**Why:** Restarting the web workflow does not update an installed Windows executable; lazy-route and startup fixes must be copied into electron/dist-frontend and included in a fresh Windows build.

**How to apply:** After Electron UI changes, run the frontend build, synchronize with electron/scripts/ensure-dist.js, build the Windows package, and verify the packaged output before concluding the user-facing issue is fixed.

Native helper modules required by electron/main.js must also be explicitly listed in the Electron build `files` contract; a source `require()` alone does not guarantee the module enters app.asar.

**Why:** A fresh package can contain the updated main process while omitting a newly required helper, causing the packaged app to fail before it can collect telemetry.

**How to apply:** When adding a main-process helper, update electron/package.json and the package-contract check together, then inspect the unpacked app.asar before Windows runtime testing.