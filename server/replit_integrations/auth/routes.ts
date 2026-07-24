import type { Express } from "express";
import type { User } from "@shared/models/auth";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";

// ── IMPORTANT: registerAuthRoutes is legacy Replit-OIDC scaffolding ───────────
// It is NOT called anywhere in the active codebase (routes.ts / index.ts use
// setupGoogleAuth / setupDiscordAuth instead). These routes are dead code.
//
// DO NOT activate them without a security review: they use a different auth
// mechanism (Replit OIDC req.user.claims.sub) from the live JWT+session system
// and would register duplicate /api/me and /api/auth/me handlers that shadow —
// or are shadowed by — the ones in server/auth/google.ts depending on call order.
//
// The raw-row leak has been fixed below regardless, so activating this file
// accidentally will no longer send passwordHash / stripeCustomerId /
// deviceSignature / premiumBoundDeviceId to the frontend.

/**
 * Project only client-safe fields from a raw DB user row.
 *
 * NEVER send the full User object to the client. The users table contains:
 *   - passwordHash          — credential material
 *   - stripeCustomerId      — internal billing reference
 *   - deviceSignature       — HMAC used for device-binding; exposing it lets a
 *                             client forge a valid device signature for hardware
 *                             it does not legitimately own
 *   - premiumBoundDeviceId  — internal device-binding state
 *   - trialGrantedByAdminId — internal audit field
 *   …and other columns that have no business being in an API response.
 */
function projectSafeUserFields(user: User) {
  return {
    id:                    user.id,
    email:                 user.email,
    firstName:             user.firstName,
    lastName:              user.lastName,
    profileImageUrl:       user.profileImageUrl,
    isPremium:             user.isPremium,
    plan:                  user.plan,
    trialEndsAt:           user.trialEndsAt ?? null,
    isAdmin:               user.isAdmin || false,
    hasSeenPremiumUnlock:  user.hasSeenPremiumUnlock  || false,
    hasSeenPremiumTour:    user.hasSeenPremiumTour     || false,
    hasSeenTrialActivation:user.hasSeenTrialActivation || false,
    hasSeenTrialTour:      user.hasSeenTrialTour       || false,
  };
}

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user (returns 401 if not authenticated)
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      // Project safe fields only — never return the raw DB row.
      res.json(user ? projectSafeUserFields(user) : null);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Get current user or null (no 401, for frontend auth checks)
  app.get("/api/auth/me", async (req: any, res) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated() || !req.user?.claims?.sub) {
        return res.json(null);
      }
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      // Project safe fields only — never return the raw DB row.
      res.json(user ? projectSafeUserFields(user) : null);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.json(null);
    }
  });

  // Alias for /api/auth/me at /api/me for convenience.
  // WARNING: registering this creates a duplicate of the /api/me handler in
  // server/auth/google.ts. Express first-registered-wins means whichever
  // setupGoogleAuth() or registerAuthRoutes() runs first owns the route.
  // The google.ts version is the authoritative one — do not activate this.
  app.get("/api/me", async (req: any, res) => {
    console.log(`[AUTH] /api/me hit - authenticated: ${req.isAuthenticated?.()}`);
    try {
      if (!req.isAuthenticated || !req.isAuthenticated() || !req.user?.claims?.sub) {
        return res.json(null);
      }
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      // Project safe fields only — never return the raw DB row.
      res.json(user ? projectSafeUserFields(user) : null);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.json(null);
    }
  });
}
