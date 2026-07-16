---
title: Let users control the notification style — silent, banner, or sound
---
# Let users control the notification style — silent, banner, or sound

  ## What & Why
  The current game-session notification toggle is all-or-nothing. Power users may want notifications without sound, or prefer a subtle banner over a full Windows toast. Giving finer control makes the feature feel polished.

  ## Done looks like
  - Settings offers a dropdown/radio: Off / Banner (silent) / Banner + Sound
  - "Banner + Sound" plays a subtle chime (or uses the OS default notification sound)
  - The selected style is stored in configStore under `sentinelNotificationStyle` and read in `_sentinelLoop` before calling `Notification.show()`
  - The existing `toggle-game-notifications` toggle is replaced by this selector

  ## Relevant files
  - `electron/main.js` — `_sentinelLoop` reads `sentinelGameNotifications`
  - `client/src/pages/Settings.tsx` — General card, game notifications row
  - `electron/config-store.js` — persistent key/value store