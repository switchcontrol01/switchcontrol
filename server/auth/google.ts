import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import connectPg from "connect-pg-simple";
import MemoryStore from "memorystore";
import type { Express, RequestHandler } from "express";
import { db, isNoDbMode } from "../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { signJwt, verifyJwt } from "../lib/jwt";

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
      isPremium: boolean;
    }
  }
}

async function findOrCreateUser(profile: {
  googleId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}): Promise<Express.User> {
  if (isNoDbMode || !db) {
    return {
      id: `mock-${profile.googleId}`,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      profileImageUrl: profile.profileImageUrl,
      isPremium: false,
    };
  }

  const existingUsers = await db
    .select()
    .from(users)
    .where(eq(users.googleId, profile.googleId))
    .limit(1);

  if (existingUsers.length > 0) {
    const user = existingUsers[0];
    await db
      .update(users)
      .set({
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        profileImageUrl: profile.profileImageUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return {
      id: user.id,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      profileImageUrl: profile.profileImageUrl,
      isPremium: user.isPremium,
    };
  }

  const newUsers = await db
    .insert(users)
    .values({
      provider: "google",
      providerUserId: profile.googleId,
      googleId: profile.googleId,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      profileImageUrl: profile.profileImageUrl,
      isPremium: false,
    })
    .returning();

  const newUser = newUsers[0];
  return {
    id: newUser.id,
    email: newUser.email,
    firstName: newUser.firstName,
    lastName: newUser.lastName,
    profileImageUrl: newUser.profileImageUrl,
    isPremium: newUser.isPremium,
  };
}

const electronAuthCodes = new Map<string, { userId: string; createdAt: number }>();
const ELECTRON_CODE_TTL = 120_000; // 2 minutes

export function generateElectronCode(userId: string): string {
  const code = Buffer.from(JSON.stringify({
    id: userId,
    ts: Date.now(),
    r: Math.random().toString(36).slice(2),
  })).toString('base64url');
  electronAuthCodes.set(code, { userId, createdAt: Date.now() });
  // Clean up expired codes periodically
  for (const [key, val] of electronAuthCodes) {
    if (Date.now() - val.createdAt > ELECTRON_CODE_TTL) {
      electronAuthCodes.delete(key);
    }
  }
  return code;
}

function consumeElectronCode(code: string): string | null {
  const entry = electronAuthCodes.get(code);
  if (!entry) return null;
  electronAuthCodes.delete(code); // single use
  if (Date.now() - entry.createdAt > ELECTRON_CODE_TTL) return null;
  return entry.userId;
}

export function setupGoogleAuth(app: Express): void {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    console.warn("[AUTH] Google OAuth not configured - missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  }

  app.set("trust proxy", 1);

  const sessionTtl = 7 * 24 * 60 * 60 * 1000;

  let sessionStore: session.Store;

  if (isNoDbMode || !process.env.DATABASE_URL) {
    const MemStore = MemoryStore(session);
    sessionStore = new MemStore({
      checkPeriod: sessionTtl,
    });
    console.log("[AUTH] Using memory session store (NO-DB mode)");
  } else {
    const pgStore = connectPg(session);
    sessionStore = new pgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: false,
      ttl: sessionTtl,
      tableName: "sessions",
    });
  }

  const isProduction = process.env.NODE_ENV === "production";
  const isElectronBackend = process.env.ELECTRON_BACKEND === '1';

  const sessionCookieConfig = isElectronBackend
    ? {
        httpOnly: true,
        secure: false,
        sameSite: "lax" as const,
        maxAge: sessionTtl,
        path: "/",
      }
    : {
        httpOnly: true,
        secure: true,
        sameSite: "none" as const,
        maxAge: sessionTtl,
        path: "/",
        domain: isProduction ? ".switchcontrol.org" : undefined,
      };
  console.log('[AUTH] ===== SESSION COOKIE CONFIG =====');
  console.log('[AUTH] production:', isProduction);
  console.log('[AUTH] electronBackend:', isElectronBackend);
  console.log('[AUTH] cookie:', JSON.stringify(sessionCookieConfig));
  console.log('[AUTH] ================================');

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "switchcontrol-session-secret",
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      name: "switchcontrol.sid",
      cookie: sessionCookieConfig,
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    if (isNoDbMode || !db) {
      return done(null, {
        id,
        email: null,
        firstName: null,
        lastName: null,
        profileImageUrl: null,
        isPremium: false,
      });
    }

    try {
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (userRows.length === 0) {
        return done(null, false);
      }

      const user = userRows[0];
      done(null, {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        isPremium: user.isPremium,
      });
    } catch (error) {
      done(error, null);
    }
  });

  if (clientId && clientSecret) {
    const isProduction = process.env.NODE_ENV === "production";
    const productionDomain = "https://switchcontrol.org";
    
    let callbackURL: string;
    if (redirectUri && redirectUri.startsWith("http")) {
      callbackURL = redirectUri;
    } else if (isProduction) {
      callbackURL = `${productionDomain}/api/auth/google/callback`;
    } else {
      callbackURL = "/api/auth/google/callback";
    }
    
    console.log("[AUTH] Google OAuth callback URL:", callbackURL);

    passport.use(
      new GoogleStrategy(
        {
          clientID: clientId,
          clientSecret: clientSecret,
          callbackURL: callbackURL,
          scope: ["profile", "email"],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value || null;
            const user = await findOrCreateUser({
              googleId: profile.id,
              email,
              firstName: profile.name?.givenName || null,
              lastName: profile.name?.familyName || null,
              profileImageUrl: profile.photos?.[0]?.value || null,
            });
            done(null, user);
          } catch (error) {
            done(error as Error, undefined);
          }
        }
      )
    );
  }

  // OAuth success page for Electron - shows message and tries to close tab
  app.get("/auth/desktop-success", (req, res) => {
    const code = req.query.code as string;
    const provider = req.query.provider as string || 'google';
    
    if (!code) {
      return res.status(400).send("Missing authentication code");
    }
    
    const deepLink = `switchcontrol://auth/callback?code=${encodeURIComponent(code)}&provider=${provider}`;
    
    console.log(`[AUTH] ===== DESKTOP SUCCESS PAGE =====`);
    console.log(`[AUTH] provider: ${provider}`);
    console.log(`[AUTH] deepLink: switchcontrol://auth/callback?code=***&provider=${provider}`);
    console.log(`[AUTH] Page will auto-launch app via deep link`);
    console.log(`[AUTH] ===================================`);
    
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Returning to SwitchControl</title>
        <link rel="icon" href="/favicon.ico">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            min-height: 100vh;
            background: #0a0a0f;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            overflow: hidden;
          }
          .container {
            text-align: center;
            padding: 3rem 3.5rem;
            animation: fadeIn 0.5s ease-out;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .spinner-wrap {
            width: 56px;
            height: 56px;
            margin: 0 auto 2rem;
            position: relative;
          }
          .spinner-ring {
            position: absolute;
            inset: 0;
            border-radius: 50%;
            border: 2px solid rgba(139, 92, 246, 0.1);
          }
          .spinner-arc {
            position: absolute;
            inset: 0;
            border-radius: 50%;
            border: 2px solid transparent;
            border-top-color: rgba(139, 92, 246, 0.7);
            animation: spin 1.2s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          h1 {
            color: rgba(255, 255, 255, 0.85);
            font-size: 1.25rem;
            font-weight: 500;
            margin-bottom: 0.5rem;
            letter-spacing: -0.01em;
          }
          .subtitle {
            color: rgba(255, 255, 255, 0.3);
            font-size: 0.8125rem;
            letter-spacing: 0.04em;
          }
          .glow {
            position: fixed;
            width: 400px;
            height: 400px;
            background: radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%);
            pointer-events: none;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            animation: glowPulse 4s ease-in-out infinite;
          }
          @keyframes glowPulse {
            0%, 100% { opacity: 0.4; transform: translate(-50%, -50%) scale(1); }
            50% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.1); }
          }
          .brand {
            position: fixed;
            bottom: 2rem;
            left: 50%;
            transform: translateX(-50%);
            color: rgba(255, 255, 255, 0.06);
            font-size: 0.625rem;
            letter-spacing: 0.3em;
            text-transform: uppercase;
          }
          @media (prefers-reduced-motion: reduce) {
            .spinner-arc { animation-duration: 3s; }
            .glow { animation: none; opacity: 0.5; }
            .container { animation: none; }
          }
        </style>
      </head>
      <body>
        <div class="glow"></div>
        <div class="container">
          <div class="spinner-wrap">
            <div class="spinner-ring"></div>
            <div class="spinner-arc"></div>
          </div>
          <h1>Returning to SwitchControl</h1>
          <p class="subtitle">Sign-in complete</p>
        </div>
        <div class="brand">SwitchControl</div>
        <script>
          (function() {
            var deepLink = "${deepLink}";
            try {
              window.location.href = deepLink;
            } catch (e) {
              console.error("[DesktopReturn] Deep link failed:", e);
            }
          })();
        </script>
      </body>
      </html>
    `);
  });

  app.get("/auth/google", (req, res, next) => {
    const next_url = req.query.next as string || '/';
    const source = req.query.source as string || 'web';
    
    console.log("[AUTH] Google auth initiated - source:", source);
    
    // Set cookie to track source (survives OAuth redirect)
    // path: '/' ensures cookies are sent to /api/auth/google/callback
    res.cookie('auth_source', source, { 
      maxAge: 5 * 60 * 1000,
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
      path: '/',
    });
    res.cookie('auth_next', next_url, { 
      maxAge: 5 * 60 * 1000,
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
      path: '/',
    });
    
    passport.authenticate("google", {
      scope: ["profile", "email"],
    })(req, res, next);
  });

  app.get(
    "/api/auth/google/callback",
    (req, res, next) => {
      console.log("OAUTH CALLBACK HIT:", req.originalUrl);
      console.log("[AUTH] Cookies received:", req.cookies);
      if (!clientId || !clientSecret) {
        return res.redirect("/?error=auth_not_configured");
      }
      passport.authenticate("google", {
        failureRedirect: "/?error=auth_failed",
      })(req, res, next);
    },
    (req, res, next) => {
      const user = req.user as Express.User;
      
      // Read source from cookie
      const source = req.cookies?.auth_source || 'web';
      const nextUrl = req.cookies?.auth_next || '/';
      
      // Clear the tracking cookies (must match path/secure/sameSite from when they were set)
      res.clearCookie('auth_source', { path: '/', secure: true, sameSite: 'none' as const });
      res.clearCookie('auth_next', { path: '/', secure: true, sameSite: 'none' as const });
      
      console.log("[AUTH] Google callback - source:", source, "user:", user.id, "sessionID:", req.sessionID);
      
      if (source === 'electron') {
        const code = generateElectronCode(user.id);
        console.log("[AUTH] ===== GOOGLE CALLBACK SUCCESS (ELECTRON) =====");
        console.log("[AUTH] Generated one-time code for user:", user.id);
        const redirectUrl = `/auth/desktop-success?code=${encodeURIComponent(code)}&provider=google`;
        console.log("[AUTH] Redirecting to desktop success page:", redirectUrl);
        console.log("[AUTH] ================================================");
        return res.redirect(redirectUrl);
      } else {
        console.log("[AUTH] Web auth — redirecting to:", nextUrl);
        return res.redirect(nextUrl);
      }
    }
  );

  app.post("/auth/logout", (req, res) => {
    console.log("[AUTH] Logout requested");
    req.logout((err) => {
      if (err) {
        console.error("[AUTH] Logout error:", err);
        return res.status(500).json({ error: "Logout failed" });
      }
      req.session.destroy((sessionErr) => {
        if (sessionErr) {
          console.error("[AUTH] Session destroy error:", sessionErr);
        }
        res.clearCookie("switchcontrol.sid", { path: "/" });
        res.status(204).end();
      });
    });
  });

  if (process.env.NODE_ENV !== "production") {
    app.get("/api/debug/auth", (req, res) => {
      const cookies = req.headers.cookie || "";
      const cookieNames = cookies.split(";").map(c => c.trim().split("=")[0]).filter(Boolean);
      res.json({
        host: req.headers.host,
        origin: req.headers.origin,
        cookieNames,
        isAuthenticated: req.isAuthenticated(),
        hasUser: !!req.user,
        userId: req.user?.id || null,
        noDbMode: isNoDbMode,
      });
    });
  }

  app.get("/api/me", async (req, res) => {
    const authHeader = req.headers.authorization;
    const hasBearer = !!(authHeader && authHeader.startsWith('Bearer '));
    const hasCookie = req.isAuthenticated() && !!req.user;

    if (hasBearer) {
      const token = authHeader!.substring(7);
      console.log(`[AUTH] using JWT — token length=${token.length}`);
      const payload = verifyJwt(token);
      if (payload && payload.sub) {
        console.log(`[AUTH] JWT verified — sub=${payload.sub} exp=${payload.exp}`);
        try {
          const dbUser = await storage.getUser(payload.sub);
          if (dbUser) {
            console.log(`[AUTH] /api/me authMode=jwt loggedIn=true user=${dbUser.id} isPremium=${dbUser.isPremium} hasSeenPremiumUnlock=${dbUser.hasSeenPremiumUnlock}`);
            res.setHeader('X-Auth-Mode', 'jwt');
            return res.json({
              loggedIn: true,
              id: dbUser.id,
              email: dbUser.email,
              name: [dbUser.firstName, dbUser.lastName].filter(Boolean).join(" ") || null,
              firstName: dbUser.firstName,
              lastName: dbUser.lastName,
              avatar: dbUser.profileImageUrl,
              isPremium: dbUser.isPremium || false,
              hasSeenPremiumUnlock: dbUser.hasSeenPremiumUnlock || false,
              hasSeenPremiumTour: dbUser.hasSeenPremiumTour || false,
              authMode: 'jwt',
            });
          }
          console.log(`[AUTH] JWT valid but user not found in DB — sub=${payload.sub}`);
        } catch (err) {
          console.error('[AUTH] /api/me jwt DB lookup error:', err);
        }
      } else {
        console.log(`[AUTH] JWT verification failed — token rejected`);
      }
      console.log(`[AUTH] /api/me authMode=jwt loggedIn=false`);
      res.setHeader('X-Auth-Mode', 'jwt');
      return res.json({ loggedIn: false, isPremium: false, hasSeenPremiumUnlock: false, hasSeenPremiumTour: false, authMode: 'jwt' });
    }

    if (hasCookie) {
      const dbUser = await storage.getUser(req.user!.id);
      console.log(`[AUTH] using cookie — user=${req.user!.id} isPremium=${dbUser?.isPremium}`);
      console.log(`[AUTH] /api/me authMode=cookie loggedIn=true user=${req.user!.id} hasSeenPremiumUnlock=${dbUser?.hasSeenPremiumUnlock}`);
      res.setHeader('X-Auth-Mode', 'cookie');
      return res.json({
        loggedIn: true,
        id: req.user!.id,
        email: req.user!.email,
        name: [req.user!.firstName, req.user!.lastName].filter(Boolean).join(" ") || null,
        firstName: req.user!.firstName,
        lastName: req.user!.lastName,
        avatar: req.user!.profileImageUrl,
        isPremium: dbUser?.isPremium || false,
        hasSeenPremiumUnlock: dbUser?.hasSeenPremiumUnlock || false,
        hasSeenPremiumTour: dbUser?.hasSeenPremiumTour || false,
        authMode: 'cookie',
      });
    }

    console.log(`[AUTH] no auth provided — returning loggedIn=false`);
    res.setHeader('X-Auth-Mode', 'none');
    return res.json({ loggedIn: false, isPremium: false, hasSeenPremiumUnlock: false, hasSeenPremiumTour: false, authMode: 'none' });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (req.isAuthenticated() && req.user) {
      const dbUser = await storage.getUser(req.user.id);
      return res.json({
        loggedIn: true,
        id: req.user.id,
        email: req.user.email,
        name: [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || null,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        avatar: req.user.profileImageUrl,
        isPremium: dbUser?.isPremium || false,
        hasSeenPremiumUnlock: dbUser?.hasSeenPremiumUnlock || false,
        hasSeenPremiumTour: dbUser?.hasSeenPremiumTour || false,
      });
    }
    return res.json({ loggedIn: false, isPremium: false, hasSeenPremiumUnlock: false, hasSeenPremiumTour: false });
  });

  app.post("/api/premium/unlock-seen", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      let userId: string | null = null;
      let authMode = 'none';

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const payload = verifyJwt(authHeader.substring(7));
        if (payload?.sub) {
          userId = payload.sub;
          authMode = 'jwt';
        }
      } else if (req.isAuthenticated() && req.user) {
        userId = req.user.id;
        authMode = 'cookie';
      }

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const dbUser = await storage.getUser(userId);
      if (!dbUser) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!dbUser.isPremium) {
        return res.status(400).json({ error: "User is not premium" });
      }

      if (!dbUser.hasSeenPremiumUnlock) {
        await storage.markPremiumUnlockSeen(userId);
        console.log(`[PremiumUnlock] mark seen user=${userId} authMode=${authMode}`);
      } else {
        console.log(`[PremiumUnlock] already seen user=${userId} authMode=${authMode} (idempotent)`);
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('[PremiumUnlock] error:', err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/premium/tour-seen", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      let userId: string | null = null;
      let authMode = 'none';

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const payload = verifyJwt(authHeader.substring(7));
        if (payload?.sub) {
          userId = payload.sub;
          authMode = 'jwt';
        }
      } else if (req.isAuthenticated() && req.user) {
        userId = req.user.id;
        authMode = 'cookie';
      }

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const dbUser = await storage.getUser(userId);
      if (!dbUser) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!dbUser.isPremium) {
        return res.status(400).json({ error: "User is not premium" });
      }

      if (!dbUser.hasSeenPremiumTour) {
        await storage.markPremiumTourSeen(userId);
        console.log(`[PremiumTour] mark tour seen user=${userId} authMode=${authMode}`);
      } else {
        console.log(`[PremiumTour] already seen user=${userId} authMode=${authMode} (idempotent)`);
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error('[PremiumTour] error:', err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/debug/user-flags", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      let userId: string | null = null;
      let authMode = 'none';

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const payload = verifyJwt(authHeader.substring(7));
        if (payload?.sub) {
          userId = payload.sub;
          authMode = 'jwt';
        }
      } else if (req.isAuthenticated() && req.user) {
        userId = req.user.id;
        authMode = 'cookie';
      }

      if (!userId) {
        return res.json({ userId: null, isPremium: false, hasSeenPremiumUnlock: false, authMode });
      }

      const dbUser = await storage.getUser(userId);
      return res.json({
        userId: dbUser?.id || null,
        isPremium: dbUser?.isPremium || false,
        hasSeenPremiumUnlock: dbUser?.hasSeenPremiumUnlock || false,
        premiumFirstSeenAt: dbUser?.premiumFirstSeenAt || null,
        authMode,
      });
    } catch (err) {
      console.error('[Debug] user-flags error:', err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/debug/authMode", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const payload = verifyJwt(authHeader.substring(7));
      if (payload?.sub) {
        return res.json({ authMode: 'jwt', loggedIn: true, userId: payload.sub });
      }
      return res.json({ authMode: 'jwt', loggedIn: false, userId: null });
    }
    if (req.isAuthenticated() && req.user) {
      return res.json({ authMode: 'cookie', loggedIn: true, userId: req.user.id });
    }
    return res.json({ authMode: 'none', loggedIn: false, userId: null });
  });

  app.post("/api/auth/exchange", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
      }

      const code = authHeader.substring(7);
      
      // Try one-time code first (new secure flow)
      let userId = consumeElectronCode(code);
      
      // Fallback: try legacy base64 token for backward compatibility
      if (!userId) {
        try {
          const decoded = JSON.parse(Buffer.from(code, 'base64').toString('utf-8'));
          if (decoded.id && decoded.ts) {
            const tokenAge = Date.now() - decoded.ts;
            if (tokenAge <= 5 * 60 * 1000) {
              userId = decoded.id;
              console.log('[AUTH] Exchange using legacy base64 token for user:', userId);
            } else {
              return res.status(401).json({ success: false, error: 'Token expired' });
            }
          }
        } catch {
          return res.status(401).json({ success: false, error: 'Invalid or already-used code' });
        }
      } else {
        console.log('[AUTH] Exchange using one-time code for user:', userId);
      }

      if (!userId) {
        return res.status(401).json({ success: false, error: 'Invalid or expired code' });
      }

      let user: Express.User;
      if (isNoDbMode || !db) {
        user = {
          id: userId,
          email: null,
          firstName: null,
          lastName: null,
          profileImageUrl: null,
          isPremium: false,
        };
      } else {
        const userRows = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (userRows.length === 0) {
          return res.status(401).json({ success: false, error: 'User not found' });
        }

        const dbUser = userRows[0];
        user = {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          profileImageUrl: dbUser.profileImageUrl,
          isPremium: dbUser.isPremium,
        };
      }

      req.login(user, (err) => {
        if (err) {
          console.error('[AUTH] Login failed during exchange:', err);
          return res.status(500).json({ success: false, error: 'Session creation failed' });
        }

        console.log('[AUTH] Token exchange successful for user:', user.id);
        console.log('[AUTH] req.headers.origin:', req.headers.origin || 'NONE');

        const jwtToken = signJwt(user.id);
        console.log(`[JWT] issued for user: ${user.id}`);

        return res.json({
          success: true,
          jwt: jwtToken,
          user: {
            id: user.id,
            email: user.email,
            name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
            firstName: user.firstName,
            lastName: user.lastName,
            avatar: user.profileImageUrl,
            isPremium: user.isPremium,
          }
        });
      });
    } catch (error) {
      console.error('[AUTH] Exchange error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

export const requirePremium: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  try {
    const dbUser = await storage.getUser(req.user.id);
    if (!dbUser?.isPremium) {
      return res.status(403).json({ 
        message: "Premium required", 
        error: "premium_required",
        upgradeUrl: "/pricing" 
      });
    }
    return next();
  } catch (error) {
    return res.status(500).json({ message: "Failed to verify premium status" });
  }
};
