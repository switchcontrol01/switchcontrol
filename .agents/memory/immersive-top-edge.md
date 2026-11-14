---
name: Immersive page top edge
description: Avoid a visible gap above solid-background Driver Intelligence and Latency Analyzer pages.
---

Immersive feature surfaces must extend to the top of the application content area. Hidden status indicators must not reserve layout space above them.

**Why:** The online network chip renders no visible content, but padding on its parent and child reserved a 12px band. Solid feature backgrounds exposed that band; Startup's transparent background concealed it. This was not a native Chromium/Electron window frame.

**How to apply:** Keep connection warnings available without adding a top flow row to immersive pages, and preserve the native-window control overlay. Verify actual main bounds and surface coverage at the top pixel for online/offline, scrolled/unscrolled, and different viewport sizes. Account for the transparent titlebar drag region when hit-testing; it intentionally sits above the feature surface.
