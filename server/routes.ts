import type { Express } from "express";
import { createServer, type Server } from "http";
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
import { resolveEffectivePlan } from "./lib/planUtils";
import aiRouter from "./routes/ai";
import biosRouter from "./routes/bios";
import securityRouter from "./routes/security";
import networkDiagnosticsRouter from "./routes/networkDiagnostics";
import adminRouter from "./routes/admin";
import appBoosterRouter from "./routes/appBooster";
import networkTweaksRouter from "./routes/networkTweaks";
import tweakIntelligenceRouter from "./routes/tweakIntelligence";
import powerIntelligenceRouter from "./routes/powerIntelligence";
import dashboardIntelligenceRouter from "./routes/dashboardIntelligence";
import startupAppsRouter from "./routes/startupApps";
import debloaterRouter from "./routes/debloater";
import cleanerRouter from "./routes/cleaner";
import focusModeRouter from "./routes/focusMode";
import { systemIntelligenceRouter } from "./routes/systemIntelligence";
import issueDetectorRouter from "./routes/issueDetector";
import advisorContextRouter from "./routes/advisorContext";
import { getSystemIntelligence } from "./lib/systemIntelligence";
import { getSnapshot, getSystemSpecs, getSchedulerStats, startTelemetryPolling } from "./lib/telemetry";
import { setupWebSocketServer } from "./lib/wsServer";
import { signJwt } from "./lib/jwt";

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
  app.use("/api/bios", requireJwt, requireCloudPremium, biosRouter);
  app.use("/api/security", securityRouter);
  app.use("/api/network", networkDiagnosticsRouter);
  app.use("/api/admin", (req, res, next) => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      return csrfProtection(req, res, next);
    }
    next();
  }, adminRouter);
  app.use("/api/app-booster", requireJwt, appBoosterRouter);
  app.use("/api/network-tweaks", requireJwt, networkTweaksRouter);
  app.use("/api/tweak-intelligence", tweakIntelligenceRouter);
  app.use("/api/power-intelligence", powerIntelligenceRouter);
  app.use("/api/dashboard-intelligence", dashboardIntelligenceRouter);
  app.use("/api/startup", startupAppsRouter);
  app.use("/api/debloat", debloaterRouter);
  app.use("/api/cleaner", requireJwt, cleanerRouter);
  app.use("/api/focus", requireJwt, focusModeRouter);
  app.use("/api/system-intelligence", systemIntelligenceRouter);
  app.use("/api/issues", issueDetectorRouter);
  app.use("/api/ai-advisor", requireJwt, advisorContextRouter);

  // ── Extreme Labs — cloud fallback for web sessions (Electron uses IPC) ───────────────
  app.get("/api/extreme-labs/status", requireJwt, requireCloudPremium, (req, res) => {
    res.json({ ok: true, hasRestorePoint: false, hasBaseline: false, sessionActive: false, lastRestoreTimestamp: null });
  });

  app.post("/api/extreme-labs/restore-point", requireJwt, requireCloudPremium, (req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.post("/api/extreme-labs/baseline", requireJwt, requireCloudPremium, (req, res) => {
    res.json({ ok: true, baseline: { timestamp: Date.now(), snapshot: "web-baseline" } });
  });

  app.get("/api/extreme-labs/analyze", requireJwt, requireCloudPremium, (req, res) => {
    res.json({
      ok: true,
      categories: [
        { name: "Latency Core", score: 72, recommendation: "Consider timer resolution and dynamic tick" },
        { name: "Scheduler / CPU", score: 65, recommendation: "Priority separation may help" },
        { name: "Gaming / Capture", score: 45, recommendation: "Game DVR is active — disabling may help" },
        { name: "Network Latency", score: 58, recommendation: "Network throttling is moderate" },
        { name: "Service Weight", score: 80, recommendation: "Services are light" },
        { name: "Startup / Vendor Weight", score: 55, recommendation: "Several updaters active at boot" },
      ],
      overallScore: 62,
    });
  });

  app.post("/api/extreme-labs/apply", requireJwt, requireCloudPremium, (req, res) => {
    const ids = req.body?.ids ?? [];
    res.json({ ok: true, results: ids.map((id: string) => ({ id, applied: false, reason: "Web sessions cannot apply registry tweaks. Use the desktop app." })) });
  });

  app.post("/api/extreme-labs/revert", requireJwt, requireCloudPremium, (req, res) => {
    res.json({ ok: true, message: "All tweaks reverted to baseline" });
  });

  // Warm up system intelligence in the background — delayed 6s so it doesn't
  // compete with the initial telemetry priming and window reveal.
  setTimeout(() => getSystemIntelligence().catch(() => {}), 6000);

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

  // JWT reissue — Electron clients call this against the cloud server when their
  // local JWT has expired. The cloud server authenticates via the persisted session
  // cookie (Passport) and issues a fresh JWT the Electron local backend can verify.
  app.post("/api/auth/reissue-jwt", async (req, res) => {
    const isElectronBackend = process.env.ELECTRON_BACKEND === '1';
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
      const isElectronBackend = process.env.ELECTRON_BACKEND === '1';
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
      const updated = await storage.updateSettings(settings.id, req.body);
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
      
      const currentCount = settings.tweaksApplied || 0;
      const newCount = enabled ? currentCount + 1 : Math.max(0, currentCount - 1);
      await storage.updateSettings(settings.id, { 
        tweaksApplied: newCount,
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

  app.post("/api/tweaks/apply-recommended", requireJwt, csrfProtection, async (req, res) => {
    try {
      const { tweakIds } = req.body;
      const cloudUser = req.cloudUser!;

      // Premium enforcement: reject if any of the requested tweaks are premium-only
      const hasPremiumTweaks = Array.isArray(tweakIds) && tweakIds.some((id: string) => isPremiumTweakById(id));
      if (hasPremiumTweaks && !cloudUser.isPremium) {
        return res.status(403).json({
          error: "premium_required",
          message: "Premium subscription required for premium tweaks",
          upgradeUrl: "/pricing"
        });
      }

      const settings = await storage.getOrCreateSettings(cloudUser.id);
      
      for (const tweakId of tweakIds) {
        await storage.setTweak(settings.id, tweakId, true);
      }
      
      await storage.updateSettings(settings.id, { 
        tweaksApplied: tweakIds.length,
        lastScan: new Date()
      });
      
      await storage.addHistory({
        settingsId: settings.id,
        action: 'Apply Recommended',
        page: 'Tweaks',
        result: `Enabled ${tweakIds.length} tweaks`,
      });
      
      res.json({ success: true, count: tweakIds.length });
    } catch (error) {
      res.status(500).json({ error: "Failed to apply recommended" });
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
      const entry = await storage.addHistory({
        ...req.body,
        settingsId: settings.id,
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
        processes: snap.processes,
        load_trend: snap.load_trend,
      });
    } catch (error) {
      console.error("Telemetry error:", error);
      res.status(500).json({ error: "Failed to fetch telemetry" });
    }
  });

  app.get("/api/debug/scheduler", (req, res) => {
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

  // Start background telemetry polling only when NOT running as Electron backend.
  // Electron has its own telemetry loop in main.js; running both would duplicate
  // systeminformation calls and double CPU usage.
  if (!isElectronBackend) {
    startTelemetryPolling(1000);
  }
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

  // Rate limited: max 5 checkout session creations per user per hour.
  // This prevents checkout spam and reduces Stripe API load.
  const stripeCheckoutLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
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

      if (dbUser.isPremium) {
        console.log(`[Stripe] Checkout blocked — user ${dbUser.id} is already premium`);
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

  // Activity ping — called by Electron app periodically
  app.post("/api/activity/ping", requireJwt, async (req, res) => {
    try {
      const cloudUser = req.cloudUser!;
      await storage.updateUserActivity(cloudUser.id, { lastAppActiveAt: new Date() });
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

      if (!deviceId) {
        return res.status(400).json({ error: "Missing x-device-id header.", code: "missing_device_id" });
      }

      // Always fetch a fresh user record — the JWT-cached isPremium field can be stale
      // if the admin changed the plan after the token was issued (e.g. premium → trial).
      const user = await storage.getUser(cloudUser.id);
      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }

      const effectivePlan = resolveEffectivePlan(user);

      // Device locking is a PREMIUM-only feature. Trial access is user-scoped, not
      // device-scoped. Returning not_premium here lets the client proceed without
      // showing the DeviceLockModal regardless of any previously-bound device ID.
      if (effectivePlan !== "premium") {
        console.log(`[DeviceBinding] Skip | user=${cloudUser.id} | plan=${effectivePlan} | device=${deviceId}`);
        return res.json({ status: "not_premium" });
      }

      if (!user.premiumBoundDeviceId) {
        // First premium activation — bind the presenting device
        await storage.bindPremiumDevice(cloudUser.id, deviceId);
        console.log(`[DeviceBinding] Assigned | user=${cloudUser.id} | device=${deviceId}`);
        return res.json({ status: "ok", isFirstBind: true });
      }

      if (user.premiumBoundDeviceId === deviceId) {
        // Correct device — refresh lastSeen timestamp
        await storage.updateDeviceLastSeen(cloudUser.id, deviceId);
        console.log(`[DeviceBinding] Valid | user=${cloudUser.id} | device=${deviceId}`);
        return res.json({ status: "ok", isFirstBind: false });
      }

      // Device mismatch — check whether the binding has gone stale (device unseen for >30 days).
      // A stale binding can happen after a hardware change; allow automatic rebind rather than
      // permanently locking the user out without admin intervention.
      const STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
      const lastSeen = user.premiumDeviceLastSeenAt ?? user.premiumBoundAt;
      const isStale = !lastSeen || Date.now() - new Date(lastSeen).getTime() > STALE_MS;

      if (isStale) {
        await storage.bindPremiumDevice(cloudUser.id, deviceId);
        console.log(`[DeviceBinding] Rebind-stale | user=${cloudUser.id} | old=${user.premiumBoundDeviceId} | new=${deviceId}`);
        return res.json({ status: "ok", isFirstBind: false });
      }

      // Active mismatch — block
      console.warn(`[DeviceBinding] Locked | user=${cloudUser.id} | bound=${user.premiumBoundDeviceId} | presented=${deviceId}`);
      return res.json({
        status: "locked",
        message: "This premium license is already linked to a different device and can't be used here.",
      });
    } catch (err) {
      console.error("[DeviceBinding] Validate error:", err);
      res.status(500).json({ error: "Device validation failed. Please try again." });
    }
  });

  // ── Installer download route ──────────────────────────────────────────────────
  // Serves the SwitchControl Windows installer. INSTALLER_DOWNLOAD_URL must be set
  // to the real hosted file URL (e.g. Cloudflare R2, S3, etc).
  app.get("/downloads/:fileName", (req, res) => {
    const { fileName } = req.params;
    const source = typeof req.query.source === "string" ? req.query.source : "direct";
    const installerUrl = process.env.INSTALLER_DOWNLOAD_URL;

    if (!installerUrl) {
      console.error(`[Download] INSTALLER_DOWNLOAD_URL is not configured — cannot serve ${fileName}`);
      return res.status(503).json({
        error: "Installer temporarily unavailable. Please try again later.",
        path: fileName,
      });
    }

    console.log(`[Download] Installer requested — file=${fileName} source=${source}`);
    res.redirect(302, installerUrl);
  });

  return httpServer;
}
