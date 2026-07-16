# Remove Feature Card Sun Streaks

## What & Why
Remove the sun streak visual effects that were added to target the feature cards area on the landing page. The user no longer wants these decorative light beams.

## Done looks like
- The sun streak beams aiming at the feature cards are gone from the landing page
- No leftover CSS or markup related to the feature-card sun streaks remains
- The rest of the page (hero sun streaks, blueprint overlay streaks, background streaks) is untouched

## Out of scope
- Hero section sun streaks (ws-sun-streak-1/2/3 inside hero)
- Blueprint overlay sun streaks (ws-sun-streak-bp variants)
- WebsiteBackground sun streaks

## Tasks
1. Remove the sun streak wrapper div and its three child elements (sun-streak-left, sun-streak-center, sun-streak-right) from the Landing page
2. Remove the associated CSS rules for `.sun-streak`, `.sun-streak-left`, `.sun-streak-center`, `.sun-streak-right`, and the `sunStreakFade` keyframes from the stylesheet

## Relevant files
- `client/src/pages/Landing.tsx:589-593`
- `client/src/index.css:1492-1567`
