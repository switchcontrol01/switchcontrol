---
name: AppLayout lucide imports
description: TrialCountdownBanner in AppLayout.tsx renders on every authenticated screen; a missing icon import causes a ReferenceError that crashes the entire React tree.
---

# AppLayout lucide imports

## The rule
Any lucide icon used in `client/src/components/layout/AppLayout.tsx` — especially inside `TrialCountdownBanner` — must be explicitly imported. The component renders on every authenticated screen the moment a free trial is active, so a missing import is a global crash.

## Why
`Timer` was used as `<Timer className="size-3" />` in the TrialCountdownBanner but was never imported from lucide-react. The ReferenceError crashed the whole React tree into the ErrorBoundary:
- The app background never painted behind the trial tour modal.
- After dismissing the tour, users saw a blank dark screen with only a "Try again" button.

## How to apply
When adding any icon to AppLayout.tsx (or any layout-level component that renders universally), double-check that every JSX identifier has a corresponding import. The TypeScript compiler should catch this, but the Electron bundle is built without strict type checking — runtime crashes are the first signal.
