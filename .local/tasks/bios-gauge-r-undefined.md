# Fix BIOS Advisor SVG r=undefined

## What & Why
A `<circle>` element on the BIOS Advisor page receives `r={undefined}` immediately after `calculateBiosScores` runs, producing a visible React SVG error that fires every time the page loads or scores recalculate. Logs confirm it fires twice per session — it's not a fluke.

The error appears as:
```
Error: <circle> attribute r: Expected length, "undefined".
```
immediately after `[calculateBiosScores] settings=36 | ... cr=32`.

## Done looks like
- No SVG `<circle> attribute r: Expected length, "undefined"` errors in the Electron renderer logs
- BIOS Advisor gauge rings render cleanly even when any score component is 0, NaN, or undefined
- The fix is a guard on the radius/dasharray calculation, not a suppression of the error

## Out of scope
- Redesigning the gauge visual
- Fixing any other BIOS Advisor calculation issues

## Steps
1. **Locate the offending circle** — Search `BiosAdvisor.tsx` and any gauge sub-components it renders for `<circle>` elements where `r` is computed from a score value (not hardcoded). The `ScoreGauge` component has hardcoded `r="35"` so the bug is likely in a different ring/arc that derives its radius from `calculateBiosScores` output fields (`latency`, `frametime`, `stability`, or `competitiveReadiness`).
2. **Guard the radius and dasharray calculations** — Wherever a score value feeds into `r`, `strokeDasharray`, or any SVG length attribute, clamp it: replace any expression that could produce `NaN` or `undefined` with a safe fallback (e.g. `isFinite(v) ? v : 0`, or `?? 0`).
3. **Verify the fix** — Confirm the error no longer appears in the renderer console when navigating to the BIOS Advisor page with a real hardware profile loaded.

## Relevant files
- `client/src/pages/BiosAdvisor.tsx:195-226`
- `client/src/pages/BiosAdvisor.tsx:672,744,880`
- `client/src/components/dashboard/PerformanceLab.tsx:130-179`
- `client/src/components/dashboard/SystemPressureMeter.tsx`
