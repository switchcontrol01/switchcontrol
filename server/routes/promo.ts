/**
 * promo.ts — free-user premium promo popup (Discord CTA).
 *
 * POST /api/promo/check-and-increment  (mounted with requireJwt in routes.ts)
 *
 * Called once per app launch by free desktop users. The server owns ALL state
 * (promo_popup_state, keyed by the permanent hardware fingerprint), so the
 * cadence and the lockout survive uninstall / %appdata% deletion / factory
 * reset. The client is a dumb display: it only ever learns { show, discordUrl }
 * — never counters, thresholds, or lockout reasons.
 *
 * Rules:
 *  - Popup fires on every 30th launch (fixed threshold, per product decision),
 *    repeating: 30, 60, 90, ... Dismissing it makes NO server call, so the
 *    counter simply keeps marching toward the next 30th launch.
 *  - Permanent lockout when the device (by fingerprint OR current/legacy
 *    device ID) has ever used a trial or been premium, or the account has
 *    (hasUsedTrial / trial_expired). Lockout is never lifted automatically.
 *  - Premium/trial users are silently skipped (show:false) without counting.
 *  - 2-minute debounce so crash loops / rapid relaunches don't inflate count.
 */

import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { deviceRecords, promoPopupState } from "@shared/schema";
import { and, eq, gte, inArray, or, sql as drizzleSql } from "drizzle-orm";
import { storage } from "../storage";
import { resolveEffectivePlan } from "../lib/planUtils";
import { promoLimiter } from "../middleware/rateLimiter";

const router = Router();

const PROMO_THRESHOLD = 30; // fixed: every 30th launch
const DEBOUNCE_MS = 2 * 60 * 1000;
const FINGERPRINT_REGEX = /^[a-f0-9]{64}$/;
const DEVICE_ID_REGEX = /^[A-F0-9]{16}$/;

const DISCORD_URL =
  process.env.DISCORD_INVITE_URL || "https://discord.com/invite/szJxKbXCJv";

const checkSchema = z.object({
  fingerprint: z.string().regex(FINGERPRINT_REGEX),
});

router.post("/check-and-increment", promoLimiter, async (req, res) => {
  try {
    const cloudUser = req.cloudUser!;
    const parsed = checkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid fingerprint." });
    }
    const { fingerprint } = parsed.data;

    if (!db) return res.json({ show: false });

    const rawDeviceId = req.headers["x-device-id"] as string | undefined;
    const deviceId = rawDeviceId && DEVICE_ID_REGEX.test(rawDeviceId) ? rawDeviceId : null;

    // One-time legacy device-ID migration — this endpoint is the free-user
    // counterpart of premium-validate's migration call, so pre-update installs
    // get their history carried forward on first launch even if they never
    // hit a premium endpoint.
    const rawLegacyId = req.headers["x-legacy-device-id"] as string | undefined;
    const legacyId = rawLegacyId && DEVICE_ID_REGEX.test(rawLegacyId) ? rawLegacyId : null;
    let legacyMigrated = false;
    if (deviceId && legacyId && legacyId !== deviceId) {
      legacyMigrated = await storage.migrateLegacyDeviceId(cloudUser.id, legacyId, deviceId);
    }

    // Fresh plan from the DB — never trust JWT claims for entitlements.
    const user = await storage.getUser(cloudUser.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    const plan = resolveEffectivePlan(user);

    // Premium/trial users never see the promo and never advance a counter.
    if (plan === "premium" || plan === "trial") {
      return res.json({ show: false, legacyMigrated });
    }

    // Get-or-create the per-device state row.
    await db.insert(promoPopupState).values({ deviceFingerprint: fingerprint }).onConflictDoNothing();
    const [row] = await db
      .select()
      .from(promoPopupState)
      .where(eq(promoPopupState.deviceFingerprint, fingerprint))
      .limit(1);
    if (!row) return res.json({ show: false, legacyMigrated });

    if (row.lockedOut) return res.json({ show: false, legacyMigrated });

    // Permanent lockout check — device-level history first (fingerprint OR any
    // known device ID with trial/premium history), then account-level signals.
    const idsToCheck = [deviceId, legacyId].filter((v): v is string => !!v);
    const identityMatch = idsToCheck.length
      ? or(eq(deviceRecords.deviceFingerprint, fingerprint), inArray(deviceRecords.deviceId, idsToCheck))
      : eq(deviceRecords.deviceFingerprint, fingerprint);
    const [history] = await db
      .select({ id: deviceRecords.id })
      .from(deviceRecords)
      .where(and(identityMatch, or(eq(deviceRecords.trialUsed, true), eq(deviceRecords.premiumSeen, true))))
      .limit(1);

    const accountLockout = user.hasUsedTrial === true || plan === "trial_expired";
    if (history || accountLockout) {
      const reason = history ? "trial_used_device" : "trial_used_account";
      await db
        .update(promoPopupState)
        .set({ lockedOut: true, lockedOutReason: reason, updatedAt: new Date() })
        .where(eq(promoPopupState.deviceFingerprint, fingerprint));
      console.log(`[Promo] Locked out permanently | fp=${fingerprint.slice(0, 12)}… | reason=${reason}`);
      return res.json({ show: false, legacyMigrated });
    }

    // Debounce: skip the increment when the row was touched < 2 min ago
    // (crash loops, rapid relaunches). A freshly-created row has
    // updatedAt === createdAt — that first launch must always count.
    const isFreshRow = row.updatedAt.getTime() === row.createdAt.getTime();
    const lastTouch = Math.max(row.updatedAt.getTime(), row.lastShownAt?.getTime() ?? 0);
    if (!isFreshRow && Date.now() - lastTouch < DEBOUNCE_MS) {
      return res.json({ show: false, legacyMigrated });
    }

    // Atomic increment…
    const now = new Date();
    const [updated] = await db
      .update(promoPopupState)
      .set({
        launchCount: drizzleSql`${promoPopupState.launchCount} + 1`,
        updatedAt: now,
      })
      .where(eq(promoPopupState.deviceFingerprint, fingerprint))
      .returning();

    // …then, if the threshold is reached, atomically CLAIM the show (the
    // gte-guarded reset means two racing requests can never both fire).
    if (updated && updated.launchCount >= updated.nextThreshold) {
      const [claimed] = await db
        .update(promoPopupState)
        .set({
          launchCount: 0,
          nextThreshold: PROMO_THRESHOLD,
          lastShownAt: now,
          shownCount: drizzleSql`${promoPopupState.shownCount} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(promoPopupState.deviceFingerprint, fingerprint),
            gte(promoPopupState.launchCount, promoPopupState.nextThreshold),
          ),
        )
        .returning();
      if (claimed) {
        console.log(`[Promo] Showing popup | fp=${fingerprint.slice(0, 12)}… | shownCount=${claimed.shownCount}`);
        return res.json({ show: true, discordUrl: DISCORD_URL, legacyMigrated });
      }
    }

    return res.json({ show: false, legacyMigrated });
  } catch (err) {
    console.error("[Promo] check-and-increment error:", err);
    // Fail silent-closed: the popup is a nice-to-have, never an error surface.
    res.json({ show: false });
  }
});

export default router;
