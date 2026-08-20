---
name: Power-plan module integrity
description: Non-obvious baseline and safety rules for the Electron power-plan backend.
---

The Electron power-plan backend must remain syntactically complete because `electron/main.js` requires it during desktop startup. Windows-only operations must return explicit unsupported or inconclusive results outside Windows, and every activation must be verified by reading the active scheme back.

**Why:** The repository contained a committed truncated power-plan module that parsed as invalid JavaScript while the main process still required it. Silent placeholders would make desktop power actions appear successful without changing the system.

**How to apply:** Before changing power-plan behavior, run `node --check electron/power-plan-manager.js` and a require smoke test. For custom laptop profiles, apply AC settings by default, preserve DC values unless explicitly requested, and never restore hard-coded battery values.