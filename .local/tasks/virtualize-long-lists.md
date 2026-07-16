# Virtualize Long Lists

## What & Why
Several lists in the app render every item with a plain `.map()` inside a scroll container, even when the underlying data can grow large (running processes, tweaks, installed apps, history entries). This costs unnecessary render and layout time. These lists should only render what's actually visible on screen.

## Done looks like
- The running processes list, tweaks list, installed apps (debloater) list, and history list all render smoothly with large datasets (100+ items) without rendering every row into the DOM at once.
- Scrolling through each of these lists remains smooth (no jank) regardless of total item count.
- Existing filtering, sorting, and per-item interactions (toggles, actions, expand/collapse) continue to work unchanged from the user's perspective.
- No visual regression in spacing, grouping, or styling of these lists.

## Out of scope
- Changing the data model or business logic behind processes/tweaks/apps/history.
- Adding virtualization to short, bounded lists that can't realistically grow large.
- General state/store cleanup (separate task).

## Steps
1. **Introduce a virtualization approach** — pick and wire in a lightweight virtualization solution suited to variable or fixed-height rows for the target lists.
2. **Virtualize the running processes list** — render only visible `ProcessRow` items while preserving sorting and per-row actions.
3. **Virtualize the tweaks list** — render only visible tweak cards/sliders while preserving section grouping, search/filter, and category headers.
4. **Virtualize the installed apps (debloater) panel** — render only visible app rows while preserving selection state and bulk actions.
5. **Virtualize the history list** — render only visible grouped session/event rows while preserving date grouping and expand/collapse behavior.
6. **Verify interaction parity** — confirm keyboard navigation, focus states, and any test IDs used for interactive elements still resolve correctly after virtualization.

## Relevant files
- `client/src/components/tweaks/TweaksList.tsx:527-`
- `client/src/components/security/SecurityProcessesTab.tsx:236-`
- `client/src/components/debloater/InstalledAppsPanel.tsx:596-`
- `client/src/pages/History.tsx:544-`
