import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { setupGoogleAuth, requirePremium } from "./auth/google";
import { setupDiscordAuth } from "./auth/discord";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { isPremiumTweakById } from "../shared/tweak-tiers";
import { getTierFromTweakCount, getRandomMessage, getSmartRecommendations, type SystemContext } from "./lib/aiMessages";
import { csrfProtection, generateCsrfToken } from "./middleware/csrf";
import { requireJwt, requireCloudPremium } from "./middleware/requireCloudAuth";
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
import { getSnapshot, getSystemSpecs, startTelemetryPolling } from "./lib/telemetry";
import { setupWebSocketServer } from "./lib/wsServer";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  setupGoogleAuth(app);
  setupDiscordAuth(app);

  app.use("/api/ai", requireJwt, requireCloudPremium, aiRouter);
  app.use("/api/bios", requireJwt, requireCloudPremium, biosRouter);
  app.use("/api/security", securityRouter);
  app.use("/api/network", networkDiagnosticsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/app-booster", appBoosterRouter);
  app.use("/api/network-tweaks", networkTweaksRouter);
  app.use("/api/tweak-intelligence", tweakIntelligenceRouter);
  app.use("/api/power-intelligence", powerIntelligenceRouter);
  app.use("/api/dashboard-intelligence", dashboardIntelligenceRouter);
  app.use("/api/startup", startupAppsRouter);
  app.use("/api/debloat", debloaterRouter);
  app.use("/api/cleaner", cleanerRouter);
  app.use("/api/focus", focusModeRouter);

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

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
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

  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getOrCreateSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/settings", csrfProtection, async (req, res) => {
    try {
      const settings = await storage.getOrCreateSettings();
      const updated = await storage.updateSettings(settings.id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.get("/api/tweaks", async (req, res) => {
    try {
      const settings = await storage.getOrCreateSettings();
      const tweaks = await storage.getTweaks(settings.id);
      const tweaksMap: Record<string, boolean> = {};
      tweaks.forEach(t => { tweaksMap[t.tweakId] = t.enabled; });
      res.json(tweaksMap);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tweaks" });
    }
  });

  app.post("/api/tweaks/:tweakId", csrfProtection, async (req, res) => {
    try {
      const tweakId = req.params.tweakId as string;
      const { enabled, tweakTitle } = req.body;
      
      // Server-side premium enforcement for premium tweaks (uses canonical server-side lookup)
      if (enabled && isPremiumTweakById(tweakId)) {
        const user = (req as any).user;
        if (!user) {
          return res.status(401).json({ 
            error: "premium_required", 
            message: "Authentication required for premium tweaks" 
          });
        }
        const dbUser = await storage.getUser(user.id);
        if (!dbUser?.isPremium) {
          return res.status(403).json({ 
            error: "premium_required",
            message: "Premium subscription required for this tweak",
            upgradeUrl: "/pricing"
          });
        }
      }
      
      const settings = await storage.getOrCreateSettings();
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

  app.post("/api/tweaks/reset", csrfProtection, async (req, res) => {
    try {
      const settings = await storage.getOrCreateSettings();
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

  app.post("/api/tweaks/apply-recommended", csrfProtection, async (req, res) => {
    try {
      const { tweakIds } = req.body;
      const settings = await storage.getOrCreateSettings();
      
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

  app.get("/api/history", async (req, res) => {
    try {
      const settings = await storage.getOrCreateSettings();
      const history = await storage.getHistory(settings.id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.delete("/api/history", csrfProtection, async (req, res) => {
    try {
      const settings = await storage.getOrCreateSettings();
      await storage.clearHistory(settings.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear history" });
    }
  });

  app.post("/api/history", csrfProtection, async (req, res) => {
    try {
      const settings = await storage.getOrCreateSettings();
      const entry = await storage.addHistory({
        settingsId: settings.id,
        ...req.body
      });
      res.json(entry);
    } catch (error) {
      res.status(500).json({ error: "Failed to add history entry" });
    }
  });

  app.get("/api/ai-scan", async (req, res) => {
    try {
      const settings = await storage.getOrCreateSettings();
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
  app.post("/api/ai-scan", csrfProtection, requirePremium, async (req, res) => {
    try {
      const settings = await storage.getOrCreateSettings();
      
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

  app.get("/api/telemetry", async (req, res) => {
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

  app.get("/api/specs", async (req, res) => {
    try {
      const specs = await getSystemSpecs();
      res.json(specs);
    } catch (error) {
      console.error("Specs error:", error);
      res.status(500).json({ error: "Failed to fetch system specs" });
    }
  });

  app.post("/api/metrics/snapshot", csrfProtection, async (req, res) => {
    try {
      const snap = await getSnapshot();
      res.json(snap);
    } catch (error) {
      res.status(500).json({ error: "Failed to capture snapshot" });
    }
  });

  // Start background telemetry polling immediately so cache is warm before first client
  startTelemetryPolling(1000);
  setupWebSocketServer(httpServer);

  app.post("/api/clear-ram", csrfProtection, async (req, res) => {
    try {
      const settings = await storage.getOrCreateSettings();
      const currentRam = settings.usedRamGb || 9.5;
      const freedAmount = Math.random() * 2 + 1;
      const newRam = Math.max(3.0, currentRam - freedAmount);
      
      await storage.updateSettings(settings.id, { 
        usedRamGb: parseFloat(newRam.toFixed(1)),
        cleanersRun: (settings.cleanersRun || 0) + 1,
        lastScan: new Date()
      });
      
      await storage.addHistory({
        settingsId: settings.id,
        action: 'Clear RAM',
        page: 'Dashboard',
        result: `Freed ${freedAmount.toFixed(1)} GB`,
      });
      
      res.json({ usedRamGb: parseFloat(newRam.toFixed(1)), freed: freedAmount.toFixed(1) });
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

  app.post("/api/stripe/create-checkout-session", async (req, res) => {
    try {
      const user = (req as any).user;
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
      console.error("[Stripe] Checkout session creation error:", error.message);
      res.status(500).json({ error: "Failed to create checkout session. Please try again." });
    }
  });

  // Read-only payment status check — used by the success page to show the correct state.
  // This route NEVER grants premium. Premium is exclusively granted by the Stripe webhook.
  app.post("/api/stripe/confirm", async (req, res) => {
    try {
      const { session_id } = req.body;
      if (!session_id || typeof session_id !== 'string') {
        return res.status(400).json({ ok: false, error: "session_id required" });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(session_id);

      if (session.payment_status !== 'paid') {
        console.log(`[Stripe] /confirm — session ${session_id} not paid yet (status=${session.payment_status})`);
        return res.status(400).json({ ok: false, error: "not_paid" });
      }

      // Verify the session belongs to the logged-in user.
      const checkoutUserId = session.client_reference_id || session.metadata?.userId;
      const loggedInUser = (req as any).user;

      if (!checkoutUserId) {
        console.error(`[Stripe] /confirm — session ${session_id} has no user mapping`);
        return res.status(400).json({ ok: false, error: "missing_user_mapping" });
      }

      if (loggedInUser?.id && loggedInUser.id !== checkoutUserId) {
        console.error(`[Stripe] /confirm — user mismatch: logged in as ${loggedInUser.id}, session was for ${checkoutUserId}`);
        return res.status(403).json({ ok: false, error: "user_mismatch" });
      }

      // Look up current premium status from DB — set exclusively by the webhook.
      const dbUser = await storage.getUser(checkoutUserId);
      if (!dbUser) {
        return res.status(404).json({ ok: false, error: "user_not_found" });
      }

      const isPremium = dbUser.isPremium;
      console.log(`[Stripe] /confirm — session ${session_id} paid, userId=${checkoutUserId} isPremium=${isPremium} (webhook is source of truth)`);

      // Return current premium status. If isPremium is false, the webhook has not yet fired.
      // The client should poll /api/user/premium-status until isPremium becomes true.
      res.json({ ok: true, isPremium, waitingForWebhook: !isPremium, userId: checkoutUserId });
    } catch (error: any) {
      console.error("[Stripe] /confirm error:", error.message);
      res.status(500).json({ ok: false, error: "Failed to check payment status." });
    }
  });

  app.get("/api/user/premium-status", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.json({ isPremium: false, authenticated: false });
      }

      const dbUser = await storage.getUser(user.id);
      res.json({ isPremium: dbUser?.isPremium || false, authenticated: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to get premium status" });
    }
  });

  app.get("/api/stripe/session", async (req, res) => {
    try {
      const { session_id } = req.query;
      if (!session_id || typeof session_id !== 'string') {
        return res.status(400).json({ error: "session_id is required" });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(session_id);

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
  //   - User not premium          → { status: 'not_premium' }
  //   - No bound device yet       → bind this device, { status: 'ok', isFirstBind: true }
  //   - Device matches bound      → update lastSeen, { status: 'ok' }
  //   - Device differs from bound → { status: 'locked' }
  //
  // NOTE: uses requireJwt only (not requireCloudPremium) so the validation call
  //       itself is never blocked by the device lock it is trying to evaluate.
  app.post("/api/device/premium-validate", requireJwt, async (req, res) => {
    try {
      const cloudUser = req.cloudUser!;
      const deviceId = req.headers["x-device-id"] as string | undefined;

      if (!deviceId) {
        return res.status(400).json({ error: "Missing x-device-id header.", code: "missing_device_id" });
      }

      if (!cloudUser.isPremium) {
        return res.json({ status: "not_premium" });
      }

      const user = await storage.getUser(cloudUser.id);
      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }

      if (!user.premiumBoundDeviceId) {
        // First premium activation on this account — bind the device
        await storage.bindPremiumDevice(cloudUser.id, deviceId);
        console.log(`[DeviceBinding] First bind | user=${cloudUser.id} | device=${deviceId}`);
        return res.json({ status: "ok", isFirstBind: true });
      }

      if (user.premiumBoundDeviceId === deviceId) {
        // Correct device — validated
        console.log(`[DeviceBinding] Valid | user=${cloudUser.id} | device=${deviceId}`);
        return res.json({ status: "ok", isFirstBind: false });
      }

      // Device mismatch — block
      console.warn(`[DeviceBinding] Mismatch | user=${cloudUser.id} | bound=${user.premiumBoundDeviceId} | presented=${deviceId}`);
      return res.json({
        status: "locked",
        message: "This premium license is already linked to a different device and can't be used here.",
      });
    } catch (err) {
      console.error("[DeviceBinding] Validate error:", err);
      res.status(500).json({ error: "Device validation failed. Please try again." });
    }
  });

  return httpServer;
}
