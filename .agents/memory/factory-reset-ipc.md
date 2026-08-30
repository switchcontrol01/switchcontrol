---
name: Factory reset IPC handoff
description: The reset result must reach the renderer before Electron relaunches or exits.
---

The factory-reset IPC handler must finish deletion, return a structured result, and only then execute relaunch/exit from a bounded delayed callback. The renderer must validate the result and apply its own timeout.

**Why:** Exiting inside the IPC handler leaves `ipcRenderer.invoke()` permanently pending, which strands the reset overlay and hides native failures.

**How to apply:** Preserve the confirmation token and device identity, return individual deletion failures without scheduling exit, and defer logout/local cleanup until native success is confirmed.