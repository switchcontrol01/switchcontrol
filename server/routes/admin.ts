import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { storage } from "../storage";
import { requireAdmin } from "../middleware/requireAdmin";
import { resolveEffectivePlan } from "../lib/planUtils";
import type { User } from "@shared/models/auth";

const router = Router();

const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});

const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many write requests, please slow down." },
});

function serializeUser(u: User) {
  const effectivePlan = resolveEffectivePlan(u);
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    displayName: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id,
    profileImageUrl: u.profileImageUrl,
    provider: u.provider,
    isPremium: u.isPremium,
    plan: u.plan,
    effectivePlan,
    isActive: effectivePlan === "premium" || effectivePlan === "trial",
    trialStartedAt: u.trialStartedAt,
    trialEndsAt: u.trialEndsAt,
    trialDurationHours: u.trialDurationHours,
    trialGrantedByAdminId: u.trialGrantedByAdminId,
    trialReason: u.trialReason,
    hasUsedTrial: u.hasUsedTrial,
    isAdmin: u.isAdmin,
    stripeCustomerId: u.stripeCustomerId,
    premiumActivatedAt: u.premiumActivatedAt,
    lastLoginAt: u.lastLoginAt,
    lastAppActiveAt: u.lastAppActiveAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

// GET /api/admin/users
router.get("/users", requireAdmin, readLimiter, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string | undefined)?.trim() || undefined;
    const plan = (req.query.plan as string | undefined) || undefined;

    const { users, total } = await storage.listUsers({ limit, offset, search, plan });

    res.json({
      users: users.map(serializeUser),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("[admin] listUsers error:", err);
    res.status(500).json({ error: "Failed to list users." });
  }
});

// GET /api/admin/users/:id
router.get("/users/:id", requireAdmin, readLimiter, async (req, res) => {
  try {
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    const logs = await storage.getAdminLogs({ targetUserId: user.id, limit: 20 });
    res.json({ user: serializeUser(user), logs });
  } catch (err) {
    console.error("[admin] getUser error:", err);
    res.status(500).json({ error: "Failed to fetch user." });
  }
});

const setPlanSchema = z.object({
  plan: z.enum(["free", "trial", "premium"]),
  trialDurationHours: z.number().int().min(1).max(8760).optional(),
  reason: z.string().max(500).optional(),
});

// PATCH /api/admin/users/:id/plan
router.patch("/users/:id/plan", requireAdmin, writeLimiter, async (req, res) => {
  const adminUser = (req as any).adminUser as User;

  const parsed = setPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });
  }

  const { plan, trialDurationHours, reason } = parsed.data;
  const targetId = req.params.id;

  try {
    const existing = await storage.getUser(targetId);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const previousValue = {
      plan: existing.plan,
      isPremium: existing.isPremium,
      trialEndsAt: existing.trialEndsAt,
    };

    const updated = await storage.setUserPlan(targetId, {
      plan,
      trialDurationHours,
      reason,
      grantedByAdminId: adminUser.id,
    });

    await storage.addAdminLog({
      adminUserId: adminUser.id,
      targetUserId: targetId,
      action: `set_plan:${plan}`,
      previousValue,
      newValue: {
        plan: updated.plan,
        isPremium: updated.isPremium,
        trialEndsAt: updated.trialEndsAt,
      },
      metadata: { reason: reason ?? null, trialDurationHours: trialDurationHours ?? null },
    });

    console.log(`[admin] ${adminUser.email} set plan=${plan} for user=${targetId} reason="${reason ?? ''}"`);
    res.json({ ok: true, user: serializeUser(updated) });
  } catch (err) {
    console.error("[admin] setUserPlan error:", err);
    res.status(500).json({ error: "Failed to update plan." });
  }
});

const setAdminSchema = z.object({
  isAdmin: z.boolean(),
});

// PATCH /api/admin/users/:id/admin-status
router.patch("/users/:id/admin-status", requireAdmin, writeLimiter, async (req, res) => {
  const adminUser = (req as any).adminUser as User;

  const parsed = setAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });
  }

  const targetId = req.params.id;

  if (targetId === adminUser.id && !parsed.data.isAdmin) {
    return res.status(400).json({ error: "You cannot remove your own admin access." });
  }

  try {
    const existing = await storage.getUser(targetId);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const updated = await storage.setUserAdmin(targetId, parsed.data.isAdmin);

    await storage.addAdminLog({
      adminUserId: adminUser.id,
      targetUserId: targetId,
      action: parsed.data.isAdmin ? "grant_admin" : "revoke_admin",
      previousValue: { isAdmin: existing.isAdmin },
      newValue: { isAdmin: updated.isAdmin },
      metadata: null,
    });

    console.log(`[admin] ${adminUser.email} set isAdmin=${parsed.data.isAdmin} for user=${targetId}`);
    res.json({ ok: true, user: serializeUser(updated) });
  } catch (err) {
    console.error("[admin] setUserAdmin error:", err);
    res.status(500).json({ error: "Failed to update admin status." });
  }
});

// GET /api/admin/logs
router.get("/logs", requireAdmin, readLimiter, async (req, res) => {
  try {
    const targetUserId = (req.query.userId as string | undefined) || undefined;
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

    const logs = await storage.getAdminLogs({ targetUserId, limit, offset });
    res.json({ logs });
  } catch (err) {
    console.error("[admin] getLogs error:", err);
    res.status(500).json({ error: "Failed to fetch logs." });
  }
});

// GET /api/admin/me — quick self-check for the frontend
router.get("/me", requireAdmin, readLimiter, (req, res) => {
  const adminUser = (req as any).adminUser as User;
  res.json({ ok: true, adminId: adminUser.id, email: adminUser.email });
});

/**
 * POST /api/admin/bootstrap
 * One-time self-service admin bootstrap. Works only when:
 *   a) No admins exist yet in the database, OR
 *   b) ADMIN_SETUP_KEY env var is set and matches the request body key.
 * After the first admin is set, route (a) is permanently disabled.
 */
router.post("/bootstrap", writeLimiter, async (req, res) => {
  let userId: string | undefined;

  const sessionUser = (req as any).user as { id: string } | undefined;
  if (sessionUser?.id) {
    userId = sessionUser.id;
  } else {
    const { verifyJwt } = await import("../lib/jwt");
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const payload = verifyJwt(authHeader.substring(7));
      if (payload?.sub) userId = payload.sub;
    }
  }

  if (!userId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const { key } = req.body || {};
  const setupKey = process.env.ADMIN_SETUP_KEY;
  const keyMatches = setupKey && key === setupKey;

  if (!keyMatches) {
    const adminCount = await storage.countAdmins();
    if (adminCount > 0) {
      return res.status(403).json({ error: "Admin bootstrap disabled — admins already exist." });
    }
  }

  try {
    const updated = await storage.setUserAdmin(userId, true);
    console.log(`[admin] Bootstrap: user=${userId} (${updated.email}) granted admin via bootstrap`);
    res.json({ ok: true, message: "Admin access granted.", userId });
  } catch (err) {
    console.error("[admin] bootstrap error:", err);
    res.status(500).json({ error: "Failed to grant admin." });
  }
});

export default router;
