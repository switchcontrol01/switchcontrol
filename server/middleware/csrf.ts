import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const CSRF_HEADER = "x-csrf-token";
const CSRF_COOKIE = "_csrf";

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
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
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000
    });
  }
  next();
}
