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
    }, 400);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 600);

    return () => {
      clearTimeout(logoTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] overflow-hidden flex items-center justify-center">
      <div className="absolute inset-0 opacity-30">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="topo" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
              <path 
                d="M0 50 Q25 30 50 50 T100 50" 
                fill="none" 
                stroke="hsl(270 60% 40% / 0.3)" 
                strokeWidth="0.5"
              />
              <path 
                d="M0 70 Q25 50 50 70 T100 70" 
                fill="none" 
                stroke="hsl(270 60% 50% / 0.2)" 
                strokeWidth="0.5"
              />
              <path 
                d="M0 30 Q25 10 50 30 T100 30" 
                fill="none" 
                stroke="hsl(270 60% 60% / 0.15)" 
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <motion.rect 
            width="100%" 
            height="100%" 
            fill="url(#topo)"
            animate={{ 
              x: [0, -50, 0],
              y: [0, -25, 0]
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "linear"
            }}
          />
        </svg>
      </div>

      <div className="absolute inset-0 bg-gradient-radial from-transparent via-[#0a0a0f]/50 to-[#0a0a0f]" />

      <AnimatePresence mode="wait">
        {phase === "logo" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
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
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-primary via-purple-500 to-cyan-400 p-0.5">
                <div className="w-full h-full rounded-2xl bg-[#0a0a0f] flex items-center justify-center">
                  <span className="text-5xl font-bold bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                    SC
                  </span>
                </div>
              </div>
            </motion.div>

            <motion.h1 
              className="text-3xl font-bold text-white tracking-tight"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              Switch<span className="text-primary">Control</span>
            </motion.h1>

            <motion.div
              className="flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-sm text-muted-foreground">Loading...</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
