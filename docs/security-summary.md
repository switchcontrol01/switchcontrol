# SwitchControl Security Summary

## Security Improvements Implemented

### Server-Side Hardening

1. **Helmet Security Headers** — Installed and configured `helmet` middleware providing:
   - Content-Security-Policy with explicit source whitelists
   - Strict-Transport-Security (HSTS) with 1-year max-age, includeSubDomains, preload
   - X-Content-Type-Options: nosniff
   - X-Frame-Options: SAMEORIGIN
   - Referrer-Policy: strict-origin-when-cross-origin
   - Permissions-Policy (helmet defaults)
   - Cross-Origin-Embedder-Policy disabled (required for Stripe iframe)

2. **CORS Hardening** — Tightened CORS policy:
   - Removed acceptance of `origin: 'null'` which could be exploited
   - Production origin allowlist contains only `https://switchcontrol.org` and `https://www.switchcontrol.org` — localhost origins excluded
   - Dev mode adds localhost/127.0.0.1 origins to the allowlist

3. **Rate Limiting Expansion** — Added rate limiter for `/api/me` endpoint (60 req/min) in addition to existing auth endpoint limiter.

4. **Structured Logging** — Enhanced request logging to include:
   - Unique `requestId` (UUID) per request
   - ISO 8601 timestamp
   - HTTP method, path, status code, duration
   - Response body with token values sanitized

5. **Error Response Sanitization** — Global error handler now returns generic "Internal Server Error" for 500+ errors in production. Stack traces only logged server-side, never sent to clients.

### JWT Hardening

6. **Issuer Validation** — JWT tokens now signed with `issuer: "switchcontrol"` and verification enforces issuer match. Self-test confirms wrong-issuer tokens are rejected.

7. **Algorithm Pinning** — Explicit `algorithms: ["HS256"]` whitelist already present; added self-test confirming `alg=none` tokens are rejected.

8. **Input Validation** — `verifyJwt` now checks that the token parameter is a non-empty string before attempting verification.

9. **Production Secret Enforcement** — `getSecret()` now throws in production if no secret is configured (defense in depth beyond the startup check).

### Electron Hardening

10. **DevTools Gated** — `devTools` option set to `isDev` (false in production builds). DevTools keyboard shortcut only registered in dev mode.

11. **Protocol Validation** — `open-external` IPC handler now:
    - Validates URL is a string
    - Parses with `new URL()` to validate format
    - Only allows `https:` and `mailto:` in production (`http:` additionally in dev)
    - Rejects `file:`, `javascript:`, `data:` and all other protocols

12. **Navigation Guard Enhancement** — `will-navigate` and `setWindowOpenHandler` now validate protocols before calling `shell.openExternal`. Malformed URLs are caught and blocked.

13. **IPC Input Validation** — Added type checking for:
    - `tweak:execute`: validates `tweakId` (string) and `action` (must be 'apply' or 'revert')
    - `tweak:checkStatus`: validates `tweakId` (string)
    - `memory:clean` already validated modes (pre-existing)

## Risks That Remain

1. **No Code Signing** — Electron builds are not signed. Users see SmartScreen warnings on Windows. A code signing certificate is needed for production release.

2. **No CI/CD Pipeline** — No automated linting, testing, or security audit in CI. Dependency vulnerabilities must be checked manually.

3. **sandbox: false** — Electron renderer runs without sandbox due to `systeminformation` library requirement. This increases the attack surface if the renderer is compromised.

4. **exec() for nvidia-smi** — Two calls use `exec()` instead of `execFile()` for GPU monitoring. These use hardcoded command strings with no user input, so risk is low but not zero.

5. **No CAPTCHA** — No bot protection on public-facing forms (none currently exist, but should be added if contact forms are introduced).

6. **Cloudflare Configuration** — Cannot verify WAF, Full Strict TLS, origin hiding, or DNSSEC from this environment. These must be configured and verified in the Cloudflare dashboard.

## Items Intentionally Deferred

| Item | Reason |
|------|--------|
| Packaged asar secret scan | Requires post-build inspection of the packaged Electron app |
| Cloudflare WAF/TLS/DNSSEC | Infrastructure-level configuration outside code scope |
| CI/CD pipeline | Requires repository CI setup (GitHub Actions recommended) |
| Code signing | Requires purchasing a code signing certificate |
| Auto-update security | No auto-update mechanism exists yet |
| UI fail-safe timeouts | Requires individual review of all modal/loading states |
| Penetration testing | Manual security testing recommended before public release |
