---
name: Factory reset IPC handoff
description: The reset result must reach the renderer before Electron relaunches or exits.
---

The factory-reset IPC handler must return a structured handoff result before exiting; a detached cleanup process must wait for Electron to release Chromium profile locks, then delete the profile and relaunch. The renderer must validate the result and apply its own timeout.

**Why:** Electron cannot reliably delete its own Cache, GPUCache, Local Storage, Cookies, or SharedStorage directories while the renderer owns them. Deleting what is available first leaves a partial reset, and changing server onboarding flags before deletion succeeds can make a failed reset look like a premium grant.

**How to apply:** Preserve the confirmation token and device identity, return before exit, let a post-exit helper remove all non-identity files, and only reset cloud tour/unlock flags after the native handoff has been accepted. Failed resets must keep the session usable and suppress onboarding-flow replay.