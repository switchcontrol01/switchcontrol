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
    
    const providerLabel = provider === 'discord' ? 'Discord' : 'Google';
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Signed in — SwitchControl</title>
  <link rel="icon" href="/favicon.ico">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      min-height: 100vh;
      background: #07090D;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
      color: #fff;
    }

    /* ── Atmospheric hazes ───────────────────────────────────────── */
    .haze {
      position: fixed;
      border-radius: 50%;
      pointer-events: none;
      filter: blur(90px);
    }
    .haze-violet {
      width: 72vw; height: 72vw;
      top: -10%; left: -12%;
      background: radial-gradient(ellipse, rgba(139,92,246,0.30) 0%, rgba(80,40,180,0.10) 45%, transparent 70%);
      animation: drift1 16s ease-in-out infinite;
    }
    .haze-cyan {
      width: 62vw; height: 62vw;
      bottom: -8%; right: -8%;
      background: radial-gradient(ellipse, rgba(0,190,255,0.24) 0%, rgba(0,120,210,0.08) 48%, transparent 70%);
      filter: blur(100px);
      animation: drift2 19s ease-in-out infinite;
    }
    .haze-amber {
      width: 44vw; height: 44vw;
      bottom: 12%; left: 22%;
      background: radial-gradient(ellipse, rgba(236,72,153,0.14) 0%, transparent 68%);
      filter: blur(80px);
      animation: drift3 22s ease-in-out infinite;
    }
    @keyframes drift1 {
      0%,100% { transform: translate(0,0) scale(1); opacity: .55; }
      50%      { transform: translate(22px,14px) scale(1.07); opacity: .88; }
    }
    @keyframes drift2 {
      0%,100% { transform: translate(0,0) scale(1); opacity: .45; }
      50%      { transform: translate(-18px,-12px) scale(1.10); opacity: .80; }
    }
    @keyframes drift3 {
      0%,100% { transform: translate(0,0) scale(1); opacity: .30; }
      50%      { transform: translate(12px,0) scale(1.12); opacity: .60; }
    }

    /* ── Sun streaks ─────────────────────────────────────────────── */
    .streaks { position: fixed; inset: 0; overflow: hidden; pointer-events: none; }
    .streak {
      position: absolute;
      height: 1px;
      transform-origin: left center;
    }
    .streak-1 {
      width: 150vw; left: 5%; top: 20%;
      background: linear-gradient(90deg, transparent, rgba(168,85,247,0.20), transparent);
      transform: rotate(24deg);
      animation: streakPulse 9s ease-in-out infinite;
      filter: blur(1px);
    }
    .streak-2 {
      width: 130vw; left: 10%; top: 42%;
      height: 1.5px;
      background: linear-gradient(90deg, transparent, rgba(0,200,255,0.16), transparent);
      transform: rotate(20deg);
      animation: streakPulse 11s ease-in-out infinite 1.4s;
      filter: blur(1.2px);
    }
    .streak-3 {
      width: 120vw; left: 0%; top: 65%;
      background: linear-gradient(90deg, transparent, rgba(200,130,255,0.12), transparent);
      transform: rotate(18deg);
      animation: streakPulse 13s ease-in-out infinite 3s;
      filter: blur(0.8px);
    }
    @keyframes streakPulse {
      0%,100% { opacity: 0; }
      30%,70%  { opacity: 1; }
    }

    /* ── Vignette ────────────────────────────────────────────────── */
    .vignette {
      position: fixed; inset: 0; pointer-events: none;
      background: radial-gradient(ellipse 80% 80% at 50% 50%, transparent 32%, rgba(7,9,13,0.90) 100%);
    }

    /* ── Center content ──────────────────────────────────────────── */
    .content {
      position: relative;
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
      animation: contentIn 0.9s cubic-bezier(0.22,1,0.36,1) both;
    }
    @keyframes contentIn {
      from { opacity: 0; transform: translateY(20px); filter: blur(12px); }
      to   { opacity: 1; transform: translateY(0);    filter: blur(0); }
    }

    /* Check mark glow orb */
    .orb-wrap {
      position: relative;
      width: 120px; height: 120px;
      margin-bottom: 2.5rem;
    }
    .orb-halo {
      position: absolute;
      inset: -36px;
      border-radius: 50%;
      background: radial-gradient(ellipse, rgba(139,92,246,0.42) 0%, rgba(0,200,255,0.16) 44%, transparent 72%);
      filter: blur(22px);
      animation: haloPulse 3.2s ease-in-out infinite;
    }
    @keyframes haloPulse {
      0%,100% { opacity: .55; transform: scale(1); }
      50%      { opacity: .95; transform: scale(1.18); }
    }
    .orb-ring {
      position: absolute;
      inset: -10px;
      border-radius: 50%;
      border: 1px solid rgba(168,85,247,0.30);
      box-shadow: 0 0 28px rgba(139,92,246,0.20), 0 0 60px rgba(0,210,255,0.10);
      animation: ringPulse 3.8s ease-in-out infinite;
    }
    @keyframes ringPulse {
      0%,100% { opacity: .35; }
      50%      { opacity: .80; }
    }
    .orb-body {
      position: absolute; inset: 0;
      border-radius: 50%;
      background: radial-gradient(ellipse at 38% 35%, rgba(168,85,247,0.28) 0%, rgba(0,0,20,0.60) 70%);
      border: 1px solid rgba(255,255,255,0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
    }
    .check-icon {
      width: 48px; height: 48px;
      animation: checkIn 0.6s cubic-bezier(0.22,1,0.36,1) 0.5s both;
    }
    @keyframes checkIn {
      from { opacity: 0; transform: scale(0.5); }
      to   { opacity: 1; transform: scale(1); }
    }
    .check-path {
      stroke: url(#checkGrad);
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      stroke-dasharray: 40;
      stroke-dashoffset: 40;
      animation: drawCheck 0.55s ease-out 0.55s forwards;
    }
    @keyframes drawCheck {
      to { stroke-dashoffset: 0; }
    }

    /* Typography */
    .wordmark {
      font-size: 2.25rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      margin-bottom: 0.6rem;
      background: linear-gradient(90deg, #fff 30%, rgba(168,85,247,0.9) 60%, rgba(0,210,255,0.85) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .headline {
      font-size: 1.05rem;
      font-weight: 400;
      color: rgba(255,255,255,0.70);
      letter-spacing: -0.005em;
      margin-bottom: 0.4rem;
    }
    .sub {
      font-size: 0.8125rem;
      color: rgba(255,255,255,0.28);
      letter-spacing: 0.02em;
      margin-bottom: 2.5rem;
    }
    .provider-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      color: rgba(255,255,255,0.30);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 100px;
      padding: 0.25rem 0.75rem;
      margin-bottom: 2.8rem;
      letter-spacing: 0.02em;
    }
    .provider-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: rgba(139,92,246,0.7);
      box-shadow: 0 0 6px rgba(139,92,246,0.50);
    }

    /* Progress bar */
    .progress-wrap {
      width: 200px;
      height: 1.5px;
      background: rgba(255,255,255,0.06);
      border-radius: 100px;
      overflow: hidden;
      position: relative;
    }
    .progress-fill {
      height: 100%;
      border-radius: 100px;
      background: linear-gradient(90deg, rgba(139,92,246,0.80), rgba(0,210,255,0.90));
      box-shadow: 0 0 8px rgba(139,92,246,0.55);
      animation: progressGrow 3.8s cubic-bezier(0.25,0.46,0.45,0.94) 0.2s both;
    }
    @keyframes progressGrow {
      from { width: 0%; }
      to   { width: 100%; }
    }
    .progress-gleam {
      position: absolute;
      top: 0; height: 100%;
      width: 48px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
      animation: gleam 1.4s ease-in-out infinite 0.4s;
    }
    @keyframes gleam {
      from { left: -48px; }
      to   { left: 248px; }
    }
    .opening-label {
      margin-top: 1.1rem;
      font-size: 0.6875rem;
      color: rgba(255,255,255,0.20);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      animation: blink 2s ease-in-out infinite;
    }
    @keyframes blink {
      0%,100% { opacity: .5; }
      50%      { opacity: 1; }
    }
  </style>
</head>
<body>
  <!-- Atmosphere -->
  <div class="haze haze-violet"></div>
  <div class="haze haze-cyan"></div>
  <div class="haze haze-amber"></div>
  <div class="streaks">
    <div class="streak streak-1"></div>
    <div class="streak streak-2"></div>
    <div class="streak streak-3"></div>
  </div>
  <div class="vignette"></div>

  <!-- Content -->
  <div class="content">
    <!-- Check orb -->
    <div class="orb-wrap">
      <div class="orb-halo"></div>
      <div class="orb-ring"></div>
      <div class="orb-body">
        <svg class="check-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="checkGrad" x1="8" y1="24" x2="40" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#a78bfa"/>
              <stop offset="100%" stop-color="#22d3ee"/>
            </linearGradient>
          </defs>
          <polyline class="check-path" points="10,26 20,36 38,14"/>
        </svg>
      </div>
    </div>

    <p class="wordmark">SwitchControl</p>
    <p class="headline">You're signed in.</p>
    <p class="sub">Opening the app&hellip;</p>

    <div class="provider-chip">
      <span class="provider-dot"></span>
      via ${providerLabel}
    </div>

    <div class="progress-wrap">
      <div class="progress-fill"></div>
      <div class="progress-gleam"></div>
    </div>
    <p class="opening-label">Launching</p>
  </div>

  <script>
    (function() {
      var deepLink = "${deepLink}";
      try { window.location.href = deepLink; } catch(e) {}
    })();
  </script>
</body>
</html>`);
  });

  app.get("/auth/google", (req, res, next) => {
    const next_url = req.query.next as string || '/';
    const source = req.query.source as string || 'web';
    
    console.log("[AUTH] Google auth initiated - source:", source);
    
    // Set cookie to track source (survives OAuth redirect)
    // path: '/' ensures cookies are sent to /api/auth/google/callback
    const isElectronBE = process.env.ELECTRON_BACKEND === '1';
    const authCookieOpts = {
      maxAge: 5 * 60 * 1000,
      httpOnly: true,
      secure: !isElectronBE,
      sameSite: (isElectronBE ? 'lax' : 'none') as 'lax' | 'none',
      path: '/',
    };
    res.cookie('auth_source', source, authCookieOpts);
    res.cookie('auth_next', next_url, authCookieOpts);
    
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
      const isElectronBE = process.env.ELECTRON_BACKEND === '1';
      const clearOpts = { path: '/', secure: !isElectronBE, sameSite: (isElectronBE ? 'lax' : 'none') as 'lax' | 'none' };
      res.clearCookie('auth_source', clearOpts);
      res.clearCookie('auth_next', clearOpts);
      
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
