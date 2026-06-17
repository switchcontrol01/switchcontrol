---
name: Electron OAuth deep-link failure
description: Chrome blocks custom-protocol redirects without user gesture; server-side polling is the reliable fix.
---

# Electron OAuth — Deep Link Failure & Poll Fix

## The Problem
Chrome silently drops `window.location.href = 'switchcontrol://...'` on the desktop-success page because it executes without a user gesture. The Electron app stays stuck on "Waiting for secure browser login..." indefinitely.

## The Fix — Server-Side Poll Map
Electron generates a random 32-char hex `pollToken` before opening the browser. The token is included in the OAuth `state` payload (survives the Google/Discord round-trip). When the OAuth callback fires, the server calls `storePollCode(pollToken, code)` which stores the HMAC-signed electron code in `_desktopPollMap`. Electron polls `GET /api/auth/desktop-poll?token=<pollToken>` every 2s. On `{ready: true, code}`, it calls `exchangeToken(code)` and logs in.

## Key Files
- `server/auth/google.ts` — `_desktopPollMap`, `storePollCode`, `GET /api/auth/desktop-poll`, pollToken in Google state
- `server/auth/discord.ts` — imports `storePollCode`, pollToken in Discord state
- `client/src/screens/Login.tsx` — generates pollToken, starts 2s polling interval in `handleLogin`, `handlePollSuccess`

## Why Server-Side Polling Is the Right Approach
- Works regardless of browser security settings
- No user gesture required
- The deep link on the success page still fires as a secondary mechanism when Chrome does allow it (e.g. after user has approved the protocol)
- The HMAC-signed code is self-verifying — no server state needed beyond the poll map

## Desktop-Success Page Button
The "Open SwitchControl" button was hidden for 1800ms (`display:none` + setTimeout). Removed the delay — button is always visible immediately as a one-click fallback in case the user lands on the page and polling hasn't resolved yet.
