import { RequestHandler } from "express";
import { verifyJwt } from "../lib/jwt";
import { storage } from "../storage";
import { isNoDbMode } from "../db";
import { resolveEffectivePlan, isPlanActive } from "../lib/planUtils";
import { verifyDeviceSignature } from "../lib/deviceSignature";

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
        deviceSignature: string | null;
      };
    }
  }
}

const isElectronBackend = process.env.ELECTRON_BACKEND === '1';

// ── Loopback guard ────────────────────────────────────────────────────────────
// Returns true only when the TCP connection originated from localhost.
// Used to gate the Electron unsigned-token trust path — if the backend is ever
// accidentally exposed on a non-loopback interface (misconfiguration, Docker,
// future change), unsigned tokens must not be trusted regardless of the env var.
function isLoopback(req: Parameters<RequestHandler>[0]): boolean {
  const addr = req.socket?.remoteAddress ?? req.ip ?? "";
  return (
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "::ffff:127.0.0.1"
  );
}

// ── Token fingerprint + dedup helpers ────────────────────────────────────────
// A "fingerprint" uses the first 6 chars of the base64url header + first 16
// chars of the payload. The payload portion is used for uniqueness — JWT
// headers are almost always identical (same algorithm), so using only 6 chars
// of the header would mean many different tokens share the same fingerprint and
// one could suppress warnings for another.
function tokenFingerprint(token: string): string {
  try {
    const parts = token.split('.');
    return (parts[0] ?? '').substring(0, 6) + '.' + (parts[1] ?? '').substring(0, 16);
  } catch {
    return 'malformed';
  }
}

// Per-fingerprint dedup map: fingerprint → last-warning timestamp (ms).
// Suppresses repeated "invalid JWT" warnings for the same token within 60 s.
// Capped at MAX_WARN_MAP_SIZE to prevent unbounded growth under token-spray attacks.
const _invalidTokenLastWarn = new Map<string, number>();
const INVALID_TOKEN_WARN_INTERVAL_MS = 60_000;
const MAX_WARN_MAP_SIZE = 500;

function shouldWarnInvalidToken(fp: string): boolean {
  const last = _invalidTokenLastWarn.get(fp) ?? 0;
  const now = Date.now();
  if (now - last >= INVALID_TOKEN_WARN_INTERVAL_MS) {
    // Evict oldest entry when the map is at capacity to prevent unbounded growth.
    if (!_invalidTokenLastWarn.has(fp) && _invalidTokenLastWarn.size >= MAX_WARN_MAP_SIZE) {
      const oldestKey = _invalidTokenLastWarn.keys().next().value;
      if (oldestKey !== undefined) _invalidTokenLastWarn.delete(oldestKey);
    }
    _invalidTokenLastWarn.set(fp, now);
    return true;
  }
  return false;
}

export const requireJwt: RequestHandler = async (req, res, next) => {
  // ── Electron embedded backend fast-path ──────────────────────────────────────
  // The cloud JWT is signed with the cloud's JWT_SECRET which the packaged
  // embedded backend does not (and should not) have. Instead, the renderer sends
  // the authenticated user's ID via x-electron-uid.
  //
  // SECURITY: this path is only trusted when the TCP connection is from loopback.
  // If the backend is misconfigured or the ELECTRON_BACKEND env var is set on the
  // cloud server by an attacker, the loopback check prevents unsigned token trust.
  if (isElectronBackend) {
    if (!isLoopback(req)) {
      console.error(
        `[CloudAuth] ELECTRON_BACKEND=1 but request is not from loopback — rejecting | ` +
        `remoteAddress=${req.socket?.remoteAddress} path=${req.path}`
      );
      return res.status(401).json({ error: "Authentication required. Please log in." });
    }

    const electronUid = req.headers['x-electron-uid'];
    if (
      typeof electronUid === 'string' &&
      /^[a-zA-Z0-9_-]{8,64}$/.test(electronUid)
    ) {
      // Validate the UID actually exists in the DB — without this, any well-formed
      // string in x-electron-uid would be trusted as req.cloudUser.id, giving
      // attacker-controlled input to all downstream DB writes and ownership records.
      try {
        const user = await storage.getUser(electronUid);
        if (!user) {
          // The packaged Electron backend deliberately runs without the cloud
          // database. The loopback guard above plus the renderer-provided
          // authenticated identity is the local trust boundary in this mode.
          // Do not reject every intelligence/telemetry request merely because
          // MockStorage cannot persist the cloud user.
          if (isNoDbMode) {
            const planHeader = req.headers['x-electron-plan'];
            const plan = typeof planHeader === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(planHeader)
              ? planHeader
              : 'free';
            const premium = req.headers['x-electron-premium'] === 'true';
            const admin = req.headers['x-electron-admin'] === 'true';
            req.cloudUser = {
              id: electronUid,
              isPremium: premium,
              plan,
              trialEndsAt: null,
              email: null,
              isAdmin: admin,
              premiumBoundDeviceId: null,
              deviceSignature: null,
            };
            return next();
          }
          console.warn(`[CloudAuth] Electron x-electron-uid not found in DB | uid=${electronUid} path=${req.path}`);
          return res.status(401).json({ error: "Authentication required. Please log in." });
        }
        const effectivePlan = resolveEffectivePlan(user);
        req.cloudUser = {
          id: user.id,
          isPremium: isPlanActive(effectivePlan),
          plan: effectivePlan,
          trialEndsAt: user.trialEndsAt ?? null,
          email: user.email ?? null,
          isAdmin: user.isAdmin ?? false,
          premiumBoundDeviceId: user.premiumBoundDeviceId ?? null,
          deviceSignature: user.deviceSignature ?? null,
        };
        return next();
      } catch (e) {
        console.error("[CloudAuth] DB error during Electron UID lookup:", e);
        return res.status(500).json({ error: "Authentication check failed. Please try again." });
      }
    }

    // Fallback: if a JWT is present (e.g. older client), decode WITHOUT signature
    // verification — we cannot verify the cloud signature locally. The loopback
    // check above already enforces the trust boundary for this path.
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const jwtLib = await import('jsonwebtoken');
        // Only extract sub — iss is not verified in local-trust mode.
        const decoded = jwtLib.default.decode(token) as { sub?: string } | null;
        if (decoded?.sub) {
          // Validate sub exists in DB — same reason as the x-electron-uid path above.
          try {
            const user = await storage.getUser(decoded.sub);
            if (!user) {
              console.warn(`[CloudAuth] Electron local-trust sub not found in DB | sub=${decoded.sub} path=${req.path}`);
              return res.status(401).json({ error: "Authentication required. Please log in." });
            }
            console.log(
              `[CloudAuth] Electron local-trust decode | method=${req.method} path=${req.path} sub=${decoded.sub}`
            );
            const effectivePlan = resolveEffectivePlan(user);
            req.cloudUser = {
              id: user.id,
              isPremium: isPlanActive(effectivePlan),
              plan: effectivePlan,
              trialEndsAt: user.trialEndsAt ?? null,
              email: user.email ?? null,
              isAdmin: user.isAdmin ?? false,
              premiumBoundDeviceId: user.premiumBoundDeviceId ?? null,
              deviceSignature: user.deviceSignature ?? null,
            };
            return next();
          } catch (e) {
            console.error("[CloudAuth] DB error during Electron JWT sub lookup:", e);
            return res.status(500).json({ error: "Authentication check failed. Please try again." });
          }
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
            deviceSignature: user.deviceSignature ?? null,
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
          deviceSignature: user.deviceSignature ?? null,
        };
        // Only log when a JWT was also present (shows the fallback path taken)
        if (authHeader?.startsWith('Bearer ')) {
          console.log(
            `[CloudAuth] Session-cookie fallback succeeded | method=${req.method} path=${req.path} sub=${user.id}`
          );
        }
        return next();
      }
      // user not found in DB — fall through to 401
    } catch (e) {
      // Consistent with JWT path: DB errors return 500, not a silent 401.
      // A 401 here would be indistinguishable from "not authenticated" in logs.
      console.error("[CloudAuth] DB error during session auth:", e);
      return res.status(500).json({ error: "Authentication check failed. Please try again." });
    }
  }

  return res.status(401).json({ error: "Authentication required. Please log in." });
};

export const requireCloudPremium: RequestHandler = (req, res, next) => {
  if (!req.cloudUser) {
    // req.cloudUser is only set by requireJwt. If it's missing, either the route
    // forgot to run requireJwt first, or the user is not authenticated. The error
    // is intentionally generic — a misconfigured route looks identical to an
    // unauthenticated request so we don't expose middleware ordering in responses.
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!req.cloudUser.isPremium) {
    return res.status(403).json({
      error: "Premium required to use AI features.",
      code: "premium_required",
    });
  }

  // Device lock enforcement — only applied when Electron sends x-device-id.
  // Website/browser sessions never send this header, so they are unaffected.
  // Note: this means device locking provides no protection for web sessions —
  // a device-locked account can still be accessed from any browser. This is
  // intentional (web sessions use their own session cookie auth) but documented
  // here so the security model is explicit.
  const deviceId = req.headers["x-device-id"] as string | undefined;
  const deviceSignature = req.headers["x-device-signature"] as string | undefined;
  const boundDeviceId = req.cloudUser.premiumBoundDeviceId;
  const boundSignature = req.cloudUser.deviceSignature; // from the stored user record

  if (deviceId && boundDeviceId) {
    if (deviceId !== boundDeviceId) {
      console.warn(
        `[DeviceLock] Blocked premium API access | user=${req.cloudUser.id} | bound=${boundDeviceId} | presented=${deviceId}`
      );
      return res.status(403).json({
        error: "Premium is locked to another device.",
        code: "device_locked",
      });
    }

    // Device ID matches bound device — verify HMAC signature if one is present.
    // If the server has a stored deviceSignature, the client MUST present the same
    // signature on every subsequent call, or the request is treated as untrusted.
    if (boundSignature && (!deviceSignature || !verifyDeviceSignature(req.cloudUser.id, deviceId, deviceSignature))) {
      console.warn(
        `[DeviceLock] Blocked premium API access | user=${req.cloudUser.id} | reason=invalid_device_signature`
      );
      return res.status(403).json({
        error: "Premium device signature mismatch.",
        code: "device_signature_invalid",
      });
    }
  }

  return next();
};
