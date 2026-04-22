// MUST be first — bootstraps JWT_SECRET/SESSION_SECRET for Electron backend mode
// before jwt.ts or session middleware evaluates process.env
import "./lib/desktop-secrets";

import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { storage } from "./storage";
import { createServer } from "http";
import { getStripeClient, isStripeConfigured, logStripeStartupConfig } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { csrfTokenMiddleware } from "./middleware/csrf";
import { runJwtSelfTest } from "./lib/jwt";
import { runDeviceBindingMigration } from "./lib/deviceBindingMigration";
import fs from "fs";
import path from "path";

const app = express();

const isProd = process.env.NODE_ENV === "production";

app.use(helmet({
  contentSecurityPolicy: isProd
    ? {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: ["'self'", "https://api.stripe.com", "https://api.openai.com"],
          frameSrc: ["'self'", "https://js.stripe.com"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      }
    : false,
  crossOriginEmbedderPolicy: false,
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  frameguard: { action: "sameorigin" },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later" }
});

const meLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down" }
});

app.use("/api/auth", authLimiter);
app.use("/api/me", meLimiter);

const isElectronBackend = process.env.ELECTRON_BACKEND === '1';

const allowedOrigins = isProd && !isElectronBackend
  ? [
      "https://switchcontrol.org",
      "https://www.switchcontrol.org",
    ]
  : [
      "http://localhost:3000",
      "http://localhost:5000",
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:5000",
      "http://127.0.0.1:5173",
    ];

const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (origin === 'null') {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    if (!isProd && (
      origin.endsWith(".replit.dev") ||
      origin.endsWith(".replit.app") ||
      origin.endsWith(".kirk.replit.dev") ||
      (replitDevDomain && origin.includes(replitDevDomain))
    )) {
      return callback(null, true);
    }
    console.warn(`[CORS] Blocked origin: ${origin}`);
    const err: any = new Error("CORS blocked");
    err.status = 403;
    return callback(err);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token', 'x-device-id'],
  exposedHeaders: ['X-Auth-Mode'],
}));
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

async function ensureAdminUsers() {
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) return;

  for (const email of adminEmails) {
    try {
      const user = await storage.getUserByEmail(email);
      if (!user) {
        console.log(`[Admin] No user found for ${email} — skipping`);
        continue;
      }
      if (!user.isAdmin) {
        await storage.setUserAdmin(user.id, true);
        console.log(`[Admin] Granted admin to ${email} (${user.id})`);
      } else {
        console.log(`[Admin] ${email} already has admin access`);
      }
    } catch (err: any) {
      console.error(`[Admin] Failed to ensure admin for ${email}:`, err.message);
    }
  }
}

async function initStripe() {
  logStripeStartupConfig();
  runDeviceBindingMigration().catch((e) => console.error("[DeviceBinding] Migration error:", e));
  if (!isStripeConfigured) {
    return;
  }
  try {
    const { getUncachableStripeClient: freshStripe } = await import('./stripeClient');
    const stripe = await freshStripe();
    const account = await stripe.accounts.retrieve();
    console.log(`[Stripe] Connected: ${account.id || 'connected'}`);
  } catch (error: any) {
    const code = (error as any)?.code;
    const type = (error as any)?.type;
    if (type === 'StripeAuthenticationError' || code === 'api_key_expired' || code === 'invalid_api_key') {
      console.error(`[Stripe] ⚠️  API key is INVALID or EXPIRED (type=${type} code=${code}). Regenerate STRIPE_SECRET_KEY in the Stripe dashboard — checkout will fail until this is fixed.`);
    } else {
      console.error('[Stripe] Startup check failed:', error.message);
    }
  }
}

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(
  express.json({
    limit: '12mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(csrfTokenMiddleware);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

const REDACTED_KEYS = new Set([
  "token",
  "authorization",
  "accesstoken",
  "refreshtoken",
  "jwt",
  "password",
  "secret",
]);

function sanitizeForLog(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForLog);
  const clone: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      clone[key] = "[REDACTED]";
    } else if (typeof clone[key] === "object" && clone[key] !== null) {
      clone[key] = sanitizeForLog(clone[key]);
    }
  }
  return clone;
}

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  const requestId = crypto.randomUUID();
  (req as any).requestId = requestId;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      const sanitizedResponse = capturedJsonResponse
        ? JSON.stringify(sanitizeForLog(capturedJsonResponse))
        : undefined;
      let logLine = `[${requestId}] ${new Date().toISOString()} ${req.method} ${reqPath} ${res.statusCode} ${duration}ms`;
      if (sanitizedResponse) {
        logLine += ` :: ${sanitizedResponse}`;
      }

      log(logLine);
    }
  });

  next();
});

// Wrap a promise so it never blocks longer than `ms` milliseconds.
// On timeout it resolves (not rejects) so the caller can continue.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | void> {
  return Promise.race([
    promise,
    new Promise<void>(resolve =>
      setTimeout(() => {
        console.warn(`[Startup] ${label} timed out after ${ms}ms — continuing without it`);
        resolve();
      }, ms)
    ),
  ]);
}

(async () => {
  runJwtSelfTest();

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = isProd && status >= 500 ? "Internal Server Error" : (err.message || "Internal Server Error");

    console.error(`[ERROR] ${status} ${err.message}`, isProd ? '' : err.stack);
    res.status(status).json({ message });
  });

  // Serve sitemap.xml from root public folder (works in both dev and prod)
  const rootPublicPath = path.resolve(process.cwd(), "public");
  app.get("/sitemap.xml", (_req, res) => {
    const sitemapPath = path.join(rootPublicPath, "sitemap.xml");
    if (fs.existsSync(sitemapPath)) {
      res.setHeader("Content-Type", "application/xml");
      res.sendFile(sitemapPath);
    } else {
      res.status(404).send("Sitemap not found");
    }
  });
  
  // Serve static assets from root public folder
  app.use(express.static(rootPublicPath));

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "3000", 10);
  // Electron backend always binds to 127.0.0.1 so health checks and the
  // renderer (both using 127.0.0.1) can reach it without DNS resolution.
  // Windows with "localhost" can resolve to ::1 (IPv6) instead of 127.0.0.1,
  // which breaks the health probe and leaves backendReady stuck at false.
  const isElectronBackend = process.env.ELECTRON_BACKEND === "1";
  const host = isElectronBackend ? "127.0.0.1" : "0.0.0.0";

  const listenOptions: any = { port, host };
  if (!isElectronBackend) {
    listenOptions.reusePort = true;
  }

  httpServer.listen(listenOptions, () => {
    log(`serving on ${host}:${port}`);

    // Run potentially-slow startup tasks AFTER the server is already listening.
    // Each is wrapped in a timeout so a hung network/DB call can never prevent
    // the health endpoint from responding or the Electron health-check from passing.
    Promise.all([
      withTimeout(initStripe(),        8_000, "initStripe"),
      withTimeout(ensureAdminUsers(),  8_000, "ensureAdminUsers"),
    ]).catch(e => console.error("[Startup] Background init error:", e));
  });
})();
