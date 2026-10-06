# SwitchControl Security Audit Checklist

## Core Security

- [x] **No secrets present in frontend bundles** — PASS
  - Searched all client/ source files for API keys, Stripe secrets, OAuth secrets, JWT secrets, database URLs. None found.
  - Frontend code only references public-safe values (Stripe publishable key via env).

- [x] **No secrets present in Electron preload or renderer** — PASS
  - `electron/preload.js` only exposes IPC bridges, no secrets embedded.
  - Renderer communicates via `contextBridge` with validated IPC channels.

- [ ] **No secrets present in packaged Electron asar** — DEFERRED
  - Cannot verify packaged asar from this environment. Must be verified post-build by inspecting the asar archive contents.

- [x] **All secrets stored in environment variables** — PASS
  - `JWT_SECRET`, `SESSION_SECRET`, `STRIPE_SECRET_KEY`, `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_SECRET`, `RAILWAY_DATABASE_URL`, and `DATABASE_URL` are loaded from `process.env`.
  - `.env` is in `.gitignore`.
  - Railway PostgreSQL is the only database provider; connection strings must not be copied into Markdown, source files, or frontend bundles.

- [x] **Structured logging implemented** — PASS
  - Every API request now logs: `[requestId] ISO-timestamp METHOD path statusCode durationMs`.
  - Token values in responses are sanitized before logging.

## Authentication

- [x] **JWT secret >= 32 bytes** — PASS
  - Production enforces secret presence (exits if missing) and minimum 32-character length (throws if too short).
  - Dev fallback clearly marked as insecure.

- [x] **JWT validation checks signature** — PASS
  - `jwt.verify()` with explicit `algorithms: ["HS256"]` enforces signature validation.
  - Self-test confirms tampered tokens are rejected.

- [x] **JWT expiration validated** — PASS
  - Tokens signed with `expiresIn: "7d"`. `jwt.verify()` checks expiration by default.
  - Self-test confirms expired tokens are rejected.

- [x] **alg=none rejected** — PASS
  - `algorithms: ["HS256"]` whitelist rejects `alg: none`.
  - Self-test added: `alg=none` token correctly rejected.

- [x] **Issuer validation enforced** — PASS
  - Tokens signed with `issuer: "switchcontrol"`. Verification enforces `issuer: "switchcontrol"`.
  - Self-test added: wrong issuer token correctly rejected.

- [x] **OAuth state parameter validated** — PASS
  - Passport.js OAuth strategies use session-based state by default. Auth source tracked via signed cookies (`auth_source`, `auth_next`).

- [x] **Logout invalidates sessions** — PASS
  - `/auth/logout` clears session, destroys DB session record, and clears `switchcontrol.sid` cookie.

## Authorization

- [x] **Premium entitlements enforced server-side** — PASS
  - `requirePremium` middleware checks user's premium status on every premium endpoint.
  - Client UI state cannot override server-side checks.

- [x] **Protected routes require authentication middleware** — PASS
  - `isAuthenticated` middleware applied to all user-specific endpoints.
  - `requirePremium` layered on premium features (e.g., AI scan).

- [x] **Unauthorized premium access attempts fail** — PASS
  - Calling premium endpoints without valid session/JWT returns 401/403.

## Input Validation

- [x] **All inputs validated using schema validation** — PASS
  - API routes use Zod schemas from `drizzle-zod` for request body validation.
  - CSRF middleware validates tokens on state-changing requests.

- [x] **No SQL string concatenation** — PASS
  - All database queries use Drizzle ORM parameterized query builder.
  - `sql` template literals used only for DB defaults (`gen_random_uuid()`), never with user input.

- [x] **HTML injection prevented** — PASS
  - Single `dangerouslySetInnerHTML` usage is for chart CSS theming from controlled config objects, not user input.

## Rate Limiting

- [x] **Auth endpoints rate limited** — PASS
  - `/api/auth/*`: 100 requests per 15 minutes via `express-rate-limit`.
  - `/api/me`: 60 requests per minute.
  - AI endpoints: 3 per 5 minutes + 15 per hour.

- [x] **Login brute-force protection implemented** — PASS
  - Rate limiter on auth endpoints prevents rapid login attempts.
  - Token exchange has 5-minute TTL on temporary tokens.

- [ ] **Public forms protected against bot abuse** — DEFERRED
  - No public form submission endpoints currently exist. CAPTCHA to be added if contact forms are introduced.

## Web Security

- [x] **Strict CORS configuration** — PASS
  - Production: origin allowlist contains only `https://switchcontrol.org` and `https://www.switchcontrol.org`. Localhost origins are excluded from the production allowlist.
  - Dev: adds localhost/127.0.0.1 origins to the allowlist.
  - `origin: 'null'` no longer accepted.

- [x] **Security headers enabled** — PASS
  - `helmet` middleware installed and configured with all required headers.

- [x] **HSTS enabled** — PASS
  - Production: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.

- [x] **Content-Security-Policy configured** — PASS
  - CSP directives: `default-src 'self'`, script/style/font/img/connect/frame sources explicitly whitelisted.
  - `object-src 'none'` blocks Flash/plugin-based attacks.

- [x] **X-Content-Type-Options: nosniff** — PASS
  - Set by helmet.

- [x] **X-Frame-Options: SAMEORIGIN** — PASS
  - Set by helmet.

- [x] **Referrer-Policy: strict-origin-when-cross-origin** — PASS
  - Set by helmet.

- [x] **Permissions-Policy** — PASS
  - Set by helmet defaults.

## Cloudflare Protection

- [ ] **Full Strict TLS enabled** — DEFERRED
  - Cannot verify from this environment. Must be configured in Cloudflare dashboard.

- [ ] **WAF enabled** — DEFERRED
  - Cannot verify from this environment. Must be configured in Cloudflare dashboard.

- [ ] **Origin server hidden behind Cloudflare** — DEFERRED
  - Requires infrastructure-level verification.

- [ ] **DNSSEC enabled** — DEFERRED
  - Requires domain registrar and Cloudflare dashboard verification.

## Dependency Security

- [x] **Lockfile present** — PASS
  - `package-lock.json` committed to repository.

- [ ] **Dependency scanning enabled** — DEFERRED
  - No CI pipeline currently configured. Recommend adding `npm audit` to CI when set up.

- [x] **No unused packages** — PASS
  - Dependencies reviewed. All packages in use by the application.

## Electron Security

- [x] **nodeIntegration disabled** — PASS
  - `nodeIntegration: false` in BrowserWindow webPreferences.

- [x] **contextIsolation enabled** — PASS
  - `contextIsolation: true` in BrowserWindow webPreferences.

- [ ] **remote module disabled** — PASS
  - `@electron/remote` not installed. Remote module not available.

- [x] **Navigation blocked** — PASS
  - `will-navigate` handler blocks external navigation. Only `file:`, `localhost`, `127.0.0.1`, and `switchcontrol.org` allowed.

- [x] **External links restricted** — PASS
  - `setWindowOpenHandler` denies all new windows. URLs validated for safe protocols before `shell.openExternal`.

## IPC Security

- [x] **IPC handlers validate inputs** — PASS
  - `tweak:execute`: validates `tweakId` is string, `action` is in `['apply', 'revert']`.
  - `tweak:checkStatus`: validates `tweakId` is string.
  - `memory:clean`: validates `mode` is in `['safe', 'smart', 'advanced']`.

- [x] **openExternal restricted to safe protocols** — PASS
  - URL parsed with `new URL()`. Only `https:` and `mailto:` allowed in production.
  - `http:` additionally allowed in development only.
  - `file:`, `javascript:`, `data:` protocols blocked.

- [x] **Shell commands use execFile** — PASS
  - `tweak-executor.js` uses `execFile('powershell', [...])` not `exec()`.
  - `memory:clean` uses `execFile` with fixed executable path.
  - `nvidia-smi` calls use `exec` but with hardcoded command strings, no user input.

- [ ] **IPC timeouts implemented** — PASS
  - PowerShell commands have 30s timeout. Status checks have 10s timeout.

## Native Helper Security

- [x] **Rust helper outputs JSON only** — PASS
  - `sc_memory.exe` outputs structured JSON to stdout. Errors to stderr.

- [x] **Helper runs without admin privileges** — PASS
  - Uses `K32EmptyWorkingSet` which operates on user-level processes only.

- [x] **Helper cannot terminate processes** — PASS
  - Only performs working set reduction via `K32EmptyWorkingSet`. No process termination.

## Packaging Security

- [ ] **Electron builds signed** — DEFERRED
  - Build logs show "no signing info identified, signing is skipped". Code signing certificate needed for production release.

- [ ] **Auto updates delivered securely** — DEFERRED
  - No auto-update mechanism currently implemented. Must use HTTPS + signed updates when added.

## Runtime Security

- [x] **DevTools disabled in production** — PASS
  - `devTools: isDev` in BrowserWindow config. DevTools keyboard shortcut gated behind `isDev` check.

- [x] **Deep links validated** — PASS
  - Protocol handler only processes `switchcontrol://` URLs. Token format validated during exchange.

- [ ] **UI fail-safe timeouts implemented** — DEFERRED
  - Review needed for all modal/loading states to ensure timeout fallbacks exist.

## Error Handling

- [x] **Security failures fail closed** — PASS
  - JWT verification failure returns null (unauthenticated).
  - Missing/invalid session treated as unauthenticated.
  - IPC validation failure returns error response.
  - Production 500 errors return generic "Internal Server Error" without stack traces.

- [x] **Stack traces not exposed in production** — PASS
  - Global error handler only shows generic message for 500+ errors in production.

## Secrets and Data Exposure

- [x] **Secrets not in logs** — PASS
  - Token values in API responses are sanitized before logging.
  - JWT self-test does not log full tokens.
  - No secret values printed in server startup logs.

## Security Testing

- [ ] **SQL injection tests executed** — DEFERRED
  - Drizzle ORM provides parameterized queries. Manual penetration testing recommended.

- [ ] **Auth bypass tests executed** — DEFERRED
  - JWT self-tests cover token validation. Full auth bypass testing recommended.

- [ ] **Rate limit tests executed** — DEFERRED
  - Rate limiters configured. Load testing recommended to verify behavior.

- [ ] **CORS tests executed** — DEFERRED
  - CORS configured correctly. Cross-origin testing recommended.

- [ ] **Electron protocol abuse tests executed** — DEFERRED
  - Protocol validation implemented. Testing with `file://`, `javascript:`, `data:` recommended.

- [ ] **IPC abuse tests executed** — DEFERRED
  - Input validation added. Malformed payload testing recommended.

- [ ] **Packaged app scanned for secrets** — DEFERRED
  - Must be performed post-build by inspecting asar archive.
