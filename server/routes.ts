import type { Express } from "express";
import { createServer, type Server } from "http";
import { Readable } from "stream";
import { pool } from "./db";
import { storage } from "./storage";
import { z } from "zod";
import { setupGoogleAuth, requirePremium } from "./auth/google";
import { setupDiscordAuth } from "./auth/discord";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { isPremiumTweakById } from "../shared/tweak-tiers";
import { getTierFromTweakCount, getRandomMessage, getSmartRecommendations, type SystemContext } from "./lib/aiMessages";
import { csrfProtection, generateCsrfToken } from "./middleware/csrf";
import { requireJwt, requireCloudPremium } from "./middleware/requireCloudAuth";
import rateLimit from "express-rate-limit";
import { killSwitchMiddleware } from "./lib/killSwitch";
import { resolveEffectivePlan, isPlanActive, buildEntitlementFeatures } from "./lib/planUtils";
import aiRouter from "./routes/ai";
import biosRouter from "./routes/bios";
import driverIntelRouter from "./routes/driverIntel";
import securityRouter from "./routes/security";
import networkDiagnosticsRouter from "./routes/networkDiagnostics";
import adminRouter from "./routes/admin";
import promoRouter from "./routes/promo";

import networkTweaksRouter from "./routes/networkTweaks";
import tweakIntelligenceRouter from "./routes/tweakIntelligence";
import powerIntelligenceRouter from "./routes/powerIntelligence";
import dashboardIntelligenceRouter from "./routes/dashboardIntelligence";
import startupAppsRouter from "./routes/startupApps";
import debloaterRouter from "./routes/debloater";
import cleanerRouter from "./routes/cleaner";
import { systemIntelligenceRouter } from "./routes/systemIntelligence";
import issueDetectorRouter from "./routes/issueDetector";
import advisorContextRouter from "./routes/advisorContext";
import { getSystemIntelligence, triggerBackgroundCollection } from "./lib/systemIntelligence";
import { getSnapshot, getSystemSpecs, getSchedulerStats } from "./lib/telemetry";
import { broadcastNow, setupWebSocketServer } from "./lib/wsServer";
import { signJwt } from "./lib/jwt";
import { generateDeviceSignature, verifyDeviceSignature } from "./lib/deviceSignature";

const isElectronBackend = process.env.ELECTRON_BACKEND === '1';

// ── Cloud-truth routes must never be served by the embedded local backend ──────
// In packaged Electron the local backend has no Stripe keys, no JWT secret,
// and no session state. All auth / premium / billing / admin / device calls
// must go to the cloud. The fetch interceptor in api.ts already routes them
// there, but we also reject at the local server layer as a defense-in-depth
// hardening measure.
const CLOUD_TRUTH_ROUTE_PREFIXES = [
  "/api/me",
  "/api/auth",
  "/api/premium",
  "/api/stripe",
  "/api/billing",
  "/api/device",
  "/api/admin",
];

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Keep the single-row download control available across deployments that
  // have not run a schema push yet. This is idempotent and does not affect
  // Electron's no-database backend.
  if (pool) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS download_page_settings (
          id VARCHAR(64) PRIMARY KEY DEFAULT 'default',
          enabled BOOLEAN NOT NULL DEFAULT FALSE,
          message TEXT NOT NULL DEFAULT 'We are updating the download service.',
          return_time TEXT,
          updated_by TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    } catch (err) {
      console.error("[DownloadMaintenance] Failed to ensure settings table:", (err as Error).message);
    }
  }

  // Local-backend 409 shield — installed before any route handler.
  if (isElectronBackend) {
    app.use((req, res, next) => {
      const path = req.path;
      const isCloudTruth = CLOUD_TRUTH_ROUTE_PREFIXES.some(
        prefix => path === prefix || path.startsWith(prefix + "/")
      );
      if (isCloudTruth) {
        console.log(`[LocalRouteBlocked] path=${path} reason=cloud_route_required backend=local`);
        return res.status(409).json({
          error: "cloud_route_required",
          message: "This route must be called against the cloud server, not the local backend.",
          cloudUrl: "https://switchcontrol.org" + path,
        });
      }
      next();
    });
  }

  setupGoogleAuth(app);
  setupDiscordAuth(app);

  app.use("/api/ai", requireJwt, requireCloudPremium, aiRouter);
  // Free-user premium promo popup (Discord CTA) — requireJwt only: it must be
  // reachable by free users, and the server re-resolves the plan from the DB.
  app.use("/api/promo", requireJwt, promoRouter);
  app.use("/api/bios", killSwitchMiddleware("bios"), requireJwt, requireCloudPremium, biosRouter);
  app.use("/api/driver-intel", driverIntelRouter);
  app.use("/api/security", killSwitchMiddleware("security"), securityRouter);
  app.use("/api/network", killSwitchMiddleware("network_diag"), requireJwt, (req, res, next) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
      return csrfProtection(req, res, next);
    }
    next();
  }, networkDiagnosticsRouter);
  app.use("/api/admin", (req, res, next) => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      return csrfProtection(req, res, next);
    }
    next();
  }, adminRouter);

  // Public read endpoint: no auth is required so visitors can be told about
  // maintenance even when the download service itself is unavailable.
  app.get("/api/download/maintenance", async (_req, res) => {
    try {
      const settings = await storage.getDownloadPageSettings();
      res.json({
        enabled: settings.enabled === true,
        message: settings.message,
        returnTime: settings.returnTime,
        updatedAt: settings.updatedAt,
      });
    } catch (err) {
      // The download page treats this as normal operation. A status read
      // failure must never take down the public page or falsely block users.
      console.error("[DownloadMaintenance] Public status read failed:", (err as Error).message);
      res.status(503).json({ error: "Maintenance status unavailable." });
    }
  });

  app.use("/api/network-tweaks", requireJwt, requireCloudPremium, networkTweaksRouter);
  app.use("/api/tweak-intelligence", requireJwt, tweakIntelligenceRouter);
  app.use("/api/power-intelligence", powerIntelligenceRouter);
  app.use("/api/dashboard-intelligence", requireJwt, dashboardIntelligenceRouter);
  // Startup scans/history are user-scoped and must never be publicly readable.
  app.use("/api/startup", (req, res, next) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
      return csrfProtection(req, res, next);
    }
    next();
  }, startupAppsRouter);
  app.use("/api/debloat", (req, res, next) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
      return requireJwt(req, res, (authError?: any) => {
        if (authError) return next(authError);
        return csrfProtection(req, res, next);
      });
    }
    next();
  }, debloaterRouter);
  app.use("/api/cleaner", killSwitchMiddleware("cleaner"), requireJwt, cleanerRouter);
  app.use("/api/system-intelligence", systemIntelligenceRouter);
  app.use("/api/issues", issueDetectorRouter);
  app.use("/api/ai-advisor", requireJwt, advisorContextRouter);

  // ── Updater gate — called by the Electron auto-updater before hitting R2 ────
  // This is the only server touchpoint in the update flow; gating it with
  // killSwitchMiddleware("updater") gives an instant, no-redeploy kill switch
  // if a bad build ships or the CDN needs to be drained. Auth-free by design:
  // the Electron updater runs before the user logs in.
  app.get("/api/updates/enabled", killSwitchMiddleware("updater"), (_req, res) => {
    res.json({ enabled: true });
  });

  // Deep system intelligence is triggered by the authenticated dashboard
  // request, not by an unauthenticated startup timer. This avoids making every
  // server restart spawn an expensive WMI/PowerShell collection.

  // Cloud connectivity probe — used by packaged Electron to verify JWT auth without an OpenAI call
  app.post("/api/ai/cloud-probe", requireJwt, requireCloudPremium, (req, res) => {
    const cloudUser = (req as any).cloudUser as { id: string; isPremium: boolean; email: string | null };
    const hasOpenAiKey = !!process.env.OPENAI_API_KEY;
    return res.json({
      ok: true,
      userId: cloudUser.id,
      isPremium: cloudUser.isPremium,
      openAiReady: hasOpenAiKey,
      timestamp: new Date().toISOString(),
      message: "Cloud AI backend reachable. JWT verified. Premium confirmed.",
    });
  });

  app.get("/api/health", async (_req, res) => {
    const uptime = process.uptime();
    let dbReachable = false;
    try {
      if (pool) {
        await pool.query("SELECT 1");
        dbReachable = true;
      }
    } catch {
      dbReachable = false;
    }
    res.json({
      status: "ok",
      version: process.env.npm_package_version || "unknown",
      uptime: Math.floor(uptime),
      dbReachable,
      timestamp: Date.now(),
    });
  });

  // Entitlements — structured per-feature breakdown derived from the user's plan.
  // Server is the authoritative source; the client caches this for offline use.
  // Deleting %AppData% and logging in will always restore premium via this endpoint.
  app.get("/api/account/entitlements", requireJwt, async (req, res) => {
    try {
      const userId = req.cloudUser!.id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const plan = resolveEffectivePlan(user);
      const features = buildEntitlementFeatures(plan);
      return res.json({
        premium:  isPlanActive(plan),
        tier:     plan,
        trial:    plan === "trial",
        expires:  user.trialEndsAt ? user.trialEndsAt.toISOString() : null,
        features,
      });
    } catch (e) {
      console.error("[Entitlements] Failed to fetch:", (e as Error).message);
      return res.status(500).json({ error: "Failed to fetch entitlements" });
    }
  });

  // JWT reissue — Electron clients call this against the cloud server when their
  // local JWT has expired. The cloud server authenticates via the persisted session
  // cookie (Passport) and issues a fresh JWT the Electron local backend can verify.
  app.post("/api/auth/reissue-jwt", async (req, res) => {
    // Uses the module-level isElectronBackend const — no local redeclaration needed.
    if (isElectronBackend) {
      return res.status(404).json({ error: 'Not available on local backend' });
    }
    if (!(req as any).isAuthenticated?.() || !(req as any).user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const sessionUser = (req as any).user as { id: string };
    if (!sessionUser?.id) {
      return res.status(401).json({ error: 'Invalid session user' });
    }
    const newJwt = signJwt(sessionUser.id);
    console.log(`[Auth] JWT reissued via session for user ${sessionUser.id}`);
    return res.json({ success: true, jwt: newJwt });
  });

  app.get("/api/csrf-token", (req, res) => {
    const token = req.cookies?._csrf || generateCsrfToken();
    if (!req.cookies?._csrf) {
      // Uses the module-level isElectronBackend const — no local redeclaration needed.
      res.cookie("_csrf", token, {
        httpOnly: false,
        secure: !isElectronBackend,
        sameSite: isElectronBackend ? ("lax" as const) : ("none" as const),
        maxAge: 24 * 60 * 60 * 1000
      });
    }
    res.json({ token });
  });

  app.get("/api/settings", requireJwt, async (req, res) => {
    try {
      const userId = req.cloudUser!.id;
      const settings = await storage.getOrCreateSettings(userId);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/settings", requireJwt, csrfProtection, async (req, res) => {
    try {
      const userId = req.cloudUser!.id;
      const settings = await storage.getOrCreateSettings(userId);
      // Strip server-managed fields before passing the body to the DB.
      // tweaksApplied/servicesDisabled/cleanersRun/startupAppsDisabled are
      // maintained exclusively by server-side routes — a client sending these
      // could inflate their own tweak count and unlock higher ai-scan tiers
      // (getTierFromTweakCount reads tweaksApplied directly).
      const {
        tweaksApplied: _ta,
        servicesDisabled: _sd,
        cleanersRun: _cr,
        startupAppsDisabled: _sad,
        lastScan: _ls,
        id: _id,
        userId: _uid,
        ...safeBody
      } = req.body ?? {};
      const updated = await storage.updateSettings(settings.id, safeBody);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.get("/api/tweaks", requireJwt, async (req, res) => {
    try {
      const userId = req.cloudUser!.id;
      const settings = await storage.getOrCreateSettings(userId);
      const tweaks = await storage.getTweaks(settings.id);
      const tweaksMap: Record<string, boolean> = {};
      tweaks.forEach(t => { tweaksMap[t.tweakId] = t.enabled; });
      res.json(tweaksMap);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tweaks" });
    }
  });

  app.post("/api/tweaks/:tweakId", requireJwt, csrfProtection, async (req, res) => {
    try {
      const tweakId = req.params.tweakId as string;
      const { enabled, tweakTitle } = req.body;
      const cloudUser = req.cloudUser!;

      // Server-side premium enforcement for premium tweaks (uses canonical server-side lookup)
      if (enabled && isPremiumTweakById(tweakId)) {
        if (!cloudUser.isPremium) {
          return res.status(403).json({ 
            error: "premium_required",
            message: "Premium subscription required for this tweak",
            upgradeUrl: "/pricing"
          });
        }
      }
      
      const settings = await storage.getOrCreateSettings(cloudUser.id);
      const tweak = await storage.setTweak(settings.id, String(tweakId), enabled);

      // Recount from the DB rather than doing read-then-arithmetic on
      // settings.tweaksApplied. The stale-read pattern (read count → ±1 → write)
      // loses updates under concurrent toggles (double-click, retry-on-timeout,
      // multiple tabs). The applied_tweaks table is the source of truth.
      const allTweaks = await storage.getTweaks(settings.id);
      const enabledCount = allTweaks.filter(t => t.enabled).length;
      await storage.updateSettings(settings.id, {
        tweaksApplied: enabledCount,
        lastScan: new Date()
      });
      
      await storage.addHistory({
        settingsId: settings.id,
        action: `${enabled ? 'Enabled' : 'Disabled'} ${tweakTitle || tweakId}`,
        page: 'Tweaks',
        result: 'Applied',
      });
      
      res.json(tweak);
    } catch (error) {
      res.status(500).json({ error: "Failed to update tweak" });
    }
  });

  app.post("/api/tweaks/reset", requireJwt, csrfProtection, async (req, res) => {
    try {
      const userId = req.cloudUser!.id;
      const settings = await storage.getOrCreateSettings(userId);
      await storage.resetTweaks(settings.id);
      await storage.updateSettings(settings.id, { 
        tweaksApplied: 0,
        lastScan: new Date()
      });
      await storage.addHistory({
        settingsId: settings.id,
        action: 'Reset all tweaks',
        page: 'Tweaks',
        result: 'All tweaks disabled',
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset tweaks" });
    }
  });


  app.get("/api/history", requireJwt, async (req, res) => {
    try {
      const userId = req.cloudUser!.id;
      const settings = await storage.getOrCreateSettings(userId);
      const history = await storage.getHistory(settings.id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.delete("/api/history", requireJwt, csrfProtection, async (req, res) => {
    try {
      const userId = req.cloudUser!.id;
      const settings = await storage.getOrCreateSettings(userId);
      await storage.clearHistory(settings.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear history" });
    }
  });

  app.post("/api/history", requireJwt, csrfProtection, async (req, res) => {
    try {
      const userId = req.cloudUser!.id;
      const settings = await storage.getOrCreateSettings(userId);
      // Destructure only the fields addHistory expects — spreading req.body
      // passes unvalidated client data straight to the DB insert. settingsId
      // is always sourced from the authenticated session, never from the client.
      const { action, page, result, notes } = req.body ?? {};
      const entry = await storage.addHistory({
        settingsId: settings.id,
        action:  typeof action  === "string" ? action  : "",
        page:    typeof page    === "string" ? page    : "",
        result:  typeof result  === "string" ? result  : "",
        notes:   typeof notes   === "string" ? notes   : undefined,
      });
      res.json(entry);
    } catch (error) {
      res.status(500).json({ error: "Failed to add history entry" });
    }
  });

  app.get("/api/ai-scan", requireJwt, async (req, res) => {
    try {
      const userId = req.cloudUser!.id;
      const settings = await storage.getOrCreateSettings(userId);
      const scan = await storage.getLatestAIScan(settings.id);
      res.json(scan || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch AI scan" });
    }
  });

  // Schema for AI scan request body
  const aiScanBodySchema = z.object({
    gpuVendor: z.string().optional(),
    hasSsd: z.boolean().optional(),
    cpuCores: z.number().optional(),
    ramGb: z.number().optional()
  }).optional();

  // Premium-only: AI Scan with cooldown and dynamic messages
  app.post("/api/ai-scan", requireJwt, csrfProtection, async (req, res) => {
    try {
      const cloudUser = req.cloudUser!;
      if (!cloudUser.isPremium) {
        return res.status(403).json({
          error: "premium_required",
          message: "Premium subscription required for AI scans",
          upgradeUrl: "/pricing"
        });
      }
      const settings = await storage.getOrCreateSettings(cloudUser.id);
      
      // Cooldown check - 60 seconds between AI scans (using latest AI scan timestamp)
      const latestAIScan = await storage.getLatestAIScan(settings.id);
      if (latestAIScan?.timestamp) {
        const cooldownMs = 60 * 1000; // 60 seconds
        const timeSinceLastScan = Date.now() - new Date(latestAIScan.timestamp).getTime();
        if (timeSinceLastScan < cooldownMs) {
          const remainingSeconds = Math.ceil((cooldownMs - timeSinceLastScan) / 1000);
          return res.status(429).json({ 
            error: "cooldown", 
            message: `Please wait ${remainingSeconds} seconds before running another AI scan.`,
            remainingSeconds
          });
        }
      }
      
      // Get dynamic tier based on tweaks applied
      const tweaksApplied = settings.tweaksApplied ?? 0;
      const tier = getTierFromTweakCount(tweaksApplied);
      
      // Parse and validate request body with defaults
      const parsedBody = aiScanBodySchema.safeParse(req.body);
      const bodyData = parsedBody.success ? (parsedBody.data || {}) : {};
      const { gpuVendor, hasSsd, cpuCores, ramGb } = bodyData;
      
      const systemContext: SystemContext = {
        hasNvidiaGpu: gpuVendor?.toLowerCase().includes('nvidia'),
        hasAmdGpu: gpuVendor?.toLowerCase().includes('amd'),
        hasSsd: hasSsd ?? true,
        cpuCores: cpuCores,
        ramGb: ramGb,
        tweaksApplied
      };
      
      // Generate dynamic message and smart recommendations based on system
      const message = getRandomMessage(tier);
      const recommendations = getSmartRecommendations(tier, systemContext, 3);
      
      // Always persist scan and history
      const scan = await storage.addAIScan({
        settingsId: settings.id,
        summary: message,
        recommendations,
      });
      
      await storage.addHistory({
        settingsId: settings.id,
        action: 'AI Scan',
        page: 'Dashboard',
        result: tier === "optimized" ? 'System optimized' : 'Scan complete',
        notes: tier === "optimized" 
          ? 'No further optimizations needed' 
          : `Generated ${recommendations.length} recommendations (${tier} tier)`,
      });
      
      res.json({ 
        ...scan, 
        tier, 
        optimized: tier === "optimized"
      });
    } catch (error) {
      console.error("AI scan error:", error);
      res.status(500).json({ error: "Failed to run AI scan" });
    }
  });

  // Force an immediate RAM refresh and WebSocket broadcast — called after memory clean
  app.post("/api/telemetry/force-refresh", requireJwt, async (_req, res) => {
    try {
      await broadcastNow();
      res.json({ ok: true });
    } catch (e: any) {
      res.json({ ok: false, error: e?.message });
    }
  });

  app.get("/api/telemetry", requireJwt, async (req, res) => {
    try {
      const snap = await getSnapshot();
      res.json({
        ts: snap.ts,
        status: snap.status,
        cpu: snap.cpu,
        ram: snap.ram,
        network: snap.network,
        temps: snap.temps,
        gpu: snap.gpu,
        // processes intentionally omitted — full process list is not required
        // by any client view and would expose enumerated process names to any
        // valid JWT holder. Strip here; gate behind premium if needed later.
        load_trend: snap.load_trend,
      });
    } catch (error) {
      console.error("Telemetry error:", error);
      res.status(500).json({ error: "Failed to fetch telemetry" });
    }
  });

  app.get("/api/debug/scheduler", requireJwt, (req, res) => {
    res.json(getSchedulerStats());
  });

  app.get("/api/specs", requireJwt, async (req, res) => {
    try {
      const specs = await getSystemSpecs();
      res.json(specs);
    } catch (error) {
      console.error("Specs error:", error);
      res.status(500).json({ error: "Failed to fetch system specs" });
    }
  });

  app.post("/api/metrics/snapshot", requireJwt, csrfProtection, async (req, res) => {
    try {
      const snap = await getSnapshot();
      res.json(snap);
    } catch (error) {
      res.status(500).json({ error: "Failed to capture snapshot" });
    }
  });

  // Telemetry is demand-driven. The WebSocket connection starts the server
  // scheduler when a live consumer exists; REST reads use getSnapshot()'s
  // deduplicated one-shot refresh when the scheduler is idle. Do not start a
  // process-wide poller here: static pages must not keep hardware probes alive.
  setupWebSocketServer(httpServer);

  app.post("/api/clear-ram", requireJwt, csrfProtection, async (req, res) => {
    try {
      const userId = req.cloudUser!.id;
      const settings = await storage.getOrCreateSettings(userId);

      // This endpoint records that the user triggered the RAM cleaner.
      // Real memory clearing only happens in the Electron desktop app via
      // the System Cleaner IPC path. The web dashboard shows a simulated
      // result for UI feedback but does not claim fabricated freed amounts.
      await storage.updateSettings(settings.id, {
        cleanersRun: (settings.cleanersRun || 0) + 1,
        lastScan: new Date()
      });

      await storage.addHistory({
        settingsId: settings.id,
        action: 'Clear RAM',
        page: 'Dashboard',
        result: 'Cleaner triggered',
      });

      res.json({ ok: true, cleanersRun: (settings.cleanersRun || 0) + 1 });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear RAM" });
    }
  });

  app.get("/api/stripe/publishable-key", async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      res.status(500).json({ error: "Failed to get Stripe key" });
    }
  });

  // Rate limited: max 10 checkout session creations per user per hour.
  // Raised from 5 → 10: a legitimate user retrying after transient Stripe errors
  // could exhaust 5 in a single frustrated session; 10 keeps abuse protection while
  // giving real purchasers enough headroom. keyGenerator is per-authenticated-user
  // (req.cloudUser.id) so different users cannot affect each other's counters.
  const stripeCheckoutLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
    keyGenerator: (req: any) => req.cloudUser?.id || req.user?.id || req.ip || 'unknown',
    message: { error: "Checkout rate limit reached. Please try again later." },
  });

  app.post("/api/stripe/create-checkout-session", requireJwt, stripeCheckoutLimiter, async (req, res) => {
    try {
      const user = req.cloudUser || (req as any).user;
      if (!user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const dbUser = await storage.getUser(user.id);
      if (!dbUser) {
        return res.status(404).json({ error: "User not found" });
      }

      if (resolveEffectivePlan(dbUser) !== 'free') {
        console.log(`[Stripe] Checkout blocked — user ${dbUser.id} already has an active plan`);
        return res.status(400).json({ error: "already_premium" });
      }

      // Verify the secret key is present before making any API call
      if (!process.env.STRIPE_SECRET_KEY) {
        console.error("[Stripe] STRIPE_SECRET_KEY is not set — cannot create checkout session");
        return res.status(500).json({ error: "Payment system not configured. Contact support." });
      }

      const stripe = await getUncachableStripeClient();
      const isProduction = process.env.NODE_ENV === "production";
      const productionDomain = "https://switchcontrol.org";
      const domains = process.env.REPLIT_DOMAINS?.split(',') || [];
      const devDomain = domains.find(d => d.endsWith('.replit.app')) || domains[0];
      const baseUrl = isProduction ? productionDomain : `https://${devDomain}`;

      const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;

      if (!priceId) {
        console.error("[Stripe] STRIPE_PREMIUM_PRICE_ID not configured — cannot create checkout session");
        return res.status(500).json({ error: "Billing not configured. Contact support." });
      }

      // Always resolve a Stripe customer ID so the webhook can fall back to it if needed.
      let customerId = dbUser.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: dbUser.email || undefined,
          metadata: { userId: dbUser.id },
        });
        customerId = customer.id;
        await storage.updateUserStripeInfo(dbUser.id, { stripeCustomerId: customerId });
        console.log(`[Stripe] Created Stripe customer ${customerId} for user ${dbUser.id}`);
      }

      const sessionConfig: any = {
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1,
        }],
        mode: 'payment',
        allow_promotion_codes: true,
        success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing`,
        client_reference_id: dbUser.id,
        metadata: {
          userId: dbUser.id,
          email: dbUser.email || '',
        },
      };

      console.log(`[Stripe] Creating checkout session — userId=${dbUser.id} customerId=${customerId} priceId=${priceId} baseUrl=${baseUrl}`);
      const session = await stripe.checkout.sessions.create(sessionConfig);
      console.log(`[Stripe] Checkout session created: ${session.id} for userId=${dbUser.id}`);

      res.json({ url: session.url });
    } catch (error: any) {
      // Surface the actual Stripe error code and type for diagnosis
      const stripeCode = error?.code;
      const stripeType = error?.type;
      const stripeStatus = error?.statusCode;
      console.error(
        `[Stripe] Checkout session creation failed — type=${stripeType} code=${stripeCode} status=${stripeStatus} message=${error.message}`
      );

      // Map known Stripe error codes to actionable user messages
      let userMessage = "Failed to create checkout session. Please try again.";
      if (stripeCode === 'api_key_expired' || stripeCode === 'invalid_api_key' || stripeType === 'StripeAuthenticationError') {
        userMessage = "Payment system key is invalid or expired. Please contact support.";
        console.error("[Stripe] ⚠️  CRITICAL: API key is invalid or expired — regenerate STRIPE_SECRET_KEY in the Stripe dashboard.");
      } else if (stripeCode === 'resource_missing') {
        userMessage = "The selected price plan could not be found. Please contact support.";
        console.error(`[Stripe] ⚠️  Price ID not found: ${process.env.STRIPE_PREMIUM_PRICE_ID} — verify it exists in the Stripe dashboard and matches the key mode (test vs live).`);
      }

      res.status(500).json({ error: userMessage, _stripe_code: stripeCode, _stripe_type: stripeType });
    }
  });

  // Read-only payment status check — used by the success page to show the correct state.
  // This route NEVER grants premium. Premium is exclusively granted by the Stripe webhook.
  // Rate limited: max 10 per minute per authenticated user to prevent session probing.
  const stripeConfirmLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
    keyGenerator: (req: any) => req.cloudUser?.id || req.ip || 'unknown',
    message: { error: "Too many verification attempts. Please wait a minute." },
  });

  app.post("/api/stripe/confirm", requireJwt, stripeConfirmLimiter, async (req, res) => {
    try {
      const { session_id } = req.body;
      if (!session_id || typeof session_id !== 'string') {
        return res.status(400).json({ ok: false, error: "session_id required" });
      }

      const cloudUser = req.cloudUser!;
      console.log(`[AuthRoute] /api/stripe/confirm called userId=${cloudUser.id}`);

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(session_id);

      if (session.payment_status !== 'paid') {
        console.log(`[Stripe] /confirm — session ${session_id} not paid yet (status=${session.payment_status})`);
        return res.status(400).json({ ok: false, error: "not_paid" });
      }

      // Verify the session belongs to the authenticated user.
      // checkoutUserId is pulled from the Stripe API session object, NOT from the body.
      const checkoutUserId = session.client_reference_id || session.metadata?.userId;

      if (!checkoutUserId) {
        console.error(`[Stripe] /confirm — session ${session_id} has no user mapping`);
        return res.status(400).json({ ok: false, error: "missing_user_mapping" });
      }

      // Hard trust: the authenticated user MUST match the checkout session owner.
      if (cloudUser.id !== checkoutUserId) {
        console.error(`[Stripe] /confirm — user mismatch: authenticated=${cloudUser.id}, session was for ${checkoutUserId}`);
        return res.status(403).json({ ok: false, error: "user_mismatch" });
      }

      // Look up current premium status from DB.
      const dbUser = await storage.getUser(checkoutUserId);
      if (!dbUser) {
        return res.status(404).json({ ok: false, error: "user_not_found" });
      }

      // If the webhook has already fired and set isPremium, we're done.
      if (dbUser.isPremium) {
        console.log(`[Stripe] /confirm — session ${session_id} already premium userId=${checkoutUserId} (webhook fired first)`);
        return res.json({ ok: true, isPremium: true, waitingForWebhook: false, userId: checkoutUserId });
      }

      // Webhook has not fired yet (or was never delivered). Since we have already
      // verified payment_status==='paid' via the Stripe API (not user input) AND
      // confirmed the session belongs to this user, it is safe to write premium
      // directly here as a webhook fallback. The webhook handler uses idempotency
      // protection so a late-arriving webhook will be a no-op.
      console.log(`[Stripe] /confirm — session ${session_id} paid but webhook not yet received for userId=${checkoutUserId}. Writing premium directly as fallback.`);

      await storage.setUserPlan(checkoutUserId, { plan: 'premium' });
      console.log(`[Stripe] /confirm — premium activated (fallback) for userId=${checkoutUserId}`);

      res.json({ ok: true, isPremium: true, waitingForWebhook: false, userId: checkoutUserId });
    } catch (error: any) {
      console.error("[Stripe] /confirm error:", error.message);
      res.status(500).json({ ok: false, error: "Failed to check payment status." });
    }
  });

  app.get("/api/stripe/session", requireJwt, async (req, res) => {
    try {
      const { session_id } = req.query;
      if (!session_id || typeof session_id !== 'string') {
        return res.status(400).json({ error: "session_id is required" });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(session_id);

      // Verify the authenticated user owns this checkout session.
      // client_reference_id is set to the user's DB ID when the session is created.
      // Fail-closed: deny if no ownership mapping is present on the session.
      const sessionUserId = session.client_reference_id || session.metadata?.userId;
      if (!sessionUserId) {
        console.warn(`[Stripe] /session — no owner mapping on session ${session_id}`);
        return res.status(403).json({ error: "Access denied." });
      }
      if (req.cloudUser!.id !== sessionUserId) {
        console.warn(`[Stripe] /session — ownership mismatch | authed=${req.cloudUser!.id} session_owner=${sessionUserId}`);
        return res.status(403).json({ error: "Access denied." });
      }

      res.json({
        id: session.id,
        payment_status: session.payment_status,
        status: session.status,
        customer_email: session.customer_details?.email,
        amount_total: session.amount_total,
        currency: session.currency,
      });
    } catch (error: any) {
      console.error("Session retrieval error:", error);
      res.status(500).json({ error: error.message || "Failed to retrieve session" });
    }
  });

  // Activity ping — called by Electron app periodically.
  // Batched: DB write fires at most once per 5 minutes per user to avoid
  // high-frequency UPDATE churn when 1000s of users ping every 60 s.
  const activityWriteLastAt = new Map<string, number>();
  const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  app.post("/api/activity/ping", requireJwt, async (req, res) => {
    try {
      const cloudUser = req.cloudUser!;
      const now = Date.now();
      const last = activityWriteLastAt.get(cloudUser.id) ?? 0;
      if (now - last >= ACTIVITY_WRITE_INTERVAL_MS) {
        activityWriteLastAt.set(cloudUser.id, now);
        // Fire-and-forget — don't await to keep latency low.
        storage.updateUserActivity(cloudUser.id, { lastAppActiveAt: new Date() }).catch(() => {});
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Activity update failed." });
    }
  });

  // App-active — called by Electron app on launch / app-ready
  // Sets hasInstalledApp=true and lastAppActiveAt, fire-and-forget friendly
  app.post("/api/activity/app-active", requireJwt, async (req, res) => {
    try {
      const cloudUser = req.cloudUser!;
      await storage.updateUserActivity(cloudUser.id, {
        lastAppActiveAt: new Date(),
        hasInstalledApp: true,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Activity update failed." });
    }
  });

  // ─── Premium Device Binding ──────────────────────────────────────────────────
  //
  // POST /api/device/premium-validate
  //
  // Called by the Electron desktop app at startup after authentication.
  // Sends the stable device ID via x-device-id header.
  //
  // Logic:
  //   - Effective plan != 'premium' → { status: 'not_premium' }  (trial = user-scoped, no device lock)
  //   - No bound device yet          → bind this device, { status: 'ok', isFirstBind: true }
  //   - Device matches bound         → update lastSeen, { status: 'ok' }
  //   - Device differs, binding stale (>30 days unseen) → rebind, { status: 'ok' }
  //   - Device differs, binding active → { status: 'locked' }
  //
  // NOTE: uses requireJwt only (not requireCloudPremium) so the validation call
  //       itself is never blocked by the device lock it is trying to evaluate.
  // NOTE: always reads a fresh user from the DB — never trusts stale JWT claims
  //       for isPremium, since admin plan changes don't invalidate in-flight tokens.
  app.post("/api/device/premium-validate", requireJwt, async (req, res) => {
    try {
      const cloudUser = req.cloudUser!;
      const deviceId = req.headers["x-device-id"] as string | undefined;
      const clientSignature = req.headers["x-device-signature"] as string | undefined;
      const appVersion = (req.headers["x-app-version"] as string | undefined)?.slice(0, 64);
      const platform = (req.headers["x-platform"] as string | undefined)?.slice(0, 32);
      // Permanent hardware fingerprint (64-char SHA-256 hex) — recorded on device
      // rows so trial/premium history survives app reinstalls. Optional header.
      const rawFingerprint = req.headers["x-device-fingerprint"] as string | undefined;
      const fingerprint = rawFingerprint && /^[a-f0-9]{64}$/.test(rawFingerprint) ? rawFingerprint : null;
      const deviceMeta = { appVersion, platform, fingerprint };

      if (!deviceId) {
        return res.status(400).json({ error: "Missing x-device-id header.", code: "missing_device_id" });
      }

      // One-time legacy device-ID migration (pre-permanent-fingerprint installs).
      // MUST run BEFORE the user fetch below so a re-pointed premiumBoundDeviceId
      // is already visible to the lock check — otherwise every migrated premium
      // user would trip the device lock on their first post-update launch.
      const rawLegacyId = req.headers["x-legacy-device-id"] as string | undefined;
      let legacyMigrated = false;
      if (rawLegacyId && /^[A-F0-9]{16}$/.test(rawLegacyId) && rawLegacyId !== deviceId) {
        legacyMigrated = await storage.migrateLegacyDeviceId(cloudUser.id, rawLegacyId, deviceId);
      }

      // Always fetch a fresh user record — the JWT-cached isPremium field can be stale
      // if the admin changed the plan after the token was issued (e.g. premium → trial).
      const user = await storage.getUser(cloudUser.id);
      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }

      const effectivePlan = resolveEffectivePlan(user);

      // Always record the last-seen device + meta so admins can see device info for
      // every user (free, trial, premium). The actual binding/locking logic is premium-only.
      await storage.updateDeviceLastSeen(cloudUser.id, deviceId, deviceMeta);

      // Device locking is a PREMIUM-only feature. Trial access is user-scoped, not
      // device-scoped. Returning not_premium here lets the client proceed without
      // showing the DeviceLockModal regardless of any previously-bound device ID.
      if (effectivePlan !== "premium") {
        console.log(`[DeviceBinding] Skip-lock | user=${cloudUser.id} | plan=${effectivePlan} | device=${deviceId} | recorded=lastSeen`);
        return res.json({ status: "not_premium", legacyMigrated });
      }

      if (!user.premiumBoundDeviceId) {
        // First premium activation — bind the presenting device and generate HMAC signature
        const signature = generateDeviceSignature(cloudUser.id, deviceId);
        await storage.bindPremiumDevice(cloudUser.id, deviceId, signature, deviceMeta);
        console.log(`[DeviceBinding] Assigned | user=${cloudUser.id} | device=${deviceId} | sig=${signature.substring(0, 8)}... | appVersion=${appVersion ?? "?"} | platform=${platform ?? "?"}`);
        return res.json({ status: "ok", isFirstBind: true, deviceSignature: signature, legacyMigrated });
      }

      if (user.premiumBoundDeviceId === deviceId) {
        // Correct device. A wiped local device-signature.json means the client
        // cannot authenticate subsequent protected requests. Reissue the
        // deterministic signature only after the device ID has matched the
        // stored premium binding; never use a missing signature to establish a
        // new binding or bypass the active-device lock.
        if (!clientSignature || !user.deviceSignature) {
          const signature = generateDeviceSignature(cloudUser.id, deviceId);
          await storage.updatePremiumDeviceSignature(cloudUser.id, signature);
          console.log(`[DeviceBinding] Signature repaired | user=${cloudUser.id} | device=${deviceId} | sig=${signature.substring(0, 8)}...`);
          return res.json({ status: "ok", isFirstBind: false, deviceSignature: signature, signatureRepaired: true, legacyMigrated });
        }
        // Correct device — already updated above
        console.log(`[DeviceBinding] Valid | user=${cloudUser.id} | device=${deviceId}`);
        return res.json({ status: "ok", isFirstBind: false, legacyMigrated });
      }

      // Device mismatch — check whether the binding has gone stale (device unseen for >30 days).
      // A stale binding can happen after a hardware change; allow automatic rebind rather than
      // permanently locking the user out without admin intervention.
      const STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
      const lastSeen = user.premiumDeviceLastSeenAt ?? user.premiumBoundAt;
      const isStale = !lastSeen || Date.now() - new Date(lastSeen).getTime() > STALE_MS;

      if (isStale) {
        // Rebind with fresh signature
        const signature = generateDeviceSignature(cloudUser.id, deviceId);
        await storage.bindPremiumDevice(cloudUser.id, deviceId, signature, deviceMeta);
        console.log(`[DeviceBinding] Rebind-stale | user=${cloudUser.id} | old=${user.premiumBoundDeviceId} | new=${deviceId} | sig=${signature.substring(0, 8)}...`);
        return res.json({ status: "ok", isFirstBind: false, deviceSignature: signature, legacyMigrated });
      }

      // Active mismatch — block
      console.warn(`[DeviceBinding] Locked | user=${cloudUser.id} | bound=${user.premiumBoundDeviceId} | presented=${deviceId}`);
      return res.json({
        status: "locked",
        legacyMigrated,
        message: "This premium license is already linked to a different device and can't be used here.",
      });
    } catch (err) {
      console.error("[DeviceBinding] Validate error:", err);
      res.status(500).json({ error: "Device validation failed. Please try again." });
    }
  });

  // ── Installer download route ──────────────────────────────────────────────────
  // Proxies the SwitchControl Windows installer so the storage provider URL
  // never leaks into the browser's address bar or download history.
  app.get("/downloads/:fileName", async (req, res) => {
    const { fileName } = req.params;
    const source = typeof req.query.source === "string" ? req.query.source : "direct";
    const configuredInstallerUrl = process.env.INSTALLER_DOWNLOAD_URL;

    if (!configuredInstallerUrl) {
      console.error(`[Download] INSTALLER_DOWNLOAD_URL is not configured — cannot serve ${fileName}`);
      return res.status(503).json({
        error: "Installer temporarily unavailable. Please try again later.",
        path: fileName,
      });
    }

    let installerUrl: URL;
    let installerFileName: string;
    try {
      installerUrl = new URL(configuredInstallerUrl);
      if (installerUrl.protocol !== "https:") {
        throw new Error("Installer URL must use HTTPS");
      }

      // INSTALLER_DOWNLOAD_URL is the complete upstream object URL. Do not
      // replace its path with the version baked into this build: that prevents
      // deployment configuration from selecting a restored or alternate file.
      const encodedFileName = installerUrl.pathname.split("/").pop() || "";
      installerFileName = decodeURIComponent(encodedFileName)
        .replace(/[^A-Za-z0-9._ -]/g, "_")
        .trim();
      if (!installerFileName.toLowerCase().endsWith(".exe")) {
        throw new Error("Installer URL must point to an .exe file");
      }
    } catch {
      console.warn(`[Download] Ignoring malformed INSTALLER_DOWNLOAD_URL for ${fileName}`);
      return res.status(503).json({
        error: "Installer temporarily unavailable. Please try again later.",
        path: fileName,
      });
    }

    const upstreamTarget = `${installerUrl.origin}${installerUrl.pathname}`;
    fileName = "SwitchControl Setup 1.3.3.exe";
    console.log(`[Download] Installer requested — requestedFile=${fileName} source=${source} upstream=${upstreamTarget}`);

    try {
      const upstream = await fetch(installerUrl);
      if (!upstream.ok || !upstream.body) {
        console.error(`[Download] Upstream installer unavailable — status=${upstream.status} upstream=${upstreamTarget}`);
        return res.status(502).json({ error: "Installer temporarily unavailable. Please try again later." });
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
      const contentLength = upstream.headers.get("content-length");
      if (contentLength) res.setHeader("Content-Length", contentLength);
      const safeFileName = installerFileName.replace(/["\\]/g, "_");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(safeFileName)}`,
      );
      res.setHeader("Cache-Control", "public, max-age=3600");
      Readable.fromWeb(upstream.body as any).on("error", (error) => {
        console.error("[Download] Installer proxy stream failed:", error);
        if (!res.headersSent) res.status(502);
        res.destroy(error);
      }).pipe(res);
    } catch (error) {
      console.error(`[Download] Installer proxy request failed — upstream=${upstreamTarget}`, error);
      if (!res.headersSent) {
        res.status(502).json({ error: "Installer temporarily unavailable. Please try again later." });
      } else {
        res.destroy(error as Error);
      }
    }
  });

  return httpServer;
}
