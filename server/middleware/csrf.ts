import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const CSRF_HEADER = "x-csrf-token";
const CSRF_COOKIE = "_csrf";
const isElectronBackend = process.env.ELECTRON_BACKEND === '1';

function csrfCookieOptions() {
  if (isElectronBackend) {
    return {
      httpOnly: false,
      secure: false,
      sameSite: "lax" as const,
      maxAge: 24 * 60 * 60 * 1000,
    };
  }
  return {
    httpOnly: false,
    secure: true,
    sameSite: "none" as const,
    maxAge: 24 * 60 * 60 * 1000,
  };
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Electron backend only receives requests from its own renderer — safe to bypass.
  if (isElectronBackend) {
    return next();
  }

  // JWT Bearer auth is not susceptible to CSRF. Browsers cannot attach an
  // Authorization header to cross-site requests automatically — only cookies
  // are sent implicitly. A request with a Bearer token therefore cannot be
  // forged by a third-party page, so the double-submit check is unnecessary
  // and must not block it (Electron-companion web calls use JWT mode even
  // when talking to the cloud server).
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  next();
}

export function csrfTokenMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = generateCsrfToken();
    res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
  }
  next();
}
