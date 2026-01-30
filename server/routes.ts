import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { setupGoogleAuth, requirePremium } from "./auth/google";
import { setupDiscordAuth } from "./auth/discord";
import { getUncachableStripeClient, getStripePublishableKey, isTestMode } from "./stripeClient";

// Tweak tier definitions - matches client-side logic
const PREMIUM_TWEAK_LEVELS = ["Advanced", "Experimental"];
const PREMIUM_TWEAK_CATEGORIES = ["Network"];

function isPremiumTweak(tweakId: string, tweakLevel?: string, tweakCategory?: string): boolean {
  // If level is Advanced or Experimental, it's premium
  if (tweakLevel && PREMIUM_TWEAK_LEVELS.includes(tweakLevel)) {
    return true;
  }
  // If category is Network, it's premium
  if (tweakCategory && PREMIUM_TWEAK_CATEGORIES.includes(tweakCategory)) {
    return true;
  }
  return false;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  setupGoogleAuth(app);
  setupDiscordAuth(app);

  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getOrCreateSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/settings", async (req, res) => {
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

  app.post("/api/tweaks/:tweakId", async (req, res) => {
    try {
      const { tweakId } = req.params;
      const { enabled, tweakTitle, tweakLevel, tweakCategory } = req.body;
      
      // Server-side premium enforcement for premium tweaks
      if (enabled && isPremiumTweak(tweakId, tweakLevel, tweakCategory)) {
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
      const tweak = await storage.setTweak(settings.id, tweakId, enabled);
      
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
        result: 'Simulated apply',
      });
      
      res.json(tweak);
    } catch (error) {
      res.status(500).json({ error: "Failed to update tweak" });
    }
  });

  app.post("/api/tweaks/reset", async (req, res) => {
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

  app.post("/api/tweaks/apply-recommended", async (req, res) => {
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

  app.delete("/api/history", async (req, res) => {
    try {
      const settings = await storage.getOrCreateSettings();
      await storage.clearHistory(settings.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear history" });
    }
  });

  app.post("/api/history", async (req, res) => {
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

  // Premium-only: AI Scan
  app.post("/api/ai-scan", requirePremium, async (req, res) => {
    try {
      const settings = await storage.getOrCreateSettings();
      
      const recommendations = [
        { id: "1", action: "Reduce background process priority", tag: "Safe" },
        { id: "2", action: "Optimize kernel memory management", tag: "Advanced" },
        { id: "3", action: "Disable unused driver hooks", tag: "Requires local agent" }
      ];
      
      const scan = await storage.addAIScan({
        settingsId: settings.id,
        summary: "Your system is good, but these 3 changes could help consistency.",
        recommendations,
      });
      
      await storage.updateSettings(settings.id, { lastScan: new Date() });
      
      await storage.addHistory({
        settingsId: settings.id,
        action: 'AI Scan',
        page: 'Dashboard',
        result: 'Scan complete',
        notes: 'Generated 3 recommendations',
      });
      
      res.json(scan);
    } catch (error) {
      res.status(500).json({ error: "Failed to run AI scan" });
    }
  });

  app.get("/api/telemetry", async (req, res) => {
    try {
      const fluctuate = (base: number, range: number) => 
        parseFloat((base + (Math.random() * range * 2 - range)).toFixed(1));
      
      res.json({
        temps: {
          cpu: fluctuate(65, 8),
          gpu: fluctuate(58, 10),
          mobo: fluctuate(42, 3)
        },
        ram: {
          totalGB: 32,
          usedGB: fluctuate(12.5, 2)
        },
        ssds: [
          { 
            name: "C:", 
            totalGB: 512, 
            usedGB: fluctuate(285, 5),
            status: Math.random() > 0.7 ? "Active" : "Idle"
          },
          { 
            name: "D:", 
            totalGB: 1024, 
            usedGB: fluctuate(620, 10),
            status: Math.random() > 0.8 ? "Active" : "Idle"
          }
        ]
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch telemetry" });
    }
  });

  app.post("/api/clear-ram", async (req, res) => {
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
        return res.status(400).json({ error: "already_premium" });
      }

      const stripe = await getUncachableStripeClient();
      const isProduction = process.env.NODE_ENV === "production";
      const productionDomain = "https://switchcontrol.org";
      const domains = process.env.REPLIT_DOMAINS?.split(',') || [];
      const devDomain = domains.find(d => d.endsWith('.replit.app')) || domains[0];
      const baseUrl = isProduction ? productionDomain : `https://${devDomain}`;
      const testMode = isTestMode();
      
      const priceId = process.env.STRIPE_PRICE_ID;
      
      if (!priceId) {
        console.error("STRIPE_PRICE_ID not configured");
        return res.status(500).json({ error: "Stripe not configured properly" });
      }

      const sessionConfig: any = {
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing`,
        client_reference_id: dbUser.id,
        metadata: {
          userId: dbUser.id,
          email: dbUser.email || '',
        },
      };

      if (!testMode) {
        let customerId = dbUser.stripeCustomerId;
        if (!customerId) {
          const customer = await stripe.customers.create({
            email: dbUser.email || undefined,
            metadata: { userId: dbUser.id },
          });
          customerId = customer.id;
          await storage.updateUserStripeInfo(dbUser.id, { stripeCustomerId: customerId });
        }
        sessionConfig.customer = customerId;
      }

      const session = await stripe.checkout.sessions.create(sessionConfig);

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Checkout session error:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout session" });
    }
  });

  app.post("/api/stripe/confirm", async (req, res) => {
    try {
      const { session_id } = req.body;
      if (!session_id) {
        return res.status(400).json({ ok: false, error: "session_id required" });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(session_id);

      if (session.payment_status !== 'paid') {
        return res.status(400).json({ ok: false, error: "not_paid" });
      }

      const checkoutUserId = session.client_reference_id || session.metadata?.userId;
      const loggedInUser = (req as any).user;
      
      if (!checkoutUserId) {
        return res.status(400).json({ ok: false, error: "missing_user_mapping" });
      }

      if (loggedInUser?.id && loggedInUser.id !== checkoutUserId) {
        console.error(`[STRIPE] User mismatch: logged in as ${loggedInUser.id}, checkout was for ${checkoutUserId}`);
        return res.status(403).json({ ok: false, error: "user_mismatch" });
      }

      const dbUser = await storage.getUser(checkoutUserId);
      if (!dbUser) {
        return res.status(404).json({ ok: false, error: "user_not_found" });
      }

      if (!dbUser.isPremium) {
        await storage.setUserPremium(checkoutUserId, true);
        console.log(`[STRIPE] Premium activated for user ${checkoutUserId}`);
      }

      res.json({ ok: true, userId: checkoutUserId, authenticated: !!loggedInUser?.id });
    } catch (error: any) {
      console.error("Confirm error:", error);
      res.status(500).json({ ok: false, error: error.message || "Failed to confirm payment" });
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

  return httpServer;
}
