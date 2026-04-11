import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import logoImg from "@/assets/logo.webp";

const AUTH_DOMAIN = "https://switchcontrol.org";
const OAUTH_TIMEOUT_MS = 120_000;

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

function FloatingParticle({ delay, duration, startX, startY, size = 1, hue, dx, dy }: { delay: number; duration: number; startX: number; startY: number; size?: number; hue?: number; dx: number; dy: number }) {
  const alpha = 0.75 + (size > 1.8 ? 0.25 : size > 1.2 ? 0.15 : 0);
  const color = hue !== undefined
    ? `hsla(${hue}, 90%, 72%, ${alpha})`
    : `rgba(139,92,246,${alpha})`;
  const glowPx = size * 11;
  const glow = size > 0.9
    ? `0 0 ${glowPx}px ${color}, 0 0 ${glowPx * 2}px ${color.replace(/[\d.]+\)$/, '0.35)')}`
    : undefined;
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        left: `${startX}%`,
        top: `${startY}%`,
        width: `${size * 4.5}px`,
        height: `${size * 4.5}px`,
        background: color,
        boxShadow: glow,
      }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        y: [0, -dy * 0.5, -dy],
        x: [0, dx * 0.5, dx],
        opacity: [0, alpha, 0],
        scale: [0.2, 1 + (size > 1.5 ? 0.4 : 0.2), 0.1],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "easeOut",
      }}
    />
  );
}

export default function Login({ succeeded = false }: { succeeded?: boolean }) {
  const [isLoading, setIsLoading] = useState<"google" | "discord" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [particles, setParticles] = useState<Array<{ id: number; delay: number; duration: number; startX: number; startY: number; size?: number; hue?: number; dx: number; dy: number }>>([]);
  const oauthTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { electronAuthState, oauthError } = useAuthStore();

  const clearAllTimers = useCallback(() => {
    if (oauthTimeoutRef.current) {
      clearTimeout(oauthTimeoutRef.current);
      oauthTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (electronAuthState === 'callback_received' || electronAuthState === 'exchanging' || electronAuthState === 'authenticated') {
      console.log('[Login] Auth state reached', electronAuthState, '— clearing UI');
      clearAllTimers();
      setIsLoading(null);
      setError(null);
    }
  }, [electronAuthState, clearAllTimers]);

  useEffect(() => {
    if (oauthError) {
      console.log('[Login] OAuth error from store:', oauthError);
      clearAllTimers();
      setIsLoading(null);
      setError(oauthError);
      useAuthStore.getState().setOauthError(null);
    }
  }, [oauthError, clearAllTimers]);

  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  useEffect(() => {
    const hues = [250, 258, 265, 272, 280, 290, 310, 330, 185, 195, 340];
    const newParticles = Array.from({ length: 90 }, (_, i) => ({
      id: i,
      delay: (i / 90) * 1.2,                    // evenly spread 0–1.2s, all visible fast
      duration: 2.8 + (i % 9) * 0.4,            // 2.8–6.0s, deterministic
      startX: 3 + ((i * 4.7 + i * i * 0.11) % 94),
      startY: 5 + ((i * 6.3 + i * 0.8)       % 90),
      size: 0.9 + (i % 7) * 0.35,               // 0.9–3.2px radius factor
      hue: hues[i % hues.length],
      dx: (i % 5 === 0 ? -1 : 1) * (10 + (i % 5) * 9),
      dy: 55 + (i % 6) * 20,                    // 55–155px upward drift
    }));
    setParticles(newParticles);
  }, []);

  const handleCancel = useCallback(() => {
    console.log('[Login] User cancelled login');
    useAuthStore.getState().setElectronAuthState('cancelled');
    clearAllTimers();
    setIsLoading(null);
    setError(null);
  }, [clearAllTimers]);

  const handleLogin = async (provider: "google" | "discord") => {
    setIsLoading(provider);
    setError(null);
    useAuthStore.getState().setElectronAuthState('opening_browser');
    
    const api = (window as any).electronAPI;
    const isElectron = api?.isElectron && api?.openExternal;
    
    if (isElectron) {
      const authUrl = `${AUTH_DOMAIN}/auth/${provider}?source=electron`;
      console.log('[Login] Opening external auth URL:', authUrl);
      try {
        await api.openExternal(authUrl);
        useAuthStore.getState().setElectronAuthState('waiting_for_callback');

        clearAllTimers();
        oauthTimeoutRef.current = setTimeout(() => {
          const currentState = useAuthStore.getState().electronAuthState;
          if (currentState === 'callback_received' || currentState === 'exchanging' || currentState === 'authenticated') {
            console.log('[Login] Timeout fired but auth already progressed to', currentState, '— ignoring');
            return;
          }
          console.warn('[Login] OAuth timeout — no callback within', OAUTH_TIMEOUT_MS, 'ms');
          useAuthStore.getState().setElectronAuthState('timed_out');
          setIsLoading(null);
          setError("Login timed out. Please try again.");
          oauthTimeoutRef.current = null;
        }, OAUTH_TIMEOUT_MS);
      } catch (err) {
        console.error('[Login] Failed to open auth URL:', err);
        useAuthStore.getState().setElectronAuthState('failed');
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
      <motion.div 
        className="absolute inset-0 pointer-events-none"
        animate={{
          background: [
            "radial-gradient(ellipse 90% 60% at 50% 48%, rgba(139, 92, 246, 0.22) 0%, rgba(139, 92, 246, 0.08) 30%, transparent 55%)",
            "radial-gradient(ellipse 70% 50% at 45% 45%, rgba(139, 92, 246, 0.28) 0%, rgba(168, 85, 247, 0.1) 30%, transparent 55%)",
            "radial-gradient(ellipse 90% 60% at 55% 52%, rgba(139, 92, 246, 0.22) 0%, rgba(139, 92, 246, 0.08) 30%, transparent 55%)",
          ]
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 45%, rgba(139, 92, 246, 0.18) 0%, rgba(168, 85, 247, 0.06) 35%, transparent 60%)",
        }}
        animate={{
          opacity: [0.6, 1, 0.6],
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 30% 20%, rgba(236, 72, 153, 0.12) 0%, transparent 40%)",
        }}
        animate={{
          opacity: [0.4, 0.7, 0.4],
        }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 70% 75%, rgba(59, 130, 246, 0.1) 0%, transparent 40%)",
        }}
        animate={{
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[
          { angle: -25, left: '35%', top: '40%', width: 2, length: '140%', opacity: 0.06, delay: 0 },
          { angle: -15, left: '55%', top: '35%', width: 3, length: '160%', opacity: 0.05, delay: 1.5 },
          { angle: -35, left: '25%', top: '45%', width: 1.5, length: '120%', opacity: 0.04, delay: 3 },
          { angle: -8, left: '65%', top: '38%', width: 2.5, length: '150%', opacity: 0.05, delay: 0.8 },
          { angle: -20, left: '45%', top: '42%', width: 1, length: '130%', opacity: 0.03, delay: 2.2 },
        ].map((beam, i) => (
          <motion.div
            key={`beam-${i}`}
            className="absolute origin-center"
            style={{
              left: beam.left,
              top: beam.top,
              width: `${beam.width}px`,
              height: beam.length,
              background: `linear-gradient(180deg, transparent 0%, rgba(139,92,246,${beam.opacity * 3}) 20%, rgba(168,85,247,${beam.opacity * 2}) 50%, transparent 100%)`,
              transform: `rotate(${beam.angle}deg)`,
              filter: `blur(${beam.width * 3}px)`,
            }}
            animate={{
              opacity: [beam.opacity, beam.opacity * 2.5, beam.opacity],
              scaleY: [0.9, 1.1, 0.9],
            }}
            transition={{
              duration: 4 + i * 0.7,
              delay: beam.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Left-side beacon glow aimed at login card */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Wide ambient beam from left wall */}
        <motion.div
          className="absolute"
          style={{
            left: '-10%',
            top: '0%',
            width: '75%',
            height: '100%',
            background: 'conic-gradient(from 0deg at 0% 50%, transparent 0deg, rgba(139,92,246,0.18) 18deg, rgba(168,85,247,0.28) 28deg, rgba(139,92,246,0.18) 38deg, transparent 55deg)',
            filter: 'blur(28px)',
          }}
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Bright core beam */}
        <motion.div
          className="absolute"
          style={{
            left: '-5%',
            top: '15%',
            width: '60%',
            height: '70%',
            background: 'conic-gradient(from 0deg at 0% 50%, transparent 0deg, rgba(168,85,247,0.12) 22deg, rgba(192,132,252,0.22) 30deg, rgba(168,85,247,0.12) 38deg, transparent 52deg)',
            filter: 'blur(16px)',
          }}
          animate={{ opacity: [0.4, 0.9, 0.4], scaleY: [0.95, 1.05, 0.95] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
        />
        {/* Sharp inner light ray */}
        <motion.div
          className="absolute"
          style={{
            left: 0,
            top: '38%',
            width: '52%',
            height: '24%',
            background: 'linear-gradient(90deg, rgba(192,132,252,0.22) 0%, rgba(168,85,247,0.10) 55%, transparent 100%)',
            filter: 'blur(8px)',
            transformOrigin: 'left center',
          }}
          animate={{ opacity: [0.3, 0.8, 0.3], scaleX: [0.92, 1.04, 0.92] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut', delay: 1.6 }}
        />
        {/* Specular glint on the left edge */}
        <motion.div
          className="absolute"
          style={{
            left: 0,
            top: '42%',
            width: '18%',
            height: '16%',
            background: 'radial-gradient(ellipse at 0% 50%, rgba(216,180,254,0.45) 0%, rgba(192,132,252,0.18) 40%, transparent 80%)',
            filter: 'blur(6px)',
          }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        />
      </div>

      <div 
        className="absolute inset-0 overflow-hidden pointer-events-none" 
        style={{ transform: 'rotate(-12deg) scale(1.4)' }}
      >
        <motion.div 
          className="absolute inset-0" 
          style={{ opacity: 0.12 }}
          animate={{ y: [0, -20, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        >
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="loginTopo" x="0" y="0" width="200" height="150" patternUnits="userSpaceOnUse">
                <path d="M0 50 Q50 25 100 50 T200 50" fill="none" stroke="hsl(270 50% 55%)" strokeWidth="0.8" opacity="0.6"/>
                <path d="M0 100 Q50 75 100 100 T200 100" fill="none" stroke="hsl(280 45% 60%)" strokeWidth="0.6" opacity="0.5"/>
                <path d="M0 25 Q50 0 100 25 T200 25" fill="none" stroke="hsl(260 55% 50%)" strokeWidth="0.5" opacity="0.4"/>
                <path d="M0 125 Q50 100 100 125 T200 125" fill="none" stroke="hsl(270 50% 45%)" strokeWidth="0.4" opacity="0.3"/>
              </pattern>
            </defs>
            <rect width="300%" height="300%" x="-100%" y="-100%" fill="url(#loginTopo)"/>
          </svg>
        </motion.div>
      </div>

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {particles.map((p) => (
          <FloatingParticle key={p.id} {...p} />
        ))}
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-[#0a0a0f]/80 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#0a0a0f_75%)] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        {/* Wide outer halo */}
        <motion.div
          className="absolute -inset-6 rounded-3xl"
          style={{
            background: "radial-gradient(ellipse 120% 110% at 50% 50%, rgba(139,92,246,0.22) 0%, rgba(168,85,247,0.10) 45%, transparent 70%)",
            filter: "blur(24px)",
          }}
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Left-edge blaze */}
        <motion.div
          className="absolute rounded-3xl"
          style={{
            top: "10%", bottom: "10%",
            left: "-28px", width: "56px",
            background: "radial-gradient(ellipse 100% 80% at 0% 50%, rgba(192,132,252,0.90) 0%, rgba(168,85,247,0.55) 35%, rgba(139,92,246,0.18) 65%, transparent 90%)",
            filter: "blur(10px)",
          }}
          animate={{ opacity: [0.6, 1, 0.6], scaleY: [0.9, 1.08, 0.9] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Right-edge blaze */}
        <motion.div
          className="absolute rounded-3xl"
          style={{
            top: "10%", bottom: "10%",
            right: "-28px", width: "56px",
            background: "radial-gradient(ellipse 100% 80% at 100% 50%, rgba(96,165,250,0.85) 0%, rgba(59,130,246,0.50) 35%, rgba(99,102,241,0.18) 65%, transparent 90%)",
            filter: "blur(10px)",
          }}
          animate={{ opacity: [0.5, 0.9, 0.5], scaleY: [0.9, 1.1, 0.9] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
        />
        {/* Bright left rim line */}
        <motion.div
          className="absolute"
          style={{
            top: "20%", bottom: "20%",
            left: "-4px", width: "3px",
            borderRadius: "4px",
            background: "linear-gradient(180deg, transparent 0%, rgba(216,180,254,0.95) 30%, rgba(192,132,252,1) 50%, rgba(216,180,254,0.95) 70%, transparent 100%)",
            filter: "blur(2px)",
          }}
          animate={{ opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Bright right rim line */}
        <motion.div
          className="absolute"
          style={{
            top: "20%", bottom: "20%",
            right: "-4px", width: "3px",
            borderRadius: "4px",
            background: "linear-gradient(180deg, transparent 0%, rgba(147,197,253,0.95) 30%, rgba(96,165,250,1) 50%, rgba(147,197,253,0.95) 70%, transparent 100%)",
            filter: "blur(2px)",
          }}
          animate={{ opacity: [0.55, 0.95, 0.55] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
        />
        
        <div
          className="relative bg-card/90 backdrop-blur-2xl rounded-2xl p-8 overflow-hidden"
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderLeft: "1px solid rgba(192,132,252,0.45)",
            borderRight: "1px solid rgba(96,165,250,0.40)",
            boxShadow: "-8px 0 32px rgba(168,85,247,0.28), 8px 0 32px rgba(59,130,246,0.22), 0 25px 50px rgba(0,0,0,0.6)",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-violet-500/8 via-transparent to-blue-500/8 pointer-events-none" />
          
          <div className="relative flex flex-col items-center gap-6 mb-8">
            <motion.div
              animate={{
                boxShadow: [
                  "0 0 20px rgba(139, 92, 246, 0.2)",
                  "0 0 40px rgba(139, 92, 246, 0.4)",
                  "0 0 20px rgba(139, 92, 246, 0.2)",
                ]
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="rounded-[22%]"
            >
              <motion.img
                src={logoImg}
                alt="SwitchControl"
                className="w-20 h-20 max-w-[80px] max-h-[80px] object-contain rounded-[22%]"
                animate={{ rotate: [0, 2, -2, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
            <div className="text-center">
              <motion.h1 
                className="text-2xl font-bold text-white mb-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                Welcome to <span className="bg-gradient-to-r from-primary to-pink-400 bg-clip-text text-transparent">SwitchControl</span>
              </motion.h1>
              <motion.p 
                className="text-muted-foreground text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                Sign in to optimize your gaming experience
              </motion.p>
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                transition={{ duration: 0.2 }}
                className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative space-y-3">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center gap-4 py-4"
                >
                  <motion.div
                    className="relative w-12 h-12 mb-1"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  >
                    <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary" />
                  </motion.div>
                  <span className="text-sm text-muted-foreground">
                    Waiting for {isLoading === "google" ? "Google" : "Discord"} sign-in...
                  </span>
                  <p className="text-[11px] text-muted-foreground/60">Complete sign-in in your browser to continue</p>
                  <motion.button
                    onClick={handleCancel}
                    className="text-sm font-medium text-white/90 hover:text-white transition-all duration-150 px-6 py-2.5 rounded-xl border border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 shadow-sm mt-1"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    data-testid="button-login-cancel"
                  >
                    Cancel
                  </motion.button>
                </motion.div>
              ) : (
                <motion.div
                  key="buttons"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3"
                >
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <Button
                      onClick={() => handleLogin("google")}
                      className="w-full h-12 bg-white hover:bg-gray-100 text-gray-900 font-medium rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
                      data-testid="button-login-google"
                    >
                      <GoogleIcon className="w-5 h-5 mr-3" />
                      Continue with Google
                    </Button>
                  </motion.div>

                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <Button
                      onClick={() => handleLogin("discord")}
                      className="w-full h-12 bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:shadow-[#5865F2]/20"
                      data-testid="button-login-discord"
                    >
                      <DiscordIcon className="w-5 h-5 mr-3" />
                      Continue with Discord
                    </Button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.p 
            className="text-center text-xs text-muted-foreground mt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            By signing in, you agree to our Terms of Service and Privacy Policy
          </motion.p>
        </div>
      </motion.div>

      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-primary/40"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.3, 0.8, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.2,
            }}
          />
        ))}
      </motion.div>

      {/* Success overlay — expands from center when login succeeds, before the
          parent motion.div blurs/fades the whole screen away. Keeps the scene
          feeling alive instead of instantly freezing on success. */}
      <AnimatePresence>
        {succeeded && (
          <motion.div
            key="login-success-overlay"
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {/* Expanding radial bloom from center */}
            <motion.div
              className="absolute inset-0"
              style={{
                background: "radial-gradient(ellipse 70% 55% at 50% 50%, rgba(168,85,247,0.38) 0%, rgba(139,92,246,0.18) 35%, rgba(59,130,246,0.08) 60%, transparent 80%)",
              }}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1.35, opacity: 1 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            />
            {/* Bright inner core pulse */}
            <motion.div
              className="absolute inset-0"
              style={{
                background: "radial-gradient(ellipse 30% 22% at 50% 50%, rgba(216,180,254,0.28) 0%, rgba(192,132,252,0.12) 50%, transparent 75%)",
              }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: [0, 1, 0.6], scale: [0.5, 1.1, 1.4] }}
              transition={{ duration: 0.75, ease: "easeOut" }}
            />
            {/* Soft white vignette that deepens the blur feel */}
            <motion.div
              className="absolute inset-0"
              style={{
                background: "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 30%, rgba(10,10,15,0.55) 100%)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeIn" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
