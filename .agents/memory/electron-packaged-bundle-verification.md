---
name: Electron packaged bundle verification
description: The installed Windows app can remain on an older renderer even when the Replit workflow and current source are fixed.
---

The development preview and the packaged Electron renderer are separate artifacts. A UI string that no longer exists in client source or dist-electron proves the user is running an older installed package, not that the current fix failed.

**Why:** Restarting the web workflow does not update an installed Windows executable; renderer fixes must be included in a fresh packaged Windows build.

**How to apply:** After Electron UI changes, build the renderer and prepare assets using the current packaging scripts, then build and inspect the Windows package before claiming installed-app verification. Check the scripts for the current output directory rather than assuming a historical renderer-copy path.

Native helper modules required by electron/main.js must also be explicitly listed in the Electron build `files` contract; a source `require()` alone does not guarantee the module enters app.asar.

**Why:** A fresh package can contain the updated main process while omitting a newly required helper, causing the packaged app to fail before it can collect telemetry.

**How to apply:** When adding a main-process helper, update electron/package.json and the package-contract check together, then inspect the unpacked app.asar before Windows runtime testing.