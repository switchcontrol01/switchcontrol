import { Link, useSearch } from "wouter";
import { brand } from "@/config/brand";
import { motion } from "@/lib/motion";
import { LoginParticles } from "@/components/LoginParticles";
import { SpotlightCursor } from "@/components/SpotlightCursor";
import { WebsiteShell } from "@/components/website/WebsiteShell";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  );
}

export default function Login() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const rawNext = params.get('next') || '/download';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/download';
  const googleAuthUrl = `/auth/google?next=${encodeURIComponent(next)}`;
  const discordAuthUrl = `/auth/discord?next=${encodeURIComponent(next)}`;

  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <WebsiteShell variant="inner" bgVariant="auth" showFooter={false}>
      {/* ── Full-screen ambient layer ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {/* Color orbs — 5 vivid clouds */}
        <div className="login-orb-1" />
        <div className="login-orb-2" />
        <div className="login-orb-3" />
        <div className="login-orb-4" />
        <div className="login-orb-5" />
        {/* Single large white sunstreak from the left — the hero beam */}
        <div className="login-sunstreak-main" />
        <div className="login-sunstreak-secondary" />
        <LoginParticles />
        <SpotlightCursor />
      </div>

      <main className="flex-1 flex items-center justify-center p-4 min-h-[calc(100vh-80px)] relative z-10">
        {/* Aura behind card */}
        <div className="login-card-aura" aria-hidden="true" />

        {/* Card entrance — spring up, scale, blur clears, then floats */}
        <motion.div
          className="w-full max-w-md relative z-10"
          initial={{ opacity: 0, y: 52, scale: 0.88, filter: "blur(22px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.85, ease }}
        >
          {/* Continuous gentle float after entry */}
          <div className="login-card-float">
          <div className="login-card-glass rounded-2xl overflow-hidden">

            {/* ── Header ── */}
            <div className="p-6 sm:p-8 text-center border-b border-white/[0.08]">

              {/* Logo — spring bounce in */}
              <motion.div
                className="flex justify-center mb-5"
                initial={{ opacity: 0, y: -30, scale: 0.45 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.22, duration: 0.60, type: "spring", stiffness: 300, damping: 17 }}
              >
                <div className="relative">
                  <img
                    src={brand.icon}
                    alt={`${brand.name} logo`}
                    className="w-16 h-16 rounded-xl relative z-10 shadow-lg"
                  />
                  <div className="login-icon-halo" />
                </div>
              </motion.div>

              {/* Title */}
              <motion.h1
                className="text-2xl font-bold login-title-gradient"
                data-testid="text-login-title"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.40, duration: 0.55, ease }}
              >
                Welcome to {brand.name}
              </motion.h1>

              {/* Subtitle */}
              <motion.p
                className="text-sm text-white/50 mt-1.5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.52, duration: 0.50, ease }}
              >
                Sign in to access your optimization dashboard
              </motion.p>
            </div>

            {/* ── Body ── */}
            <div className="p-6 sm:p-8 space-y-3.5">
              <motion.p
                className="text-sm text-center text-white/40 mb-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.62, duration: 0.45 }}
              >
                Sign in securely with your preferred account
              </motion.p>

              {/* Google */}
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.70, duration: 0.50, ease }}
              >
                <a href={googleAuthUrl} className="block">
                  <button
                    className="login-btn-google w-full h-14 text-base font-medium rounded-xl flex items-center justify-center gap-3 transition-all duration-200 hover:scale-[1.018] active:scale-[0.99] cursor-pointer"
                    data-testid="button-login-google"
                  >
                    <GoogleIcon className="size-5" />
                    Continue with Google
                  </button>
                </a>
              </motion.div>

              {/* Discord */}
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.83, duration: 0.50, ease }}
              >
                <a href={discordAuthUrl} className="block">
                  <button
                    className="login-btn-discord w-full h-14 text-base font-medium rounded-xl flex items-center justify-center gap-3 transition-all duration-200 hover:scale-[1.018] active:scale-[0.99] cursor-pointer"
                    data-testid="button-login-discord"
                  >
                    <DiscordIcon className="size-5" />
                    Continue with Discord
                  </button>
                </a>
              </motion.div>

              {/* Footer copy */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.0, duration: 0.5 }}
                className="pt-2"
              >
                <p className="text-xs text-center text-white/32 mt-4">
                  Your data is protected and never shared.
                </p>
                <p className="text-xs text-white/28 text-center mt-2">
                  By continuing, you agree to our{" "}
                  <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
                  {" "}and{" "}
                  <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
                </p>
              </motion.div>
            </div>
          </div>
          </div>
        </motion.div>
      </main>
    </WebsiteShell>
  );
}
