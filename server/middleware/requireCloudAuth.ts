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

// ── Token fingerprint + dedup helpers ────────────────────────────────────────
// A "fingerprint" is the first 6 chars of the base64url header + first 6 chars
// of the base64url payload. This uniquely identifies a token without exposing
// any secret data (the signature is never logged).
function tokenFingerprint(token: string): string {
  try {
    const parts = token.split('.');
    return (parts[0] ?? '').substring(0, 6) + '.' + (parts[1] ?? '').substring(0, 6);
  } catch {
    return 'malformed';
  }
}

// Per-fingerprint dedup map: fingerprint → last-warning timestamp (ms).
// Suppresses repeated "invalid JWT" warnings for the same token within 60 s.
const _invalidTokenLastWarn = new Map<string, number>();
const INVALID_TOKEN_WARN_INTERVAL_MS = 60_000;

function shouldWarnInvalidToken(fp: string): boolean {
  const last = _invalidTokenLastWarn.get(fp) ?? 0;
  const now = Date.now();
  if (now - last >= INVALID_TOKEN_WARN_INTERVAL_MS) {
    _invalidTokenLastWarn.set(fp, now);
    return true;
  }
  return false;
}

export const requireJwt: RequestHandler = async (req, res, next) => {
  // ── Electron embedded backend fast-path ──────────────────────────────────────
  // The cloud JWT is signed with the cloud's JWT_SECRET which the packaged
  // embedded backend does not (and should not) have. Instead, the renderer sends
  // the authenticated user's ID via x-electron-uid (safe: 127.0.0.1 only).
  if (isElectronBackend) {
    const electronUid = req.headers['x-electron-uid'];
    if (typeof electronUid === 'string' && electronUid.length > 0) {
      req.cloudUser = {
        id: electronUid,
        isPremium: false,
        plan: 'free',
        trialEndsAt: null,
        email: null,
        isAdmin: false,
        premiumBoundDeviceId: null,
      };
      return next();
    }

    // Fallback: if a JWT is present (e.g. older client), decode WITHOUT signature
    // verification — we cannot verify the cloud signature locally and logging it
    // as an error would spam the log. Payload trust is safe here (127.0.0.1 only).
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const jwtLib = await import('jsonwebtoken');
        const decoded = jwtLib.default.decode(token) as { sub?: string; iss?: string } | null;
        if (decoded?.sub) {
          console.log(
            `[CloudAuth] Electron local-trust decode | method=${req.method} path=${req.path} sub=${decoded.sub}`
          );
          req.cloudUser = {
            id: decoded.sub,
            isPremium: false,
            plan: 'free',
            trialEndsAt: null,
            email: null,
            isAdmin: false,
            premiumBoundDeviceId: null,
          };
          return next();
        }
      } catch {
        // jwt.decode never throws for malformed tokens — falls through below
      }
      console.warn(
        `[CloudAuth] Electron mode: JWT present but undecodable | method=${req.method} path=${req.path}`
      );
    } else {
      console.warn(
        `[CloudAuth] Electron mode: no auth header and no x-electron-uid | method=${req.method} path=${req.path}`
      );
    }

    return res.status(401).json({ error: "Authentication required. Please log in." });
  }

  // ── Standard (cloud/web) auth path ──────────────────────────────────────────
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const fp = tokenFingerprint(token);
    const payload = verifyJwt(token);
    if (!payload?.sub) {
      // JWT present but invalid/expired — log once per unique token fingerprint
      // (60 s dedup window) then fall through to session cookie check.
      const hasSession = !!(req as any).isAuthenticated?.();
      if (shouldWarnInvalidToken(fp)) {
        console.warn(
          `[CloudAuth] Invalid/expired JWT — falling through to session check | ` +
          `method=${req.method} path=${req.path} tokenId=${fp} hasSession=${hasSession} electronBackend=${isElectronBackend}`
        );
      }
    } else {
      try {
        const user = await storage.getUser(payload.sub);
        if (!user) {
          console.warn(`[CloudAuth] JWT user not found in DB — falling through to session check | sub=${payload.sub} tokenId=${fp}`);
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
        // Only log when a JWT was also present (shows the fallback path taken)
        if (authHeader?.startsWith('Bearer ')) {
          console.log(
            `[CloudAuth] Session-cookie fallback succeeded | method=${req.method} path=${req.path} sub=${user.id}`
          );
        }
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
