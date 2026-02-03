import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SplashProps {
  onComplete: () => void;
}

export default function Splash({ onComplete }: SplashProps) {
  const [phase, setPhase] = useState<"logo" | "fadeout">("logo");

  useEffect(() => {
    const logoTimer = setTimeout(() => {
      setPhase("fadeout");
    }, 2400);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 2800);

    return () => {
      clearTimeout(logoTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] overflow-hidden flex items-center justify-center">
      <div 
        className="absolute inset-0 overflow-hidden pointer-events-none" 
        style={{ transform: 'rotate(-15deg) scale(1.5)' }}
      >
        <div className="absolute inset-0 splash-contour-drift-1" style={{ opacity: 0.12 }}>
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="splashContour1" x="0" y="0" width="300" height="200" patternUnits="userSpaceOnUse">
                <path d="M0 50 Q75 20 150 50 T300 50" fill="none" stroke="hsl(270 50% 50%)" strokeWidth="0.8" opacity="0.5"/>
                <path d="M0 100 Q75 70 150 100 T300 100" fill="none" stroke="hsl(275 45% 55%)" strokeWidth="0.6" opacity="0.4"/>
                <path d="M0 150 Q75 120 150 150 T300 150" fill="none" stroke="hsl(265 55% 45%)" strokeWidth="0.7" opacity="0.35"/>
              </pattern>
            </defs>
            <rect width="300%" height="300%" x="-100%" y="-100%" fill="url(#splashContour1)" />
          </svg>
        </div>

        <div className="absolute inset-0 splash-contour-drift-2" style={{ opacity: 0.08 }}>
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="splashContour2" x="0" y="0" width="250" height="180" patternUnits="userSpaceOnUse">
                <path d="M0 40 Q62 15 125 40 T250 40" fill="none" stroke="hsl(280 40% 50%)" strokeWidth="0.5" opacity="0.4"/>
                <path d="M0 90 Q62 65 125 90 T250 90" fill="none" stroke="hsl(260 50% 45%)" strokeWidth="0.4" opacity="0.3"/>
                <path d="M0 140 Q62 115 125 140 T250 140" fill="none" stroke="hsl(270 45% 50%)" strokeWidth="0.55" opacity="0.35"/>
              </pattern>
            </defs>
            <rect width="300%" height="300%" x="-100%" y="-100%" fill="url(#splashContour2)" />
          </svg>
        </div>
      </div>

      <div className="absolute inset-0 bg-gradient-radial from-purple-600/15 via-transparent to-transparent pointer-events-none" />
      
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-[#0a0a0f]/60 to-[#0a0a0f] pointer-events-none" />

      <AnimatePresence mode="wait">
        {phase === "logo" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05, y: -10 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 flex flex-col items-center gap-6"
          >
            <motion.div 
              className="relative"
              animate={{ 
                filter: [
                  "drop-shadow(0 0 20px hsl(270 60% 55% / 0.3))",
                  "drop-shadow(0 0 40px hsl(270 60% 55% / 0.5))",
                  "drop-shadow(0 0 20px hsl(270 60% 55% / 0.3))"
                ]
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <img
                src="/logo.png"
                alt="SwitchControl"
                className="w-28 h-28 max-w-[112px] max-h-[112px] object-contain rounded-[28px]"
              />
            </motion.div>

            <motion.h1 
              className="text-3xl font-bold text-white tracking-tight"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              Switch<span className="text-primary">Control</span>
            </motion.h1>

            <motion.p
              className="text-sm text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              Gaming optimization suite
            </motion.p>

            <motion.div
              className="mt-4 flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.5 }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs text-muted-foreground">Initializing...</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
