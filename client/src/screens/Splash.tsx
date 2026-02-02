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
    <div className="fixed inset-0 bg-[#0a0a0f] overflow-hidden flex items-center justify-center" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="absolute inset-0 pointer-events-none opacity-[0.08]">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
              repeating-radial-gradient(
                circle at center,
                rgba(255,255,255,0.08) 0px,
                rgba(255,255,255,0.08) 1px,
                transparent 1px,
                transparent 14px
              )
            `
          }}
        />
      </div>

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
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#topo)" />
        </svg>
      </div>

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
