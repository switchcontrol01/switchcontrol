---
title: Show a summary notification after a game session ends (duration + boost stats)
---
# Show a summary notification after a game session ends (duration + boost stats)

  ## What & Why
  After the Sentinel detects a game has closed it already fires a "Game closed" toast. This could be enhanced into a brief session summary — how long the game ran and, if App Booster was active, how many processes were deprioritised. This gives users a tangible sense of what SwitchControl did for them each session.

  ## Done looks like
  - `_sentinelLoop` tracks a `sessionStartedAt` timestamp when a game is detected
  - On game exit, calculates elapsed minutes and includes it in the notification body: "Session: 47 min — telemetry resumed"
  - If `AppBooster` boosted any processes during the session, append the count: "+ 3 apps deprioritised"
  - Falls back gracefully to the current plain "Game closed" body if no extra data is available

  ## Relevant files
  - `electron/main.js` — `_sentinelLoop`, `appBooster:sentinelStatus` IPC emit