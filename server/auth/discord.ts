import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import type { Express } from "express";
import { db, isNoDbMode } from "../db";
import { users } from "@shared/models/auth";
import { eq, or } from "drizzle-orm";

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

  if (profile.email) {
    const existingByEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, profile.email))
      .limit(1);

    if (existingByEmail.length > 0) {
      const user = existingByEmail[0];
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        isPremium: user.isPremium,
      };
    }
  }

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
    console.warn("[AUTH] Discord OAuth not configured - missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET");
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
    const rawRedirect = typeof req.query.redirect === 'string' ? req.query.redirect : '';
    const rawNext = typeof req.query.next === 'string' ? req.query.next : '/download';
    
    if (rawRedirect.startsWith('switchcontrol://')) {
      (req.session as any).electronRedirect = rawRedirect;
      console.log("[AUTH] Starting Discord OAuth flow for Electron, redirect:", rawRedirect);
    } else {
      const nextUrl = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/download';
      (req.session as any).returnTo = nextUrl;
      console.log("[AUTH] Starting Discord OAuth flow, returnTo:", nextUrl);
    }
    
    passport.authenticate("discord", {
      scope: DISCORD_SCOPES,
    })(req, res, next);
  });

  app.get(
    "/api/auth/discord/callback",
    (req, res, next) => {
      passport.authenticate("discord", {
        failureRedirect: "/?error=discord_auth_failed",
      })(req, res, next);
    },
    (req, res) => {
      const electronRedirect = (req.session as any).electronRedirect;
      const returnTo = (req.session as any).returnTo || '/download';
      
      delete (req.session as any).electronRedirect;
      delete (req.session as any).returnTo;
      
      if (electronRedirect && electronRedirect.startsWith('switchcontrol://')) {
        const user = req.user as Express.User;
        const token = Buffer.from(JSON.stringify({
          id: user.id,
          ts: Date.now(),
        })).toString('base64');
        
        const deepLinkUrl = `switchcontrol://auth/success?token=${encodeURIComponent(token)}&provider=discord`;
        console.log("[AUTH] Discord OAuth callback successful, redirecting to Electron:", deepLinkUrl);
        res.redirect(deepLinkUrl);
      } else {
        console.log("[AUTH] Discord OAuth callback successful, redirecting to:", returnTo);
        res.redirect(returnTo);
      }
    }
  );

  console.log("[AUTH] Discord OAuth configured with callback:", callbackURL);
}
