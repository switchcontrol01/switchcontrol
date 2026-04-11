import { RequestHandler } from "express";
import { storage } from "../storage";
import { verifyJwt } from "../lib/jwt";

/**
 * Middleware that gates a route behind admin-level access.
 * Accepts both session (cookie) auth and JWT Bearer auth.
 * Sets req.adminUser on the request if access is granted.
 */
export const requireAdmin: RequestHandler = async (req, res, next) => {
  let userId: string | undefined;

  const sessionUser = (req as any).user as { id: string } | undefined;
  if (sessionUser?.id) {
    userId = sessionUser.id;
  } else {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const payload = verifyJwt(authHeader.substring(7));
      if (payload?.sub) userId = payload.sub;
    }
  }

  if (!userId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ error: "User account not found." });
    }
    if (!user.isAdmin) {
      return res.status(403).json({ error: "Admin access required." });
    }
    (req as any).adminUser = user;
    return next();
  } catch (err) {
    console.error("[requireAdmin] DB error:", err);
    return res.status(500).json({ error: "Authorization check failed." });
  }
};
