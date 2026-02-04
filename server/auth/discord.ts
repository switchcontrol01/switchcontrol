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
    const next_url = req.query.next as string || '/';
    const source = req.query.source as string || 'web';
    
    console.log("[AUTH] Discord auth initiated - source:", source);
    
    // Set cookie to track source (survives OAuth redirect)
    res.cookie('auth_source', source, { 
      maxAge: 5 * 60 * 1000, // 5 minutes
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    res.cookie('auth_next', next_url, { 
      maxAge: 5 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    
    passport.authenticate("discord", {
      scope: DISCORD_SCOPES,
    })(req, res, next);
  });

  app.get(
    "/api/auth/discord/callback",
    (req, res, next) => {
      console.log("OAUTH CALLBACK HIT:", req.originalUrl);
      console.log("[AUTH] Cookies received:", req.cookies);
      passport.authenticate("discord", {
        failureRedirect: "/?error=discord_auth_failed",
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
      
      console.log("[AUTH] Discord callback - source:", source, "user:", user.id);
      
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
              `/auth/success?token=${encodeURIComponent(token)}&provider=discord`
            );
          } else {
            console.log("REDIRECTING TO WEBSITE:", nextUrl);
            return res.redirect(nextUrl);
          }
        });
      });
    }
  );

  console.log("[AUTH] Discord OAuth configured with callback:", callbackURL);
}
