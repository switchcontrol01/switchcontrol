# SwitchControl Security Assumptions

## Expected Attacker Capabilities

### Web Application Threats

- **Unauthenticated remote attacker** who can send arbitrary HTTP requests to the public API
- **Authenticated attacker** with a valid free-tier account attempting to access premium features
- **Cross-origin attacker** attempting to exploit CORS misconfigurations from a malicious website
- **Credential stuffing** using lists of leaked username/password combinations
- **Session hijacking** via cookie theft or XSS
- **Input injection** including SQL injection, XSS payloads, and command injection via API inputs

### Electron Application Threats

- **Deep link abuse** using crafted `switchcontrol://` URLs to trigger unintended behavior
- **Protocol handler abuse** attempting to use `file:`, `javascript:`, or `data:` URLs via IPC
- **IPC tampering** sending malformed payloads to IPC handlers from compromised renderer
- **Local privilege escalation** via the native Rust helper or PowerShell tweak executor

### Supply Chain Threats

- **Dependency compromise** via malicious npm packages or compromised transitive dependencies
- **Build pipeline compromise** if CI/CD secrets are exposed

## Threats the System is Designed to Mitigate

### Authentication and Session Security

- **JWT forgery**: Tokens use HS256 with a server-side secret, algorithm is pinned, `alg=none` is rejected, and issuer is validated
- **Session fixation**: Sessions are managed server-side with `connect-pg-simple`, cookies use `httpOnly`, `secure`, and `sameSite` flags
- **Brute force login**: Rate limiting on auth endpoints (100 requests per 15 minutes)
- **Token replay**: JWTs expire after 7 days; temporary exchange tokens expire after 5 minutes
- **OAuth state attacks**: Passport.js manages OAuth state through session-backed flow

### Authorization Bypass

- **Premium feature access**: Server-side `requirePremium` middleware checks entitlements on every premium endpoint
- **Horizontal privilege escalation**: Session/JWT user identity is verified server-side for all user-specific operations

### Injection Attacks

- **SQL injection**: Drizzle ORM provides parameterized queries; no raw SQL string concatenation exists
- **XSS**: React's default escaping, no user-controlled `dangerouslySetInnerHTML`, Content-Security-Policy headers
- **CSRF**: Custom CSRF middleware validates `x-csrf-token` header against `_csrf` cookie on state-changing requests

### Transport Security

- **Man-in-the-middle**: HTTPS enforced via HSTS header (1 year, includeSubDomains, preload)
- **Protocol downgrade**: `upgrade-insecure-requests` CSP directive in production
- **Cookie interception**: All session cookies marked `secure`

### Electron-Specific Threats

- **Renderer compromise**: `contextIsolation: true`, `nodeIntegration: false`, minimal preload API surface
- **Navigation hijacking**: `will-navigate` handler blocks external navigation, `setWindowOpenHandler` denies new windows
- **Protocol abuse**: `open-external` IPC validates URL format and restricts to `https:` and `mailto:` in production
- **IPC abuse**: Input validation on all sensitive IPC handlers (tweak execution, memory cleaning)
- **DevTools access**: DevTools disabled in production builds

### Information Disclosure

- **Error leakage**: Production error responses return generic messages; stack traces logged server-side only
- **Secret logging**: Token values sanitized in request logs
- **Header exposure**: Security headers prevent content-type sniffing, clickjacking, and referrer leakage

## Threats Intentionally Out of Scope

### Physical Access Threats

- An attacker with physical access to the user's machine is out of scope. The Electron app stores data in the user's `userData` directory which is accessible to any process running under the same user account.

### Advanced Persistent Threats

- State-level attackers or advanced persistent threats with the ability to compromise the operating system, hardware, or network infrastructure are out of scope.

### Social Engineering

- Phishing attacks that trick users into providing their credentials to fake login pages are mitigated by OAuth (users authenticate directly with Google/Discord) but cannot be fully prevented at the application level.

### DDoS Attacks

- Large-scale distributed denial of service attacks are expected to be mitigated at the infrastructure level (Cloudflare) rather than at the application level. Application-level rate limiting provides basic protection.

### Client-Side Tampering

- Users modifying their own Electron application code or local storage is expected behavior. Premium entitlements are validated server-side, so client-side tampering cannot grant unauthorized access to premium features.

### Malicious Native Extensions

- If a user installs malicious software that hooks into the Electron process or intercepts IPC, this is out of scope. The application assumes the host operating system is not compromised.

### Auto-Update Attacks

- No auto-update mechanism currently exists. When implemented, update integrity verification will be required (HTTPS delivery + signed packages).
