import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import type { Express } from "express";
import { db, isNoDbMode } from "../db";
import { users } from "@shared/models/auth";
import { eq, or } from "drizzle-orm";
import { generateElectronCode, storePollCode } from "./google";

function isSafeRedirectUrl(url: string): boolean {
  if (!url) return false;
  return url.startsWith('/') && !url.startsWith('//');
}

const DISCORD_SCOPES = ["identify", "email"];

async function findOrCreateDiscordUser(profile: {
  discordId: string;
  email: string | null;
  username: string;
  discriminator: string;
  avatar: string | null;
}): Promise<Express.User> {
  if (isNoDbMode || !db) {
    const avatarUrl = profile.avatar 
      ? `https://cdn.discordapp.com/avatars/${profile.discordId}/${profile.avatar}.png`
      : null;
    return {
      id: `mock-discord-${profile.discordId}`,
      email: profile.email,
      firstName: profile.username,
      lastName: null,
      profileImageUrl: avatarUrl,
      isPremium: false,
    };
  }

  const existingByDiscord = await db
    .select()
    .from(users)
    .where(eq(users.providerUserId, profile.discordId))
    .limit(1);

  if (existingByDiscord.length > 0 && existingByDiscord[0].provider === "discord") {
    const user = existingByDiscord[0];
    await db
      .update(users)
      .set({
        email: profile.email,
        firstName: profile.username,
        profileImageUrl: profile.avatar 
          ? `https://cdn.discordapp.com/avatars/${profile.discordId}/${profile.avatar}.png`
          : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return {
      id: user.id,
      email: profile.email,
      firstName: profile.username,
      lastName: null,
      profileImageUrl: profile.avatar 
        ? `https://cdn.discordapp.com/avatars/${profile.discordId}/${profile.avatar}.png`
        : null,
      isPremium: user.isPremium,
    };
  }

  // ── Email-based cross-provider auto-linking is intentionally NOT performed ──
  // Matching by email alone is an account-takeover vector: an attacker who
  // registers a Discord account with a victim's email address would silently
  // receive the victim's full session and premium entitlement. Discord does not
  // guarantee email ownership (verified flag exists but is not enforced by all
  // accounts), and SwitchControl has no re-auth confirmation step to prove the
  // Discord user also owns the existing account.
  //
  // Google's findOrCreateUser correctly matches only by googleId — never bare
  // email. Discord follows the same pattern: if no providerUserId match exists
  // above, this is a brand-new account. Cross-provider linking (e.g. "connect
  // your Discord to your Google account") must be an explicit re-authenticated
  // flow, not a silent background merge.

  const avatarUrl = profile.avatar 
    ? `https://cdn.discordapp.com/avatars/${profile.discordId}/${profile.avatar}.png`
    : null;

  const newUsers = await db
    .insert(users)
    .values({
      provider: "discord",
      providerUserId: profile.discordId,
      email: profile.email,
      firstName: profile.username,
      lastName: null,
      profileImageUrl: avatarUrl,
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

export function setupDiscordAuth(app: Express): void {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    const isElectron = process.env.ELECTRON_BACKEND === '1';
    if (isElectron) {
      console.log("[AUTH] Discord OAuth not configured on local backend — expected in Electron mode (auth handled by cloud server).");
    } else {
      console.warn("[AUTH] Discord OAuth not configured - missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET");
    }
    return;
  }

  const callbackURL = process.env.NODE_ENV === "production"
    ? "https://switchcontrol.org/api/auth/discord/callback"
    : "/api/auth/discord/callback";

  passport.use(
    new DiscordStrategy(
      {
        clientID: clientId,
        clientSecret: clientSecret,
        callbackURL: callbackURL,
        scope: DISCORD_SCOPES,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await findOrCreateDiscordUser({
            discordId: profile.id,
            email: profile.email || null,
            username: profile.username,
            discriminator: profile.discriminator,
            avatar: profile.avatar,
          });
          done(null, user);
        } catch (error) {
          console.error("[AUTH] Discord OAuth error:", error);
          done(error as Error, undefined);
        }
      }
    )
  );

  app.get("/auth/discord", (req, res, next) => {
    const raw_next = req.query.next as string || '/';
    const next_url = isSafeRedirectUrl(raw_next) ? raw_next : '/';
    const source = req.query.source as string || 'web';
    
    console.log("[AUTH] Discord auth initiated - source:", source);
    
    // Encode source + next in the OAuth state parameter (RFC 6749).
    // This is more reliable than cookies because some browsers with privacy/
    // tracking-protection block SameSite=None cookies on cross-domain redirects.
    // State is carried in the URL so it always arrives at the callback intact.
    const rawPollToken = req.query.pollToken as string | undefined;
    const pollToken = (rawPollToken && /^[a-zA-Z0-9_-]{16,64}$/.test(rawPollToken)) ? rawPollToken : undefined;
    const statePayload = Buffer.from(JSON.stringify({ source, next: next_url, pollToken })).toString('base64url');

    // Also set cookies as a belt-and-suspenders fallback for older installs.
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
    if (pollToken) res.cookie('auth_poll_token', pollToken, authCookieOpts);

    passport.authenticate("discord", {
      scope: DISCORD_SCOPES,
      state: statePayload,
    } as any)(req, res, next);
  });

  app.get(
    "/api/auth/discord/callback",
    (req, res, next) => {
      console.log("OAUTH CALLBACK HIT:", req.originalUrl);
      console.log("[AUTH] Cookies received:", req.cookies);

      // Decode source/next from OAuth state parameter before passport consumes it.
      // State is more reliable than cookies (survives privacy-mode / tracking-protection).
      try {
        const rawState = req.query.state as string;
        if (rawState) {
          const parsed = JSON.parse(Buffer.from(rawState, 'base64url').toString('utf8'));
          (req as any)._stateSource = parsed.source || 'web';
          (req as any)._stateNext = isSafeRedirectUrl(parsed.next) ? parsed.next : '/';
          (req as any)._statePollToken = (parsed.pollToken && /^[a-zA-Z0-9_-]{16,64}$/.test(parsed.pollToken)) ? parsed.pollToken : null;
          console.log("[AUTH] Discord state decoded — source:", (req as any)._stateSource);
        }
      } catch (e) {
        console.warn("[AUTH] Discord state decode failed:", e);
      }

      passport.authenticate("discord", {
        failureRedirect: "/?error=discord_auth_failed",
      })(req, res, next);
    },
    (req, res, next) => {
      const user = req.user as Express.User;
      
      // Prefer state-decoded source (survives any cookie blocking), fall back to cookie.
      const source = (req as any)._stateSource || req.cookies?.auth_source || 'web';
      const nextUrl = (req as any)._stateNext || req.cookies?.auth_next || '/';
      
      // Clear the tracking cookies (must match path/secure/sameSite from when they were set)
      const isElectronBE = process.env.ELECTRON_BACKEND === '1';
      const clearOpts = { path: '/', secure: !isElectronBE, sameSite: (isElectronBE ? 'lax' : 'none') as 'lax' | 'none' };
      res.clearCookie('auth_source', clearOpts);
      res.clearCookie('auth_next', clearOpts);
      res.clearCookie('auth_poll_token', clearOpts);

      // passport-oauth2's SessionStateStore replaces our custom state with its own
      // uid(24) — so req.query.state in the callback is never our base64url JSON and
      // _statePollToken is always null from state decoding.  Use the cookie as the
      // authoritative fallback (set in /auth/discord above).
      const rawCookiePollToken = req.cookies?.auth_poll_token as string | undefined;
      const cookiePollToken = (rawCookiePollToken && /^[a-zA-Z0-9_-]{16,64}$/.test(rawCookiePollToken))
        ? rawCookiePollToken : null;
      const resolvedPollToken = (req as any)._statePollToken || cookiePollToken;

      console.log("[AUTH] Discord callback - source:", source, "user:", user.id, "sessionID:", req.sessionID, "pollToken:", resolvedPollToken ? "present" : "missing");

      if (source === 'electron') {
        const code = generateElectronCode(user.id);
        const pollToken = resolvedPollToken;
        if (pollToken) {
          storePollCode(pollToken, code);
          console.log("[AUTH] Stored code under poll token for user:", user.id);
        } else {
          console.warn("[AUTH] No poll token available — desktop polling will not complete");
        }
        console.log("[AUTH] ===== DISCORD CALLBACK SUCCESS (ELECTRON) =====");
        console.log("[AUTH] Generated one-time code for user:", user.id);
        console.log("[AUTH] Redirecting to desktop-success page (meta-refresh will open app)");
        console.log("[AUTH] ==================================================");
        return res.redirect(`/auth/desktop-success?code=${encodeURIComponent(code)}&provider=discord`);
      } else {
        const safeNextUrl = isSafeRedirectUrl(nextUrl) ? nextUrl : '/';
        console.log("[AUTH] Web auth — redirecting to:", safeNextUrl);
        return res.redirect(safeNextUrl);
      }
    }
  );

  console.log("[AUTH] Discord OAuth configured with callback:", callbackURL);
}
