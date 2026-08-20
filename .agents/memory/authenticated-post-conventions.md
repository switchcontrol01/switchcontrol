---
name: Authenticated POST conventions
description: Client request requirements when adding auth and CSRF to existing raw fetch endpoints.
---

When an existing raw POST endpoint is upgraded to JWT and CSRF protection, update its client caller to use the shared authenticated API helper rather than relying on plain fetch.

**Why:** Plain same-origin fetch carries session cookies but does not automatically send the double-submit CSRF header, so a security hardening change can silently break an otherwise authenticated browser flow.

**How to apply:** For client POSTs to protected routes, use the shared cloud API helper so JWT, Electron device headers, cookies, and CSRF handling remain consistent.