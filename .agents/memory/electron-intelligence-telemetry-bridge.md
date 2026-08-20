---
name: Electron intelligence telemetry bridge
description: How desktop-only intelligence endpoints obtain live CPU, memory, network, and process context
---

In packaged Electron, the main process owns the live telemetry loop and the embedded HTTP backend intentionally does not start its own systeminformation scheduler. Intelligence endpoints that derive live pressure/rankings must accept the authenticated renderer's existing live snapshot rather than assuming the backend cache is ready.

**Why:** Starting the backend scheduler as a second owner duplicates hardware polling and undermines the low-end performance goal; reading only the backend cache returns permanent “Telemetry not ready” responses in desktop mode.

**How to apply:** Keep the Electron bridge limited to the signal subset needed by the endpoint, preserve server-owned telemetry for web mode, and never start a second scheduler just to satisfy an Electron intelligence request.