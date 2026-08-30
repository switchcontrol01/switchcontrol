---
name: Desktop route loading
description: Electron desktop routes must load eagerly; web routes may remain code-split.
---

Electron desktop routes load eagerly. Do not wrap the Electron route switch in a route-level Suspense skeleton. The web build may continue using lazy desktop routes and shared prefetching.

**Why:** Packaged `file://` route chunks could stall and leave the full desktop content permanently replaced by a skeleton, even though the sidebar remained responsive. The smaller entry bundle was not worth this reliability regression.

**How to apply:** Keep Vite’s mode-aware aliases: Electron selects the eager route map and no-op prefetch module; web selects the lazy route map and real prefetch module. Nested feature-level lazy boundaries are allowed only when they cannot replace the entire desktop route.