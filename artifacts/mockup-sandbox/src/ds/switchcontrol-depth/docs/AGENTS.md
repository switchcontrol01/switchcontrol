# SwitchControl Depth

## Direction
SwitchControl Depth is a field-instrument interface for diagnosing a real Windows gaming PC. The layout borrows from precision lab equipment: a graphite-green chassis, evidence-grade labels, layered machined surfaces, and one phosphor-lime action color. It is intentionally not a throughput/score dashboard.

Typography uses Outfit for compact display hierarchy, DM Sans for explanatory copy, and IBM Plex Mono for identifiers and instrument labels. Surface elevation is expressed through paired inset highlights, structural seams, and three reusable shadow levels (`--scd-shadow-1/2/3`), not arbitrary card shadows.

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

## Boundaries
This deliverable is the design system and representative system preview only. Do not implement a Latency Analyzer, production route, scan backend, or measurement logic here.
