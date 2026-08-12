---
name: R2 credentials
description: Cloudflare R2 keys needed by the Electron app — stored as Replit Secrets, not in electron/.env
---

# R2 Credentials

The Electron app requires three Cloudflare R2 environment variables. They are stored as **Replit Secrets** (injected into `process.env` at runtime) — Replit blocks writing to `.env` files directly.

**Key names (never store values):**
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

**Why:** User originally placed these in `electron/.env` which is git-ignored. Replit's filesystem write guard blocks `.env` writes. Replit Secrets survive workspace resets and inject into `process.env` automatically.

**How to apply:** If keys are missing, use `requestSecrets({ keys: [...] })` via CodeExecution to prompt the user to re-enter them through the secure form.
