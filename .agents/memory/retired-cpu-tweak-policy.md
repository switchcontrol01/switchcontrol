---
name: Retired CPU tweak policy
description: Safety and scope constraints for the removed CPU C-States/core-parking toggle.
---

Removing the “CPU C-STATES | Core parking” tweak is a control retirement, not permission to reset a user's Windows configuration. Preserve saved recovery backups and historical ownership records; they must not make the retired control actionable again or initiate automatic expiry reverts.

**Why:** The user explicitly required removal without silently changing existing Windows power settings or deleting backup/history files.

**How to apply:** Keep the retired toggle unavailable, including through stale requests and cached recommendations. Any future restoration or cleanup of its historical settings needs separate scope. Unrelated Power Plan core-parking controls and BIOS Advisor firmware guidance remain supported.
