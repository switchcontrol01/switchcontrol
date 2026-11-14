# SwitchControl Depth

## Direction
SwitchControl Depth is a field-instrument interface for diagnosing a real Windows gaming PC. The layout borrows from precision lab equipment: a graphite-green chassis, evidence-grade labels, layered machined surfaces, and one phosphor-lime action color. It is intentionally not a throughput/score dashboard.

Typography uses Outfit for compact display hierarchy, DM Sans for explanatory copy, and IBM Plex Mono for identifiers and instrument labels. Surface elevation is expressed through paired inset highlights, structural seams, and three reusable shadow levels (`--scd-shadow-1/2/3`), not arbitrary card shadows.

## Token use
- Color and semantic states: use `--scd-*` tokens from `package/tokens.css`. Unknown evidence is amber; confirmed evidence is blue-green; never use a reassuring color for an unavailable or unverified result.
- Spacing: use the `--scd-space-1` through `--scd-space-7` scale instead of inventing new spacing values for shared components.
- Elevation and lighting: use the three `--scd-shadow-*` levels for layered surfaces, and `--scd-light-*` values for ambient, key, rim, bloom, and specular lighting. Decorative glow must not be used as a status indicator.
- Motion: use `--scd-motion-*` and `--scd-ease-*` for transitions. Keep motion purposeful, avoid autoplaying 3D movement, and remove or simplify nonessential motion when `prefers-reduced-motion` is active.
- Typography: use the display, body, and mono font tokens for their documented roles. Keep instrument labels readable and never use mono styling as a substitute for hierarchy.

## Package and route
- Package: `@workspace/switchcontrol-depth`
- Package CSS entry: `package/styles.css` (tokens and component styles)
- Reusable React pieces: `package/components/`
- Preview entry: `index.html` → `main.tsx` → `App.tsx`
- Documented preview route: `/__mockup/src/ds/switchcontrol-depth/#/SystemPreview`
- Source: `mockups/SystemPreview.tsx`

The sandbox is an isolated npm package. It consumes `package/` through a local `file:` dependency; do not add a root workspace or alter production client code.

## Components
- `InstrumentFrame`: reusable `frame`, `panel`, and `inset` surface treatments.
- `EvidenceReadout`: compact labeled evidence/value/note pattern.
- `.scd-button`, `.scd-badge`, `.scd-part-button`: accessible action and state primitives.

Use tokens from `package/tokens.css`; preserve the layered depth vocabulary and keep text contrast high. Measurements should only appear when supplied by a real scan. Preview-only hardware labels must remain explicitly illustrative and must not imply live machine evidence.

## Interactive geometry and accessibility
The SystemPreview creates a Three.js motherboard assembly from real mesh geometry. Drag with a pointer to rotate; activate a named part in the component list to select/highlight it. The canvas supports arrow-key rotation, Home reset, and accessible labeling. The model is nonessential to the hardware descriptions: if WebGL is unavailable or context creation fails, a clear non-WebGL explanation and the same selectable component list remain available. Do not introduce autoplay; respect `prefers-reduced-motion`.

Use real 3D geometry only when perspective, rotation, or spatial selection helps explain the system. Label illustrative models as illustrative; do not style decorative layers to look like measured device state. Every 3D interaction needs an equivalent keyboard path and an understandable non-WebGL fallback.

## Data visualization constraints
- Quantitative visuals must be driven by supplied measurements, preserve their units, and clearly identify the sample window and source.
- Do not imply that perspective, height, glow, color, or animation represents additional measured precision.
- Do not synthesize or animate values to make a chart look active. Missing, stale, or unavailable values stay explicitly unknown.
- Keep important comparisons legible in a flat view and provide text or tabular values where interactive graphics are used.

## Boundaries
This deliverable is the design system and representative system preview only. Do not implement a Latency Analyzer, production route, scan backend, or measurement logic here.
