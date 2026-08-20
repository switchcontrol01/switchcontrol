---
name: Desktop route loading
description: Prevents blank first-navigation frames in the Electron renderer while keeping desktop pages code-split.
---

Desktop routes are lazy-loaded, while each page currently owns its own AppLayout. The route-level Suspense fallback must therefore render a stable AppLayout shell and page skeleton, not a solid full-window cover. Sidebar navigation should prefetch the matching route through the same shared importer/promise cache used by React.lazy.

**Why:** When Suspense replaces a page-owned layout during the first chunk fetch, Sidebar, background, and content disappear together for the duration of the fetch. Cached routes appeared fine on re-entry, masking the issue.

**How to apply:** Keep route loaders centralized, call the prefetch on navigation intent, and retain a visible fallback for slow/failing chunk loads.