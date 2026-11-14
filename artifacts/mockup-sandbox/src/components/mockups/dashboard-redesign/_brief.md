# SwitchControl dashboard exploration

## Product and user
SwitchControl is a Windows performance utility for people who care about their PC and want real, understandable device information without alarming claims or busy gaming decoration. It should feel like a carefully made instrument they chose to use.

## Source comprehension
The actual source is client/src/pages/Home.tsx. The dashboard greets the signed-in user, shows CPU/GPU/RAM/disk inventory and usage, provides hardware inspectors, RAM clearing, disk/GPU selection, live telemetry and resource filters, a Performance Lab, CPU-memory-network pipeline, storage inventory, memory/storage/system-rhythm analytics, applied-tweak history and AI/BIOS advisor summaries. Its two main navigational actions are View Logs and Optimize Now.

The current layout is a long stack of equal-weight cards and repeated charts. Long hardware names wrap heavily. Competing panels and decorative background color weaken the hierarchy. The redesign should make the most useful readings immediate and organize supporting information without losing access to it.

## Hard constraints
- Five independent full dashboard concepts, not five skins of one template.
- This is a preview only. Do not change the production app or use real APIs, authentication, databases, or native actions.
- Use the extracted Current.tsx and actual production source as the starting point for content and behavior. Keep all important dashboard capabilities represented, including below the fold or through accessible detail views.
- One page / one exported preview component per concept. Small helpers may remain inside that component file.
- Use consistent, clearly identified sample data: SwitchTech; Ryzen 7 9800X3D, 8 cores/16 threads; RX 7800 XT, 16 GB VRAM; CPU 41%; RAM 10.7/31.6 GB, 34%; system drive 447.1/930.6 GB, 48%; network 2 KB/s down and up. Demonstration telemetry may vary, but must be visibly sample data.
- Never invent FPS, input latency, measured improvements, or a device-health score. CPU load is not a performance or health score. Unknown data stays unknown.
- Keep a single Clear RAM action. No duplicate Smart RAM Analysis panel. No alarming top banners.
- Avoid the removed "01 System overview" style labels and decorative section numbering.
- No emojis, AI buzzword headings, generic floating blobs, rainbow neon, illegible tiny labels, or endless moving scenery.
- Calm, professional, polished and readable. A cohesive restrained three-tone palette per direction, with deliberate status colors only where meaningful. Do not make every element another bordered box.
- Full viewport desktop application experience at 1280×900, scrollable where needed. Do not shrink the whole UI to fit one screen.
- Respect prefers-reduced-motion. Use accessible focus states and semantic controls.

## Variation axes
1. Structural and content hierarchy: hardware-first, workspace-first, assembly-first, telemetry-first, and instrument-first are different ways of understanding the same PC.
2. Conceptual depth: custom physically rendered hardware, material thickness, cast shadows, perspective, and deliberate interaction depth rather than flat generic cards.
3. Behavioral and visual identity: a coordinated entrance, a short lighting pass, focused selection transitions, and pointer parallax should support the chosen concept. Keep charts readable and truthful.

## Five distinct hypotheses
- Observatory: a quiet, dark hardware observatory. The central idea is understanding the PC as a coherent physical system, with calm cool light and confident negative space.
- Studio: a sculpted workspace that feels like an expensive physical object on a desk. Softer material, warmer restraint, and a different reading rhythm from the observatory.
- Assembly: an exploded engineering view of the machine. Layered precision parts make the resource relationships tangible; the user explores the system through focused components.
- Current: telemetry as a continuous flow rather than a pile of widgets. Smoked surfaces and restrained mineral color make activity feel fluid while keeping numeric readings clear.
- Instrument: a precision desktop instrument, mechanically convincing and intentionally composed. Quiet metal, fine detail, controlled warm accents, and high readability—not a game HUD.

Each variation should be a distinct design hypothesis. Do not produce variations that differ only in color, font, or spacing.

## Prototype interaction quality
Make visible controls work locally: telemetry pause/resume and resource selection, hardware detail inspection, drive selection, a preview-only RAM action, log review, and an optimization preview. Never claim that a mock action changed Windows. User-triggered panels must close normally with keyboard-accessible controls. Keep motion deliberate and calm.

## Engineering boundaries
- Author only your target TSX and uniquely named sibling CSS. Never edit global index.css, shared manifests, other variants, or production files.
- Use the supplied custom hardware render. It is an illustrative render, not a detected exact motherboard or chassis. Reference public images as /__mockup/images/...
- Raster render art is acceptable, but pair it with intentional layered depth and motion. Do not bake numbers, labels, charts, or the complete UI into images.
- Existing React, framer-motion, lucide-react, recharts and three packages are available. Do not install packages.
- Each preview is independently addressable; no variant-switching UI inside the page.
