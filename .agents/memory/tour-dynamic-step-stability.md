---
name: Tour dynamic-step stability
description: Prevents changing tour step props from reinitializing an active tour and relocking navigation.
---

Tour wrappers may rebuild their step arrays when live data changes, such as a trial countdown or optimistic auth update. TourShell must keep the latest steps in a ref and keep its step-application callback stable; otherwise the show initialization effect can run again during completion and leave the sidebar locked.

**Why:** The completion callback updates auth state before the parent flow unmounts the tour. A new steps-array identity can re-run initialization, set `isTourActive` back to true, and leave the unmounted sidebar permanently disabled until restart.

**How to apply:** Read current step data through a ref inside `applyStep`, and keep the tour initialization effect dependent on stable callbacks plus the show transition. Dismiss the parent flow before awaiting non-critical server persistence.