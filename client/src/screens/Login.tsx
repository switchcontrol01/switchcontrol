import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const AUTH_DOMAIN = "https://switchcontrol.org";

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  );
}

export default function Login() {
  const [isLoading, setIsLoading] = useState<"discord" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (provider: "discord") => {
    setIsLoading(provider);
    setError(null);
    
    const isElectron = typeof window !== 'undefined' && (window as any).electron?.openExternal;
    
    if (isElectron) {
      const authUrl = `${AUTH_DOMAIN}/api/auth/${provider}`;
      console.log('[Login] Opening external auth URL:', authUrl);
      try {
        await (window as any).electron.openExternal(authUrl);
      } catch (err) {
        console.error('[Login] Failed to open auth URL:', err);
        setError("Failed to open browser. Please try again.");
        setIsLoading(null);
      }
    } else {
      setError("This app must be run inside the SwitchControl desktop app.");
      setIsLoading(null);
      return;
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
