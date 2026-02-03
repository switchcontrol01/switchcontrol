import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const AUTH_TOKEN_KEY = "sc_auth_token_v1";
const AUTH_USER_KEY = "sc_auth_user_v1";
const AUTH_DOMAIN = "https://switchcontrol.org";

interface AuthUser {
  id: string;
  email: string | null;
  username: string | null;
  avatarUrl: string | null;
  plan: string;
  isPremium: boolean;
}

interface LoginProps {
  onLoginSuccess: () => void;
}

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
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  );
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [isLoading, setIsLoading] = useState<"google" | "discord" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (provider: "discord") => {
    setIsLoading(provider);
    setError(null);
    
    const isElectron = typeof window !== 'undefined' && (window as any).electron?.openExternal;
    
    if (isElectron) {
      const authUrl = `${AUTH_DOMAIN}/auth/${provider}?redirect=switchcontrol://auth/success`;
      console.log('[Login] Opening external auth URL:', authUrl);
      try {
        await (window as any).electron.openExternal(authUrl);
      } catch (err) {
        console.error('[Login] Failed to open auth URL:', err);
        setError("Failed to open browser. Please try again.");
        setIsLoading(null);
      }
    } else {
      window.location.href = `${AUTH_DOMAIN}/auth/${provider}`;
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] overflow-hidden flex items-center justify-center">
      <div 
        className="absolute inset-0 overflow-hidden pointer-events-none" 
        style={{ transform: 'rotate(-12deg) scale(1.4)' }}
      >
        <div className="absolute inset-0 login-contour-drift" style={{ opacity: 0.08 }}>
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="loginTopo" x="0" y="0" width="200" height="150" patternUnits="userSpaceOnUse">
                <path d="M0 50 Q50 25 100 50 T200 50" fill="none" stroke="hsl(270 50% 45%)" strokeWidth="0.6" opacity="0.5"/>
                <path d="M0 100 Q50 75 100 100 T200 100" fill="none" stroke="hsl(275 45% 50%)" strokeWidth="0.5" opacity="0.4"/>
              </pattern>
            </defs>
            <rect width="300%" height="300%" x="-100%" y="-100%" fill="url(#loginTopo)"/>
          </svg>
        </div>
      </div>

      <div className="absolute inset-0 bg-gradient-radial from-transparent via-[#0a0a0f]/50 to-[#0a0a0f] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="bg-card/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center gap-6 mb-8">
            <img
              src="/logo.png"
              alt="SwitchControl"
              className="w-20 h-20 max-w-[80px] max-h-[80px] object-contain rounded-[20px]"
            />
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white mb-2">Welcome to SwitchControl</h1>
              <p className="text-muted-foreground text-sm">Sign in to optimize your gaming experience</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={() => handleLogin("discord")}
                disabled={isLoading !== null}
                className="w-full h-12 bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium rounded-xl transition-all duration-200"
                data-testid="button-login-discord"
              >
                {isLoading === "discord" ? (
                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <DiscordIcon className="w-5 h-5 mr-3" />
                    Continue with Discord
                  </>
                )}
              </Button>
            </motion.div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </motion.div>
    </div>
  );
}
