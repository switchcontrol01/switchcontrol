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
    hasInstalledApp: u.hasInstalledApp,
    hasSeenPremiumUnlock: u.hasSeenPremiumUnlock,
    hasSeenPremiumTour: u.hasSeenPremiumTour,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    premiumBoundDeviceId: u.premiumBoundDeviceId ?? null,
    premiumBoundAt: u.premiumBoundAt ?? null,
  };
}

function getAdminId(req: any): User {
  return (req as any).adminUser as User;
}

async function auditLog(
  adminUserId: string,
  targetUserId: string,
  action: string,
  previousValue: any,
  newValue: any,
  metadata?: any
) {
  await storage.addAdminLog({
    adminUserId,
    targetUserId,
    action,
    previousValue,
    newValue,
    metadata: metadata ?? null,
  });
}

// ─── User List ──────────────────────────────────────────────────────────────

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

    const logs = await storage.getAdminLogs({ targetUserId: user.id, limit: 30 });
    res.json({ user: serializeUser(user), logs });
  } catch (err) {
    console.error("[admin] getUser error:", err);
    res.status(500).json({ error: "Failed to fetch user." });
  }
});

// GET /api/admin/users/:id/activity
router.get("/users/:id/activity", requireAdmin, readLimiter, async (req, res) => {
  try {
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    res.json({
      userId: user.id,
      lastLoginAt: user.lastLoginAt,
      lastAppActiveAt: user.lastAppActiveAt,
      hasInstalledApp: user.hasInstalledApp,
      createdAt: user.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch activity." });
  }
});

// ─── Plan Management ────────────────────────────────────────────────────────

const setPlanSchema = z.object({
  plan: z.enum(["free", "trial", "premium"]),
  trialDurationHours: z.number().min(1 / 60).max(8760).optional(),
  reason: z.string().max(500).optional(),
});

// PATCH /api/admin/users/:id/plan  (generic set)
router.patch("/users/:id/plan", requireAdmin, writeLimiter, async (req, res) => {
  const admin = getAdminId(req);
  const parsed = setPlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });

  const { plan, trialDurationHours, reason } = parsed.data;
  const targetId = req.params.id;

  try {
    const existing = await storage.getUser(targetId);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const prev = { plan: existing.plan, isPremium: existing.isPremium, trialEndsAt: existing.trialEndsAt };
    const updated = await storage.setUserPlan(targetId, { plan, trialDurationHours, reason, grantedByAdminId: admin.id });

    await auditLog(admin.id, targetId, `set_plan:${plan}`, prev, { plan: updated.plan, isPremium: updated.isPremium, trialEndsAt: updated.trialEndsAt }, { reason: reason ?? null, trialDurationHours: trialDurationHours ?? null });
    console.log(`[admin] ${admin.email} set plan=${plan} for user=${targetId}`);
    res.json({ ok: true, user: serializeUser(updated) });
  } catch (err) {
    console.error("[admin] setUserPlan error:", err);
    res.status(500).json({ error: "Failed to update plan." });
  }
});

const setTrialSchema = z.object({
  durationHours: z.number().int().min(1).max(8760),
  reason: z.string().max(500).optional(),
});

// POST /api/admin/users/:id/set-trial
router.post("/users/:id/set-trial", requireAdmin, writeLimiter, async (req, res) => {
  const admin = getAdminId(req);
  const parsed = setTrialSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });

  const { durationHours, reason } = parsed.data;
  const targetId = req.params.id;

  try {
    const existing = await storage.getUser(targetId);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const prev = { plan: existing.plan, trialEndsAt: existing.trialEndsAt };
    const updated = await storage.setUserPlan(targetId, { plan: "trial", trialDurationHours: durationHours, reason, grantedByAdminId: admin.id });

    await auditLog(admin.id, targetId, "set_trial", prev, { plan: updated.plan, trialEndsAt: updated.trialEndsAt, durationHours }, { reason: reason ?? null, durationHours });
    console.log(`[admin] ${admin.email} set trial ${durationHours}h for user=${targetId}`);
    res.json({ ok: true, user: serializeUser(updated) });
  } catch (err) {
    console.error("[admin] setTrial error:", err);
    res.status(500).json({ error: "Failed to set trial." });
  }
});

const extendTrialSchema = z.object({
  extraHours: z.number().int().min(1).max(8760),
  reason: z.string().max(500).optional(),
});

// POST /api/admin/users/:id/extend-trial
router.post("/users/:id/extend-trial", requireAdmin, writeLimiter, async (req, res) => {
  const admin = getAdminId(req);
  const parsed = extendTrialSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });

  const { extraHours, reason } = parsed.data;
  const targetId = req.params.id;

  try {
    const existing = await storage.getUser(targetId);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const prev = { trialEndsAt: existing.trialEndsAt };
    const updated = await storage.extendTrial(targetId, extraHours);

    await auditLog(admin.id, targetId, "extend_trial", prev, { trialEndsAt: updated.trialEndsAt }, { extraHours, reason: reason ?? null });
    console.log(`[admin] ${admin.email} extended trial +${extraHours}h for user=${targetId}`);
    res.json({ ok: true, user: serializeUser(updated) });
  } catch (err) {
    console.error("[admin] extendTrial error:", err);
    res.status(500).json({ error: "Failed to extend trial." });
  }
});

const revokeTrialSchema = z.object({
  reason: z.string().max(500).optional(),
});

// POST /api/admin/users/:id/revoke-trial
router.post("/users/:id/revoke-trial", requireAdmin, writeLimiter, async (req, res) => {
  const admin = getAdminId(req);
  const { reason } = revokeTrialSchema.parse(req.body ?? {});
  const targetId = req.params.id;

  try {
    const existing = await storage.getUser(targetId);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const prev = { plan: existing.plan, trialEndsAt: existing.trialEndsAt };
    const updated = await storage.setUserPlan(targetId, { plan: "free", grantedByAdminId: admin.id });

    await auditLog(admin.id, targetId, "revoke_trial", prev, { plan: "free" }, { reason: reason ?? null });
    console.log(`[admin] ${admin.email} revoked trial for user=${targetId}`);
    res.json({ ok: true, user: serializeUser(updated) });
  } catch (err) {
    console.error("[admin] revokeTrial error:", err);
    res.status(500).json({ error: "Failed to revoke trial." });
  }
});

// POST /api/admin/users/:id/reset-trial  (clear trial fields, keep plan as free)
router.post("/users/:id/reset-trial", requireAdmin, writeLimiter, async (req, res) => {
  const admin = getAdminId(req);
  const targetId = req.params.id;

  try {
    const existing = await storage.getUser(targetId);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const prev = { plan: existing.plan, hasUsedTrial: existing.hasUsedTrial, trialEndsAt: existing.trialEndsAt };
    const updated = await storage.setUserPlan(targetId, { plan: "free", grantedByAdminId: admin.id, resetHasUsedTrial: true });

    await auditLog(admin.id, targetId, "reset_trial", prev, { plan: "free", hasUsedTrial: false }, {});
    console.log(`[admin] ${admin.email} reset trial for user=${targetId}`);
    res.json({ ok: true, user: serializeUser(updated) });
  } catch (err) {
    console.error("[admin] resetTrial error:", err);
    res.status(500).json({ error: "Failed to reset trial." });
  }
});

const revertPlanSchema = z.object({
  plan: z.enum(["free", "trial", "premium"]),
  reason: z.string().max(500).optional(),
  trialDurationHours: z.number().int().min(1).max(8760).optional(),
});

// POST /api/admin/users/:id/revert-plan
router.post("/users/:id/revert-plan", requireAdmin, writeLimiter, async (req, res) => {
  const admin = getAdminId(req);
  const parsed = revertPlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });

  const { plan, reason, trialDurationHours } = parsed.data;
  const targetId = req.params.id;

  try {
    const existing = await storage.getUser(targetId);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const prev = { plan: existing.plan, isPremium: existing.isPremium };
    const updated = await storage.setUserPlan(targetId, { plan, trialDurationHours, reason, grantedByAdminId: admin.id });

    await auditLog(admin.id, targetId, `revert_plan:${plan}`, prev, { plan: updated.plan, isPremium: updated.isPremium }, { reason: reason ?? null });
    res.json({ ok: true, user: serializeUser(updated) });
  } catch (err) {
    console.error("[admin] revertPlan error:", err);
    res.status(500).json({ error: "Failed to revert plan." });
  }
});

const resetFlagsSchema = z.object({
  onboarding: z.boolean().optional(),
  premiumTour: z.boolean().optional(),
  premiumUnlock: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});

// POST /api/admin/users/:id/reset-flags
router.post("/users/:id/reset-flags", requireAdmin, writeLimiter, async (req, res) => {
  const admin = getAdminId(req);
  const parsed = resetFlagsSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });

  const { onboarding, premiumTour, premiumUnlock, reason } = parsed.data;
  const targetId = req.params.id;

  try {
    const existing = await storage.getUser(targetId);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const prev = {
      hasSeenPremiumTour: existing.hasSeenPremiumTour,
      hasSeenPremiumUnlock: existing.hasSeenPremiumUnlock,
      premiumFirstSeenAt: existing.premiumFirstSeenAt,
    };

    const updated = await storage.resetUserFlags(targetId, {
      onboarding: onboarding ?? false,
      premiumTour: premiumTour ?? false,
      premiumUnlock: premiumUnlock ?? false,
    });

    const resetFlags = [onboarding && "onboarding", premiumTour && "premiumTour", premiumUnlock && "premiumUnlock"].filter(Boolean);
    await auditLog(admin.id, targetId, "reset_flags", prev, { resetFlags }, { reason: reason ?? null });
    console.log(`[admin] ${admin.email} reset flags [${resetFlags}] for user=${targetId}`);
    res.json({ ok: true, user: serializeUser(updated) });
  } catch (err) {
    console.error("[admin] resetFlags error:", err);
    res.status(500).json({ error: "Failed to reset flags." });
  }
});

// ─── Admin Status ────────────────────────────────────────────────────────────

const setAdminSchema = z.object({
  isAdmin: z.boolean(),
});

// PATCH /api/admin/users/:id/admin-status
router.patch("/users/:id/admin-status", requireAdmin, writeLimiter, async (req, res) => {
  const admin = getAdminId(req);
  const parsed = setAdminSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });

  const targetId = req.params.id;
  if (targetId === admin.id && !parsed.data.isAdmin) {
    return res.status(400).json({ error: "You cannot remove your own admin access." });
  }

  try {
    const existing = await storage.getUser(targetId);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const updated = await storage.setUserAdmin(targetId, parsed.data.isAdmin);
    await auditLog(admin.id, targetId, parsed.data.isAdmin ? "grant_admin" : "revoke_admin", { isAdmin: existing.isAdmin }, { isAdmin: updated.isAdmin }, null);

    console.log(`[admin] ${admin.email} set isAdmin=${parsed.data.isAdmin} for user=${targetId}`);
    res.json({ ok: true, user: serializeUser(updated) });
  } catch (err) {
    console.error("[admin] setUserAdmin error:", err);
    res.status(500).json({ error: "Failed to update admin status." });
  }
});

// ─── Delete User ─────────────────────────────────────────────────────────────

const deleteUserSchema = z.object({
  confirm: z.literal(true),
  reason: z.string().max(500).optional(),
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", requireAdmin, writeLimiter, async (req, res) => {
  const admin = getAdminId(req);

  if (req.params.id === admin.id) {
    return res.status(400).json({ error: "You cannot delete your own admin account." });
  }

  const parsed = deleteUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Must confirm deletion with { confirm: true }." });

  const targetId = req.params.id;

  try {
    const existing = await storage.getUser(targetId);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const snapshot = { email: existing.email, plan: existing.plan, isPremium: existing.isPremium, isAdmin: existing.isAdmin };

    // Audit BEFORE deletion — admin logs are preserved (no FK cascade) for the audit trail
    await auditLog(admin.id, targetId, "delete_user", snapshot, null, { reason: parsed.data.reason ?? null });
    console.warn(`[admin] ${admin.email} DELETED user=${targetId} (${existing.email}) reason="${parsed.data.reason ?? ""}"`);

    await storage.deleteUser(targetId);
    res.json({ ok: true, deleted: { id: targetId, ...snapshot } });
  } catch (err) {
    console.error("[admin] deleteUser error:", err);
    res.status(500).json({ error: "Failed to delete user." });
  }
});

// ─── Device Lock Lookup ───────────────────────────────────────────────────────

// GET /api/admin/devices/by-device-id/:deviceId
// Find whichever user has this device ID bound (either bound or last-seen)
router.get("/devices/by-device-id/:deviceId", requireAdmin, readLimiter, async (req, res) => {
  const { deviceId } = req.params;
  try {
    const user = await storage.findUserByBoundDeviceId(deviceId);
    if (!user) return res.status(404).json({ error: "No user found with that device ID bound." });
    res.json({ user: serializeUser(user) });
  } catch (err) {
    console.error("[admin] findUserByBoundDeviceId error:", err);
    res.status(500).json({ error: "Lookup failed." });
  }
});

// ─── Premium Device Reset ─────────────────────────────────────────────────────

// POST /api/admin/users/:id/reset-premium-device
// Clears the premium device binding — used for legitimate hardware changes / support
router.post("/users/:id/reset-premium-device", requireAdmin, writeLimiter, async (req, res) => {
  const admin = getAdminId(req);
  const targetId = req.params.id;

  try {
    const existing = await storage.getUser(targetId);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const previousBound = existing.premiumBoundDeviceId;

    if (!previousBound) {
      return res.json({ ok: true, message: "No device binding to reset.", previousBoundDeviceId: null });
    }

    const updated = await storage.clearPremiumDevice(targetId);

    await auditLog(
      admin.id,
      targetId,
      "reset_premium_device",
      { premiumBoundDeviceId: previousBound },
      { premiumBoundDeviceId: null },
      { adminEmail: admin.email }
    );

    console.log(`[DeviceBinding] Admin reset | admin=${admin.email} | user=${targetId} | cleared=${previousBound}`);
    res.json({
      ok: true,
      userId: targetId,
      previousBoundDeviceId: previousBound,
      premiumBoundDeviceId: updated.premiumBoundDeviceId,
    });
  } catch (err) {
    console.error("[admin] resetPremiumDevice error:", err);
    res.status(500).json({ error: "Failed to reset premium device binding." });
  }
});

// ─── Logs ────────────────────────────────────────────────────────────────────

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

// GET /api/admin/me — quick self-check
router.get("/me", requireAdmin, readLimiter, (req, res) => {
  const adminUser = (req as any).adminUser as User;
  res.json({ ok: true, adminId: adminUser.id, email: adminUser.email });
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────

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

  if (!userId) return res.status(401).json({ error: "Authentication required." });

  const { key } = req.body || {};
  const setupKey = process.env.ADMIN_SETUP_KEY;
  const keyMatches = setupKey && key === setupKey;

  try {
    if (keyMatches) {
      // Privileged bootstrap with setup key — grant regardless of existing admins
      const updated = await storage.setUserAdmin(userId, true);
      console.log(`[admin] Bootstrap (key): user=${userId} (${updated.email}) granted admin`);
      return res.json({ ok: true, message: "Admin access granted.", userId });
    }

    // Non-privileged first-admin bootstrap — atomically check and grant
    const result = await storage.bootstrapFirstAdmin(userId);
    if (!result.granted) {
      return res.status(403).json({ error: "Admin bootstrap disabled — admins already exist." });
    }
    console.log(`[admin] Bootstrap: user=${userId} (${result.user?.email}) granted admin`);
    res.json({ ok: true, message: "Admin access granted.", userId });
  } catch (err) {
    console.error("[admin] bootstrap error:", err);
    res.status(500).json({ error: "Failed to grant admin." });
  }
});

export default router;
