import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { storage } from "../storage";
import { requireAdmin } from "../middleware/requireAdmin";
import { resolveEffectivePlan } from "../lib/planUtils";
import { getStripeClient } from "../stripeClient";
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
    const stripeCustomerId = (req.query.stripeCustomerId as string | undefined)?.trim() || undefined;
    const deviceId = (req.query.deviceId as string | undefined)?.trim() || undefined;
    const hasAppRaw = (req.query.hasInstalledApp as string | undefined);
    const hasInstalledApp = hasAppRaw === "true" ? true : hasAppRaw === "false" ? false : undefined;

    const { users, total } = await storage.listUsers({ limit, offset, search, plan, stripeCustomerId, deviceId, hasInstalledApp });

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
  const { reason } = req.body || {};

  try {
    const existing = await storage.getUser(targetId);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const prev = { plan: existing.plan, hasUsedTrial: existing.hasUsedTrial, trialEndsAt: existing.trialEndsAt };
    const updated = await storage.setUserPlan(targetId, { plan: "free", grantedByAdminId: admin.id, resetHasUsedTrial: true });

    await auditLog(admin.id, targetId, "reset_trial", prev, { plan: "free", hasUsedTrial: false }, { reason: reason ?? null });
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
    return res.status(400).json({ success: false, error: "You cannot delete your own admin account." });
  }

  const parsed = deleteUserSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return res.status(400).json({ success: false, error: first?.message || "Must confirm deletion with { confirm: true, reason }." });
  }

  const targetId = req.params.id;

  try {
    const existing = await storage.getUser(targetId);
    if (!existing) {
      console.warn(`[admin:delete] NOT FOUND — admin=${admin.email} targetId=${targetId}`);
      return res.status(404).json({ success: false, error: "User not found." });
    }

    const snapshot = {
      email:      existing.email,
      plan:       existing.plan,
      isPremium:  existing.isPremium,
      isAdmin:    existing.isAdmin,
      stripeCustomerId: existing.stripeCustomerId ?? null,
    };

    console.warn(
      `[admin:delete] STARTING — ` +
      `admin=${admin.email} (${admin.id}) ` +
      `target=${existing.email ?? "(no email)"} (${targetId}) ` +
      `plan=${existing.plan} isPremium=${existing.isPremium} ` +
      `stripeCustomerId=${existing.stripeCustomerId ?? "none"} ` +
      `reason="${parsed.data.reason}"`,
    );

    // Revoke Stripe subscription if the customer has one — best-effort (never blocks deletion)
    if (existing.stripeCustomerId) {
      try {
        const stripe = getStripeClient();
        if (stripe) {
          const subs = await stripe.subscriptions.list({ customer: existing.stripeCustomerId, status: "active", limit: 10 });
          for (const sub of subs.data) {
            await stripe.subscriptions.cancel(sub.id);
            console.log(`[admin:delete] Cancelled Stripe sub ${sub.id} for customer ${existing.stripeCustomerId}`);
          }
        }
      } catch (stripeErr: any) {
        // Non-fatal — log and continue with DB deletion
        console.error(`[admin:delete] Stripe cleanup failed (non-fatal): ${stripeErr.message}`);
      }
    }

    // Audit BEFORE deletion — the log entry must exist before the user row is gone
    await auditLog(admin.id, targetId, "delete_user", snapshot, null, { reason: parsed.data.reason || "(no reason provided)" });

    // Delete the user and all associated rows (sessions, settings, tweaks, history, etc.)
    await storage.deleteUser(targetId);

    console.warn(
      `[admin:delete] SUCCESS — ` +
      `admin=${admin.email} target=${existing.email ?? targetId}`,
    );

    res.json({ success: true, ok: true, deleted: { id: targetId, ...snapshot } });
  } catch (err: any) {
    console.error(
      `[admin:delete] FAILED — ` +
      `admin=${admin.email} targetId=${targetId} ` +
      `error="${err?.message}" code=${err?.code ?? "none"}\n` +
      (err?.stack ?? ""),
    );

    const userMessage =
      err?.message?.includes("not found") ? "User not found." :
      "Deletion failed — see server logs for details.";

    res.status(500).json({ success: false, error: userMessage });
  }
});

// ─── Batch Delete Users ──────────────────────────────────────────────────────

const batchDeleteSchema = z.object({
  userIds: z.array(z.string()).min(1, "At least one user ID required."),
});

// POST /api/admin/users/batch-delete
router.post("/users/batch-delete", requireAdmin, writeLimiter, async (req, res) => {
  const admin = getAdminId(req);
  const parsed = batchDeleteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message || "Invalid request." });
  }

  const ids = parsed.data.userIds;
  const results: { id: string; status: "deleted" | "skipped" | "error"; error?: string }[] = [];
  let deleted = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of ids) {
    if (userId === admin.id) {
      results.push({ id: userId, status: "skipped", error: "Cannot delete your own account." });
      skipped++; continue;
    }
    try {
      const existing = await storage.getUser(userId);
      if (!existing) {
        results.push({ id: userId, status: "skipped", error: "User not found." });
        skipped++; continue;
      }
      await storage.deleteUser(userId);
      results.push({ id: userId, status: "deleted" });
      deleted++;
    } catch (err: any) {
      console.error(`[admin:batch-delete] FAILED for ${userId}: ${err?.message}`);
      results.push({ id: userId, status: "error", error: err?.message || "Unknown error" });
      failed++;
    }
  }

  res.json({ success: true, deleted, skipped, failed, results });
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
const resetDeviceSchema = z.object({
  reason: z.string().max(500).optional(),
});

router.post("/users/:id/reset-premium-device", requireAdmin, writeLimiter, async (req, res) => {
  const admin = getAdminId(req);
  const targetId = req.params.id;
  const { reason } = resetDeviceSchema.parse(req.body ?? {});

  try {
    const existing = await storage.getUser(targetId);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const previousBound = existing.premiumBoundDeviceId;
    const previousLastSeen = existing.premiumLastSeenDeviceId;

    if (!previousBound) {
      return res.json({ ok: true, message: "No device binding to reset.", previousBoundDeviceId: null });
    }

    const updated = await storage.clearPremiumDevice(targetId);

    await auditLog(
      admin.id,
      targetId,
      "reset_premium_device",
      { premiumBoundDeviceId: previousBound, premiumLastSeenDeviceId: previousLastSeen },
      { premiumBoundDeviceId: null, premiumLastSeenDeviceId: null },
      { adminEmail: admin.email, reason: reason ?? null }
    );

    console.log(`[DeviceBinding] Admin reset | admin=${admin.email} | user=${targetId} | cleared=${previousBound} | reason="${reason ?? ""}"`);
    res.json({
      ok: true,
      userId: targetId,
      previousBoundDeviceId: previousBound,
      previousLastSeenDeviceId: previousLastSeen,
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

// ─── Admin Stats ────────────────────────────────────────────────────

router.get("/stats", requireAdmin, readLimiter, async (req, res) => {
  try {
    const stats = await storage.getAdminStats();
    res.json(stats);
  } catch (err) {
    console.error("[admin] getAdminStats error:", err);
    res.status(500).json({ error: "Failed to fetch admin stats." });
  }
});

// ─── Trials Expiring ──────────────────────────────────────────────

router.get("/trials-expiring", requireAdmin, readLimiter, async (req, res) => {
  const hours = Math.min(168, Math.max(1, parseInt(req.query.hours as string) || 24));
  try {
    const users = await storage.getTrialsExpiring(hours);
    res.json({ users: users.map(serializeUser), hours });
  } catch (err) {
    console.error("[admin] getTrialsExpiring error:", err);
    res.status(500).json({ error: "Failed to fetch expiring trials." });
  }
});

// ─── Stripe Webhook Events ─────────────────────────────────────────

router.get("/stripe-events", requireAdmin, readLimiter, async (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
  try {
    const events = await storage.getStripeWebhookEvents(limit, offset);
    res.json({ events });
  } catch (err) {
    console.error("[admin] getStripeEvents error:", err);
    res.status(500).json({ error: "Failed to fetch Stripe events." });
  }
});

// ─── User Stripe Status (on-demand admin lookup) ──────────────────────────

router.get("/users/:id/stripe-status", requireAdmin, readLimiter, async (req, res) => {
  try {
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    if (!user.stripeCustomerId) {
      return res.json({ userId: user.id, hasStripeCustomer: false, message: "No Stripe customer linked." });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(503).json({ error: "Stripe client not configured." });
    }

    try {
      const customer = await stripe.customers.retrieve(user.stripeCustomerId);
      if (customer.deleted) {
        return res.json({ userId: user.id, customerId: user.stripeCustomerId, status: "deleted" });
      }
      const charges = await stripe.charges.list({ customer: user.stripeCustomerId, limit: 5 });
      return res.json({
        userId: user.id,
        customerId: user.stripeCustomerId,
        status: "active",
        email: (customer as any).email,
        name: (customer as any).name,
        balance: (customer as any).balance,
        currency: (customer as any).currency,
        created: (customer as any).created,
        recentCharges: charges.data.map((c) => ({
          id: c.id,
          amount: c.amount,
          currency: c.currency,
          status: c.status,
          refunded: c.refunded,
          created: c.created,
        })),
      });
    } catch (stripeErr: any) {
      if (stripeErr.statusCode === 404) {
        return res.status(404).json({ error: "Stripe customer not found.", stripeError: stripeErr.message });
      }
      console.error("[admin] Stripe API error:", stripeErr.message);
      return res.status(502).json({ error: "Stripe API error.", message: stripeErr.message });
    }
  } catch (err) {
    console.error("[admin] getStripeStatus error:", err);
    res.status(500).json({ error: "Failed to fetch Stripe status." });
  }
});

// ─── Health Check ────────────────────────────────────────────────────

router.get("/health", requireAdmin, readLimiter, async (req, res) => {
  const checks: Record<string, { ok: boolean; message?: string }> = {};
  let allOk = true;

  // DB connectivity
  try {
    await storage.getAdminStats();
    checks.db = { ok: true };
  } catch (err: any) {
    checks.db = { ok: false, message: err.message };
    allOk = false;
  }

  // Stripe config
  const stripe = getStripeClient();
  checks.stripe = { ok: !!stripe, message: stripe ? "Configured" : "Stripe client not initialized" };
  if (!stripe) allOk = false;

  // Session secret
  const sessionSecret = process.env.SESSION_SECRET;
  checks.sessionSecret = { ok: !!sessionSecret && sessionSecret.length >= 16, message: sessionSecret ? "Set" : "Missing" };
  if (!sessionSecret || sessionSecret.length < 16) allOk = false;

  // JWT secret
  const jwtSecret = process.env.JWT_SECRET;
  checks.jwtSecret = { ok: !!jwtSecret && jwtSecret.length >= 16, message: jwtSecret ? "Set" : "Missing" };
  if (!jwtSecret || jwtSecret.length < 16) allOk = false;

  // Environment
  checks.environment = { ok: true, message: process.env.NODE_ENV || "development" };

  // Data consistency — no premium users without stripeCustomerId
  try {
    const stats = await storage.getAdminStats();
    checks.data = { ok: true, message: `${stats.totalUsers} users, ${stats.premiumUsers} premium` };
  } catch (err: any) {
    checks.data = { ok: false, message: err.message };
    allOk = false;
  }

  res.status(allOk ? 200 : 503).json({ ok: allOk, checks, timestamp: new Date().toISOString() });
});

// ─── Export Users (CSV) ────────────────────────────────────────────────

router.get("/users/export", requireAdmin, readLimiter, async (req, res) => {
  try {
    const plan = (req.query.plan as string | undefined) || undefined;
    const search = (req.query.search as string | undefined)?.trim() || undefined;
    const stripeCustomerId = (req.query.stripeCustomerId as string | undefined) || undefined;
    const deviceId = (req.query.deviceId as string | undefined) || undefined;

    const { users: rows } = await storage.listUsers({ limit: 10000, offset: 0, search, plan, stripeCustomerId, deviceId });

    const headers = ["ID", "Email", "First Name", "Last Name", "Provider", "Plan", "Is Premium", "Stripe Customer ID", "Trial Ends At", "Last Login", "Last Active", "Admin", "Has Installed App", "Created At"];
    const csvRows = [
      headers.join(","),
      ...rows.map((u) => {
        const planLabel = resolveEffectivePlan(u);
        return [
          u.id,
          u.email ?? "",
          u.firstName ?? "",
          u.lastName ?? "",
          u.provider ?? "",
          planLabel,
          u.isPremium ? "yes" : "no",
          u.stripeCustomerId ?? "",
          u.trialEndsAt ? new Date(u.trialEndsAt).toISOString() : "",
          u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : "",
          u.lastAppActiveAt ? new Date(u.lastAppActiveAt).toISOString() : "",
          u.isAdmin ? "yes" : "no",
          u.hasInstalledApp ? "yes" : "no",
          u.createdAt ? new Date(u.createdAt).toISOString() : "",
        ]
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",");
      }),
    ];

    // Audit the export — full user data (emails, Stripe IDs, device IDs) left
    // the system, so it must leave a trace. No single target user, so the entry
    // is self-referential (admin id as target), matching the non-targeted-action pattern.
    const admin = getAdminId(req);
    await auditLog(admin.id, admin.id, "users.export_csv", null, {
      rowCount: rows.length,
      filters: { search: search ?? null, plan: plan ?? null, stripeCustomerId: stripeCustomerId ?? null, deviceId: deviceId ?? null },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="switchcontrol-users-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvRows.join("\n"));
  } catch (err) {
    console.error("[admin] exportUsers error:", err);
    res.status(500).json({ error: "Failed to export users." });
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
      // Privileged bootstrap with setup key — still block if admins already exist.
      // This prevents leaked keys from being used to hijack admin after launch.
      const adminCount = await storage.countAdmins();
      if (adminCount > 0) {
        console.warn(`[AdminBootstrap] blocked key path because ${adminCount} admin(s) already exist | user=${userId}`);
        return res.status(403).json({ error: "Admin bootstrap disabled — admins already exist." });
      }
      const updated = await storage.setUserAdmin(userId, true);
      console.log(`[AdminBootstrap] first admin granted via key | user=${userId} (${updated.email})`);
      return res.json({ ok: true, message: "Admin access granted.", userId });
    }

    // Non-privileged first-admin bootstrap — atomically check and grant
    const result = await storage.bootstrapFirstAdmin(userId);
    if (!result.granted) {
      console.warn(`[AdminBootstrap] rejected first-admin bootstrap — admins already exist | user=${userId}`);
      return res.status(403).json({ error: "Admin bootstrap disabled — admins already exist." });
    }
    console.log(`[AdminBootstrap] first admin granted | user=${userId} (${result.user?.email})`);
    res.json({ ok: true, message: "Admin access granted.", userId });
  } catch (err) {
    console.error("[AdminBootstrap] error:", err);
    res.status(500).json({ error: "Failed to grant admin." });
  }
});

export default router;
