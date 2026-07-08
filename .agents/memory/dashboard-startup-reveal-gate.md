---
name: Dashboard startup reveal gate
description: Why Home.tsx's card-grid fade-in is gated on specStatus instead of a fixed timer, and what stays intentionally decoupled.
---

Home.tsx's dashboard card grid (Memory/CPU/GPU/Disk StatCards) sits behind a `contentReady` state that controls the whole grid's opacity fade. It used to flip to true on a fixed 100ms timer regardless of whether hardware specs had actually resolved, so cards routinely mounted in their loading/skeleton state and then visibly popped into final values a moment later — a "staged pop-in" look explicitly called out as undesirable.

**Why:** A fixed timer decouples the reveal signal from actual data readiness. Specs are usually already in the Zustand store by the time Home mounts (pre-loaded during Splash), so gating on `specStatus !== "loading"` (small settle delay + capped fallback timeout) lets the grid reveal already-populated instead of empty/loading.

**How to apply:** Any future "reveal after load" pattern in this app should gate on the real readiness signal (store state / status enum) with a bounded fallback timeout, not a bare `setTimeout`. GPU detection is the one intentional exception — WMI GPU enrichment can lag 1-3s behind baseline specs, so GPU keeps its own inline "Detecting…" state without blocking or being blocked by the rest of the grid.
