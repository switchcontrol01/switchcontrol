---
name: List virtualization pattern
description: How long lists (processes, tweaks, installed apps, history) are virtualized without regressing short-list animations
---

## Rule
Use `@tanstack/react-virtual` (not react-window) for any list that can grow large and has variable/dynamic row heights (expandable rows, cards with conditional content). Always use `measureElement` for dynamic sizing rather than a fixed `estimateSize` alone.

Gate virtualization behind a per-list item-count threshold (e.g. 30-40 items). Below the threshold, keep the original `AnimatePresence`/`motion.div` per-row enter/exit animation path completely unchanged — only render the virtualized branch once a list is actually large enough to benefit.

**Why:** Most lists in this app are short in practice (a handful of processes, ~7 slider tweaks, a small history). Virtualizing everything unconditionally would strip away the polished per-item enter/exit animations for the common case with no performance benefit. The threshold gate preserves the designed feel for typical usage and only trades animation fidelity for scroll performance when a list is genuinely long (e.g. "All" tweaks category ~117 items, full history, full installed-apps list).

**How to apply:** Each virtualized list gets its own bounded-height scroll container (`max-h-[70vh] overflow-y-auto`), not the shared page-level scroll container in AppLayout — keeps virtualization self-contained per list. For grid layouts (2-column tweak cards), chunk items into rows of N and virtualize by row, letting `measureElement` handle the mobile 1-column vs desktop 2-column height differences automatically. For grouped lists (history's date groups), flatten group headers + items into a single row array with a discriminated union type so one virtualizer instance renders both header and item rows while preserving the grouped visual structure.

Known virtualized lists: SecurityProcessesTab (running processes), InstalledAppsPanel (debloater), TweaksList (toggle-tweaks grid), History (grouped timeline). Non-virtualized by design (bounded/short): slider tweaks (~7), advanced tuning section (~6).
