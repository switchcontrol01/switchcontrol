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

  const sessionCookieConfig = {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    maxAge: sessionTtl,
    path: "/",
    domain: isProduction ? ".switchcontrol.org" : undefined,
  };
  console.log('[AUTH] ===== SESSION COOKIE CONFIG =====');
  console.log('[AUTH] production:', isProduction);
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
  app.get("/auth/success", (req, res) => {
    const token = req.query.token as string;
    const provider = req.query.provider as string || 'google';
    
    if (!token) {
      return res.status(400).send("Missing authentication token");
    }
    
    const deepLink = `switchcontrol://auth/success?token=${encodeURIComponent(token)}&provider=${provider}`;
    
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login Successful - SwitchControl</title>
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
            padding: 3rem;
            background: rgba(20, 20, 30, 0.8);
            border-radius: 1.5rem;
            border: 1px solid rgba(139, 92, 246, 0.2);
            box-shadow: 0 0 60px rgba(139, 92, 246, 0.15);
            max-width: 420px;
            animation: fadeIn 0.5s ease-out;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .checkmark {
            width: 80px;
            height: 80px;
            margin: 0 auto 1.5rem;
            background: linear-gradient(135deg, #8b5cf6, #a855f7);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: pulse 2s ease-in-out infinite;
          }
          @keyframes pulse {
            0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.4); }
            50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.6); }
          }
          .checkmark svg {
            width: 40px;
            height: 40px;
            stroke: white;
            stroke-width: 3;
            fill: none;
            animation: draw 0.6s ease-out 0.3s forwards;
            stroke-dasharray: 50;
            stroke-dashoffset: 50;
          }
          @keyframes draw {
            to { stroke-dashoffset: 0; }
          }
          h1 {
            color: white;
            font-size: 1.75rem;
            font-weight: 600;
            margin-bottom: 0.75rem;
          }
          .subtitle {
            color: #a1a1aa;
            font-size: 1rem;
            margin-bottom: 1.5rem;
            line-height: 1.5;
          }
          .hint {
            color: #71717a;
            font-size: 0.875rem;
            padding-top: 1rem;
            border-top: 1px solid rgba(255,255,255,0.1);
          }
          .glow {
            position: fixed;
            width: 400px;
            height: 400px;
            background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%);
            pointer-events: none;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            animation: glowPulse 4s ease-in-out infinite;
          }
          @keyframes glowPulse {
            0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
            50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.1); }
          }
        </style>
      </head>
      <body>
        <div class="glow"></div>
        <div class="container">
          <div class="checkmark">
            <svg viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <h1>Login Successful!</h1>
          <p class="subtitle">You've been signed in to SwitchControl.<br>Returning to the app...</p>
          <p class="hint">You can close this tab now.</p>
        </div>
        <script>
          // Redirect to the deep link to open the Electron app
          window.location.href = "${deepLink}";
          
          // Try to close the tab after a short delay
          setTimeout(function() {
            window.close();
          }, 1500);
          
          // If window.close() doesn't work, the user will see the success message
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
    res.cookie('auth_source', source, { 
      maxAge: 5 * 60 * 1000,
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
    });
    res.cookie('auth_next', next_url, { 
      maxAge: 5 * 60 * 1000,
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
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
      
      // Clear the tracking cookies
      res.clearCookie('auth_source');
      res.clearCookie('auth_next');
      
      console.log("[AUTH] Google callback - source:", source, "user:", user.id);
      
      // Session rotation to prevent session fixation attacks
      req.session.regenerate((err) => {
        if (err) {
          console.error("[AUTH] Session regenerate error:", err);
          return next(err);
        }
        
        // Re-login user after session regeneration
        req.login(user, (loginErr) => {
          if (loginErr) {
            console.error("[AUTH] Re-login after regenerate error:", loginErr);
            return next(loginErr);
          }
          
          if (source === 'electron') {
            const token = Buffer.from(JSON.stringify({
              id: user.id,
              ts: Date.now(),
            })).toString('base64');
            
            console.log("REDIRECTING TO SUCCESS PAGE (Electron)");
            return res.redirect(
              `/auth/success?token=${encodeURIComponent(token)}&provider=google`
            );
          } else {
            console.log("REDIRECTING TO WEBSITE:", nextUrl);
            return res.redirect(nextUrl);
          }
        });
      });
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
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyJwt(token);
      if (payload && payload.sub) {
        try {
          const dbUser = await storage.getUser(payload.sub);
          if (dbUser) {
            console.log(`[AUTH] /api/me authMode=jwt loggedIn=true user=${dbUser.id}`);
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
              authMode: 'jwt',
            });
          }
        } catch (err) {
          console.error('[AUTH] /api/me jwt DB lookup error:', err);
        }
      }
      console.log(`[AUTH] /api/me authMode=jwt loggedIn=false (invalid token or user not found)`);
      res.setHeader('X-Auth-Mode', 'jwt');
      return res.json({ loggedIn: false, isPremium: false, authMode: 'jwt' });
    }

    if (req.isAuthenticated() && req.user) {
      const dbUser = await storage.getUser(req.user.id);
      console.log(`[AUTH] /api/me authMode=cookie loggedIn=true user=${req.user.id}`);
      res.setHeader('X-Auth-Mode', 'cookie');
      return res.json({
        loggedIn: true,
        id: req.user.id,
        email: req.user.email,
        name: [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || null,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        avatar: req.user.profileImageUrl,
        isPremium: dbUser?.isPremium || false,
        authMode: 'cookie',
      });
    }
    console.log(`[AUTH] /api/me authMode=cookie loggedIn=false user=none`);
    res.setHeader('X-Auth-Mode', 'cookie');
    return res.json({ loggedIn: false, isPremium: false, authMode: 'cookie' });
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
      });
    }
    return res.json({ loggedIn: false, isPremium: false });
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

      const token = authHeader.substring(7);
      
      let decoded: { id: string; ts: number };
      try {
        decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
      } catch (e) {
        console.error('[AUTH] Token decode failed:', e);
        return res.status(401).json({ success: false, error: 'Invalid token format' });
      }

      if (!decoded.id) {
        return res.status(401).json({ success: false, error: 'Token missing user id' });
      }

      const tokenAge = Date.now() - (decoded.ts || 0);
      const maxAge = 5 * 60 * 1000;
      if (tokenAge > maxAge) {
        return res.status(401).json({ success: false, error: 'Token expired' });
      }

      let user: Express.User;
      if (isNoDbMode || !db) {
        user = {
          id: decoded.id,
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
          .where(eq(users.id, decoded.id))
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
        const jwtDecoded = verifyJwt(jwtToken);
        console.log(`[AUTH] exchange issued jwt userId=${user.id} exp=${jwtDecoded?.exp}`);

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
