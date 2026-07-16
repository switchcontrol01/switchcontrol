# Updater Release Notes Improvements

## What & Why
The updater audit identified two gaps in how release notes are surfaced to users:

1. **Notes are inaccessible from the Banner.** A user who downloads the update directly from the global `UpdateBanner` (without ever visiting Settings) will never see what changed. The Banner should include a collapsible "See what's new" toggle showing the release notes inline.

2. **Notes render as raw text.** `UpdateCard` displays release notes in a `<pre>` block with no markdown parsing. If the notes contain standard markdown (headings, bullet lists, bold), they appear as raw `##` and `-` characters rather than formatted content.

Both components need updating; the fix to the notes renderer is shared and should be consistent across both.

## Done looks like
- The `UpdateBanner` (visible on every page when an update is available) shows a "See what's new ▾" toggle below the version line in the `available` and `downloaded` states. Clicking it expands the release notes inline, with the same collapsible Framer Motion animation already used in `UpdateCard`.
- Release notes in both the Banner and the Card are rendered as formatted markdown — bullet points appear as bullets, headings as headings, bold as bold — rather than as a raw `<pre>` block.
- The collapsed / expanded state of the notes in the Banner is independent from that in the Card.
- The toggle is hidden when `releaseNotes` is null or empty, identical to the existing Card behaviour.
- No layout shifts in the Banner's surrounding UI — the notes section grows downward within the banner's own space.
- The expanded notes panel in the Banner uses a glass, milky translucent background — `backdrop-blur` with a semi-transparent white/dark tint and a subtle border — consistent with the app's existing glass card aesthetic. The same treatment is applied to the notes panel in `UpdateCard`, replacing the current plain `bg-black/20` container.

## Out of scope
- Changing what content goes into `latest.yml` or the format of release notes on the server side.
- Adding notes to the `downloading` state of the Banner (progress bar context is already enough information there).
- Markdown rendering in `PatchNotesModal` or `PatchNotesSection` — those use the separate `patch-notes.json` local system, which is out of scope.
- Any changes to the urgency colour system, badge labels, or animation timings.

## Steps
1. **Add a lightweight markdown renderer.** Create a small utility (or use `react-markdown` if it is already available, otherwise install it) that renders a markdown string to React elements. Support at minimum: headings (`#`, `##`), bullet lists (`-`, `*`), bold (`**`), and inline code (`` ` ``). This renderer should be reusable by both components.

2. **Wire the renderer into `UpdateCard`.** Replace the `<pre>` block (lines 234–236 of `UpdateCard.tsx`) with the markdown renderer. Preserve the existing max-height / scroll container and the surrounding panel styling — only the inner content rendering changes.

3. **Add the release notes toggle to `UpdateBanner`.** Below the existing version/badge line in the `available` state (and also in the `downloaded` state if `releaseNotes` is present), add a "See what's new" / "Hide" toggle button with `ChevronDown`/`ChevronUp`. Wire it to local `showNotes` state. Expand the notes using a Framer Motion `height: 0 → auto` animation (matching the existing Card pattern). Render the notes using the same markdown renderer from step 1. Keep the dismiss button and Download/Install action buttons in their current position — they should not move when notes expand. The expanded notes container must use a glass, milky translucent style: `backdrop-blur-md`, a semi-transparent white/dark background tint (e.g. `bg-white/5` or `bg-black/30`), and a faint border (`border-white/10`). Apply the same glass container treatment to the notes panel inside `UpdateCard` as well, replacing the existing `bg-black/20` panel.

## Relevant files
- `client/src/components/UpdateBanner.tsx`
- `client/src/components/UpdateCard.tsx:216-240`
- `client/src/hooks/use-updater.ts`
