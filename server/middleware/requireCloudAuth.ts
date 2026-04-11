import { RequestHandler } from "express";
import { verifyJwt } from "../lib/jwt";
import { storage } from "../storage";
import { resolveEffectivePlan, isPlanActive } from "../lib/planUtils";

declare global {
  namespace Express {
    interface Request {
      cloudUser?: { id: string; isPremium: boolean; email: string | null; isAdmin: boolean };
    }
  }
}

export const requireJwt: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const payload = verifyJwt(token);
    if (!payload?.sub) {
      console.warn(`[CloudAuth] Invalid JWT | ip=${req.ip}`);
      return res.status(401).json({ error: "Invalid or expired session. Please log in again." });
    }
    try {
      const user = await storage.getUser(payload.sub);
      if (!user) {
        return res.status(401).json({ error: "User account not found. Please log in again." });
      }
      const effectivePlan = resolveEffectivePlan(user);
      req.cloudUser = {
        id: user.id,
        isPremium: isPlanActive(effectivePlan),
        email: user.email ?? null,
        isAdmin: user.isAdmin ?? false,
      };
      console.log(`[CloudAuth] JWT OK | user=${user.id} effectivePlan=${effectivePlan} isPremium=${req.cloudUser.isPremium}`);
      return next();
    } catch (e) {
      console.error("[CloudAuth] DB error during JWT auth:", e);
      return res.status(500).json({ error: "Authentication check failed. Please try again." });
    }
  }

  if ((req as any).isAuthenticated?.() && (req as any).user) {
    const sessionUser = (req as any).user;
    try {
      const user = await storage.getUser(sessionUser.id);
      if (user) {
        const effectivePlan = resolveEffectivePlan(user);
        req.cloudUser = {
          id: user.id,
          isPremium: isPlanActive(effectivePlan),
          email: user.email ?? null,
          isAdmin: user.isAdmin ?? false,
        };
        return next();
      }
    } catch {}
  }

  return res.status(401).json({ error: "Authentication required. Please log in to use AI features." });
};

export const requireCloudPremium: RequestHandler = (req, res, next) => {
  if (!req.cloudUser) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!req.cloudUser.isPremium) {
    return res.status(403).json({
      error: "Premium required to use AI features.",
      code: "premium_required",
    });
  }
  return next();
};
