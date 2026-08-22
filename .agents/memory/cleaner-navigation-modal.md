---
name: Cleaner navigation modal
description: The active Cleaner-operation leave guard must render at body level with explicit pointer handling.
---

The Cleaner leave-confirmation modal uses a direct body-level portal with explicit `pointer-events: auto` and a z-index above the desktop shell, rather than relying on the shared Radix alert-dialog portal.

**Why:** In the packaged Electron shell, the Radix modal could remain visually open while its focus/pointer layer intercepted clicks, leaving the whole app apparently frozen until exit.

**How to apply:** Keep Cleaner navigation confirmation controls outside AppLayout compositing layers and verify both “Keep working” and “Cancel and leave” in the packaged Windows build.