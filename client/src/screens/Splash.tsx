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
    }, 700);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 1100);

    return () => {
      clearTimeout(logoTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] overflow-hidden flex items-center justify-center">
      {/* Premium diagonal contour background - subtle and animated */}
      <div className="absolute inset-0 overflow-hidden" style={{ transform: 'rotate(-15deg) scale(1.5)' }}>
        {/* Layer 1 - Primary contours drifting */}
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

        {/* Layer 2 - Secondary contours counter-drifting */}
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

      {/* Center glow - soft purple */}
      <div className="absolute inset-0 bg-gradient-radial from-purple-600/15 via-transparent to-transparent" />
      
      {/* Vignette */}
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-[#0a0a0f]/60 to-[#0a0a0f]" />

      <AnimatePresence mode="wait">
        {phase === "logo" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05, y: -10 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 flex flex-col items-center gap-6"
          >
            <motion.div 
              className="relative"
              animate={{ 
                filter: [
                  "drop-shadow(0 0 15px hsl(270 60% 55% / 0.25))",
                  "drop-shadow(0 0 30px hsl(270 60% 55% / 0.4))",
                  "drop-shadow(0 0 15px hsl(270 60% 55% / 0.25))"
                ]
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <img
                src="./logo.png"
                alt="SwitchControl"
                className="w-32 h-32 object-contain rounded-[24px]"
              />
            </motion.div>

            <motion.h1 
              className="text-3xl font-bold text-white tracking-tight"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
            >
              Switch<span className="text-primary">Control</span>
            </motion.h1>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
