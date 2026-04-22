import { RequestHandler } from "express";
import { verifyJwt } from "../lib/jwt";
import { storage } from "../storage";
import { resolveEffectivePlan, isPlanActive } from "../lib/planUtils";

declare global {
  namespace Express {
    interface Request {
      cloudUser?: {
        id: string;
        isPremium: boolean;
        plan: string;
        trialEndsAt: Date | null;
        email: string | null;
        isAdmin: boolean;
        premiumBoundDeviceId: string | null;
      };
    }
  }
}

const isElectronBackend = process.env.ELECTRON_BACKEND === '1';

export const requireJwt: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const payload = verifyJwt(token);
    if (!payload?.sub) {
      // JWT present but invalid/expired — fall through to session cookie check
      // rather than hard-failing. This prevents stale persisted JWTs from
      // blocking users who have a valid session cookie.
      console.warn(`[CloudAuth] Invalid/expired JWT — falling through to session check | ip=${req.ip}`);
    } else {
      // ── Electron local backend: no DB available, trust the verified JWT directly ──
      // The JWT was issued by switchcontrol.org using the shared JWT_SECRET.
      // A valid HS256 signature + non-expired payload is sufficient proof of identity.
      // We cannot do a DB user lookup here because DATABASE_URL is stripped in Electron mode.
      if (isElectronBackend) {
        req.cloudUser = {
          id: payload.sub,
          isPremium: false,
          plan: 'free',
          trialEndsAt: null,
          email: null,
          isAdmin: false,
          premiumBoundDeviceId: null,
        };
        return next();
      }

      try {
        const user = await storage.getUser(payload.sub);
        if (!user) {
          // User not found in DB — fall through to session
          console.warn(`[CloudAuth] JWT user not found in DB — falling through to session check | sub=${payload.sub}`);
        } else {
          const effectivePlan = resolveEffectivePlan(user);
          req.cloudUser = {
            id: user.id,
            isPremium: isPlanActive(effectivePlan),
            plan: effectivePlan,
            trialEndsAt: user.trialEndsAt ?? null,
            email: user.email ?? null,
            isAdmin: user.isAdmin ?? false,
            premiumBoundDeviceId: user.premiumBoundDeviceId ?? null,
          };
          return next();
        }
      } catch (e) {
        console.error("[CloudAuth] DB error during JWT auth:", e);
        return res.status(500).json({ error: "Authentication check failed. Please try again." });
      }
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
          plan: effectivePlan,
          trialEndsAt: user.trialEndsAt ?? null,
          email: user.email ?? null,
          isAdmin: user.isAdmin ?? false,
          premiumBoundDeviceId: user.premiumBoundDeviceId ?? null,
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

  // Device lock enforcement — only applied when Electron sends x-device-id
  // Website/browser sessions never send this header, so they are unaffected
  const deviceId = req.headers["x-device-id"] as string | undefined;
  const boundDeviceId = req.cloudUser.premiumBoundDeviceId;
  if (deviceId && boundDeviceId && deviceId !== boundDeviceId) {
    console.warn(
      `[DeviceLock] Blocked premium API access | user=${req.cloudUser.id} | bound=${boundDeviceId} | presented=${deviceId}`
    );
    return res.status(403).json({
      error: "Premium is locked to another device.",
      code: "device_locked",
    });
  }

  return next();
};
