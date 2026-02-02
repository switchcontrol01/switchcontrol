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
      {/* Animated contour background - VISIBLE */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Layer 1 - Moving contours */}
        <div className="absolute inset-0 animate-contour-move-1" style={{ opacity: 0.35 }}>
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="contour1" x="0" y="0" width="200" height="120" patternUnits="userSpaceOnUse">
                <path d="M0 30 Q50 10 100 30 T200 30" fill="none" stroke="hsl(270 70% 55%)" strokeWidth="1.5" opacity="0.6"/>
                <path d="M0 60 Q50 40 100 60 T200 60" fill="none" stroke="hsl(280 60% 50%)" strokeWidth="1" opacity="0.5"/>
                <path d="M0 90 Q50 70 100 90 T200 90" fill="none" stroke="hsl(270 65% 45%)" strokeWidth="1.2" opacity="0.4"/>
              </pattern>
            </defs>
            <rect width="200%" height="200%" x="-50%" y="-50%" fill="url(#contour1)" />
          </svg>
        </div>

        {/* Layer 2 - Counter-moving contours */}
        <div className="absolute inset-0 animate-contour-move-2" style={{ opacity: 0.3 }}>
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="contour2" x="0" y="0" width="150" height="100" patternUnits="userSpaceOnUse">
                <path d="M0 25 Q37 5 75 25 T150 25" fill="none" stroke="hsl(260 60% 50%)" strokeWidth="1" opacity="0.5"/>
                <path d="M0 50 Q37 30 75 50 T150 50" fill="none" stroke="hsl(275 55% 55%)" strokeWidth="0.8" opacity="0.4"/>
                <path d="M0 75 Q37 55 75 75 T150 75" fill="none" stroke="hsl(265 65% 45%)" strokeWidth="1.1" opacity="0.45"/>
              </pattern>
            </defs>
            <rect width="200%" height="200%" x="-50%" y="-50%" fill="url(#contour2)" />
          </svg>
        </div>

        {/* Layer 3 - Slow diagonal drift */}
        <div className="absolute inset-0 animate-contour-move-3" style={{ opacity: 0.25 }}>
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="contour3" x="0" y="0" width="180" height="140" patternUnits="userSpaceOnUse">
                <ellipse cx="90" cy="70" rx="80" ry="50" fill="none" stroke="hsl(270 60% 50%)" strokeWidth="0.8" opacity="0.4"/>
                <ellipse cx="90" cy="70" rx="60" ry="35" fill="none" stroke="hsl(280 55% 55%)" strokeWidth="0.6" opacity="0.35"/>
                <ellipse cx="90" cy="70" rx="40" ry="22" fill="none" stroke="hsl(275 65% 50%)" strokeWidth="0.5" opacity="0.3"/>
              </pattern>
            </defs>
            <rect width="200%" height="200%" x="-50%" y="-50%" fill="url(#contour3)" />
          </svg>
        </div>
      </div>

      {/* Center glow */}
      <div className="absolute inset-0 bg-gradient-radial from-purple-600/20 via-transparent to-transparent" />
      
      {/* Vignette */}
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-[#0a0a0f]/50 to-[#0a0a0f]" />

      <AnimatePresence mode="wait">
        {phase === "logo" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
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
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <img
                src="./logo.png"
                alt="SwitchControl"
                className="w-32 h-32 object-contain"
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
