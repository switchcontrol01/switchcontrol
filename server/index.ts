// MUST be first — bootstraps JWT_SECRET/SESSION_SECRET for Electron backend mode
// before jwt.ts or session middleware evaluates process.env
import "./lib/desktop-secrets";

import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import crypto from "crypto";
import { registerRoutes } from "./routes";
import { authLimiter, oauthStartLimiter, meLimiter, stripeLimiter, systemLimiter, telemetryRestLimiter } from "./middleware/rateLimiter";
import { serveStatic } from "./static";
import { storage } from "./storage";
import { createServer } from "http";
import { getStripeClient, isStripeConfigured, logStripeStartupConfig } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { csrfTokenMiddleware } from "./middleware/csrf";
import { runJwtSelfTest } from "./lib/jwt";
import { runDeviceBindingMigration } from "./lib/deviceBindingMigration";
import { runPermanentDeviceIdMigration } from "./lib/permanentDeviceIdMigration";
import { runStripeWebhookDedupMigration } from "./lib/stripeWebhookDedupMigration";
import { runScalabilityMigration } from "./lib/scalabilityMigration";
import { isCoreSchemaReady } from "./db";
import { initDriverFetchScheduler } from "./lib/driverFetcher";
import { cleanupOldStripeEvents } from "./lib/stripeEventStore";
import fs from "fs";
import path from "path";

const app = express();

const isProd = process.env.NODE_ENV === "production";

// HTTP response compression — gzip/brotli for all API + static responses.
// Placed before helmet so the Content-Encoding header is set before CSP.
app.use(compression());

app.use(helmet({
  contentSecurityPolicy: isProd
    ? {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'sha256-po3fq3oj6v/fM0HrtsQRYg7nnlgYKbJzaeKGulp1lSw='", "https://js.stripe.com"],
          styleSrc: ["'self'", "'sha256-ELttVqSZIEVoLR/Eixzx/sFCZ9p2/JkAo1zNWX/ikc4='", "https://fonts.googleapis.com"],
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
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: { allow: false },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  frameguard: { action: "sameorigin" },
  permittedCrossDomainPolicies: false,
}));

// Permissions-Policy is not yet in Helmet; set manually for defense-in-depth.
app.use((_req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), display-capture=(), document-domain=(), encrypted-media=(), execution-while-not-rendered=(), execution-while-out-of-viewport=(), fullscreen=(), geolocation=(), gyroscope=(), keyboard-map=(), magnetometer=(), microphone=(), midi=(), navigation-override=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=(), clipboard-read=(), clipboard-write=()"
  );
  next();
});

app.use("/api/auth", authLimiter);
app.use("/api/me", meLimiter);
app.use("/auth/google", oauthStartLimiter);
app.use("/api/stripe", stripeLimiter);
app.use("/api/billing", stripeLimiter);
app.use("/api/telemetry", telemetryRestLimiter);
app.use("/api/metrics", telemetryRestLimiter);
app.use("/api/system-intelligence", systemLimiter);
app.use("/api/issues", systemLimiter);

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

const corsOriginValidator = function(origin: string | undefined, callback: (err: any, allow?: boolean) => void) {
  if (!origin) return callback(null, true);
  // Do NOT allow origin === 'null'. Browsers send literal "null" for sandboxed
  // iframes (<iframe sandbox> without allow-same-origin), file:// contexts, and
  // some redirect chains. Explicitly allowing it with credentials:true means an
  // attacker-controlled sandboxed iframe could make credentialed cross-origin
  // requests and bypass the same-origin allowlist built below.
  // The !origin guard above already covers same-origin and server-to-server requests
  // (no Origin header at all) — the 'null' string case is a distinct browser signal
  // that should be treated as untrusted.
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
};

// CORS with credentials only on API routes — static assets (favicon, images, etc.)
// must NOT carry Access-Control-Allow-Credentials: true because shared-cache crawlers
// (including Google's favicon fetcher) treat credential-bearing responses as private
// and will not cache them, causing the globe fallback in Google Search results.
app.use("/api", cors({
  origin: corsOriginValidator,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token', 'x-device-id', 'x-device-signature'],
  exposedHeaders: ['X-Auth-Mode'],
}));
app.use("/auth", cors({
  origin: corsOriginValidator,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
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
    // Keep the established global limit until every legitimate large-payload
    // route is mounted ahead of this parser and has its own explicit limit.
    // Stripe uses a raw parser above; security scans retain their route parser.
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

const isVerboseHttp = !isProd || process.env.LOG_VERBOSE === "true" || process.env.DEBUG_MODE === "true";

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  const requestId = crypto.randomUUID();
  (req as any).requestId = requestId;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  if (isVerboseHttp) {
    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (!reqPath.startsWith("/api")) return;

    const status = res.statusCode;
    const isError = status >= 500;

    if (!isError && !isVerboseHttp) return;

    const sanitizedResponse = (isVerboseHttp && capturedJsonResponse)
      ? JSON.stringify(sanitizeForLog(capturedJsonResponse))
      : undefined;
    let logLine = `[${requestId}] ${req.method} ${reqPath} ${status} ${duration}ms`;
    if (sanitizedResponse) logLine += ` :: ${sanitizedResponse}`;

    if (isError) {
      console.error(`[HTTP] ${logLine}`);
    } else {
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

  // Hard guard: in embedded Electron backend mode, block cloud-truth routes
  // from ever returning fake data. The packaged Electron frontend now routes
  // these directly to switchcontrol.org. If a request still hits the local
  // backend (e.g., old fetch without interceptor), return a clear 409 so
  // nothing pretends to work.
  // Must be registered BEFORE registerRoutes() so it runs before any route handler.
  if (isElectronBackend) {
    const cloudOnlyPaths = ["/api/me", "/api/auth", "/api/premium", "/api/device", "/api/stripe", "/api/billing", "/api/admin"];
    app.use(cloudOnlyPaths, (req: Request, res: Response) => {
      console.warn(`[LocalGuard] Blocked cloud-only route on local backend: ${req.path}`);
      res.status(409).json({
        error: "Cloud-only route. Packaged Electron must call switchcontrol.org for auth, premium, billing, and device validation.",
      });
    });
  }

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
  const host = isElectronBackend ? "127.0.0.1" : "0.0.0.0";

  const listenOptions: any = { port, host };
  if (!isElectronBackend) {
    listenOptions.reusePort = true;
  }

  httpServer.listen(listenOptions, () => {
    log(`serving on ${host}:${port}`);

    // In Electron local backend mode, Stripe and admin bootstrap require
    // cloud DB / cloud secrets that are intentionally absent.  Skip them
    // entirely so they cannot time out or emit misleading error logs.
    if (isElectronBackend) return;

    // Run potentially-slow startup tasks AFTER the server is already listening.
    // Each is wrapped in a timeout so a hung network/DB call can never prevent
    // the health endpoint from responding or the Electron health-check from passing.
    (async () => {
      const schemaReady = await isCoreSchemaReady();
      if (!schemaReady) {
        console.info(
          "[DB] Core schema is not initialized; skipping database startup tasks until the schema is created.",
        );
        await withTimeout(initStripe(), 8_000, "initStripe");
        return;
      }

      // Scalability creates the long-lived device table used by the legacy
      // device-ID migration, so it must complete before those migrations run.
      await withTimeout(runScalabilityMigration(), 30_000, "scalabilityMigration");
      await Promise.all([
        withTimeout(initStripe(), 8_000, "initStripe"),
        withTimeout(runDeviceBindingMigration(), 8_000, "deviceBindingMigration"),
        withTimeout(runPermanentDeviceIdMigration(), 8_000, "permanentDeviceIdMigration"),
        withTimeout(runStripeWebhookDedupMigration(), 8_000, "stripeWebhookDedupMigration"),
        withTimeout(ensureAdminUsers(), 8_000, "ensureAdminUsers"),
        withTimeout(cleanupOldStripeEvents(), 8_000, "cleanupStripeEvents"),
      ]);
    })().catch(e => console.error("[Startup] Background init error:", e));

    // Driver version auto-fetch: fires 60s after startup, then every 24h.
    // Not wrapped in withTimeout — the scheduler manages its own timing.
    initDriverFetchScheduler();
  });
})();
