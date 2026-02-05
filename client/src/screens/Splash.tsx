import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "@/assets/logo.png";

interface SplashProps {
  onComplete: () => void;
}

export default function Splash({ onComplete }: SplashProps) {
  const [phase, setPhase] = useState<"logo" | "fadeout">("logo");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const logoTimer = setTimeout(() => {
      setPhase("fadeout");
    }, 2400);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 2800);

    // Progress bar animation with acceleration then ease out
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 100;
        // Accelerate in first half, then ease out
        const remaining = 100 - prev;
        if (prev < 50) {
          // Accelerating phase - starts slow then speeds up
          return prev + Math.min(prev * 0.06 + 0.8, 4);
        } else {
          // Ease out phase - slows down as it approaches 100
          return prev + Math.max(remaining * 0.1, 0.3);
        }
      });
    }, 40);

    return () => {
      clearTimeout(logoTimer);
      clearTimeout(completeTimer);
      clearInterval(progressInterval);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] overflow-hidden flex items-center justify-center">
      {/* Animated contour background */}
      <div 
        className="absolute inset-0 overflow-hidden pointer-events-none" 
        style={{ transform: 'rotate(-15deg) scale(1.5)' }}
      >
        <motion.div 
          className="absolute inset-0" 
          style={{ opacity: 0.18 }}
          animate={{ x: [0, 50, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        >
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
        </motion.div>

        <motion.div 
          className="absolute inset-0" 
          style={{ opacity: 0.14 }}
          animate={{ x: [0, -30, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        >
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
        </motion.div>
      </div>

      <div className="absolute inset-0 bg-gradient-radial from-purple-600/15 via-transparent to-transparent pointer-events-none" />
      
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-[#0a0a0f]/60 to-[#0a0a0f] pointer-events-none" />

      {/* Floating particles with parallax */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${10 + i * 8}%`,
              top: `${15 + (i % 4) * 20}%`,
              width: `${2 + (i % 3)}px`,
              height: `${2 + (i % 3)}px`,
              background: i % 2 === 0 
                ? 'rgba(168, 85, 247, 0.4)' 
                : 'rgba(236, 72, 153, 0.3)',
            }}
            animate={{
              y: [-30 - i * 2, 30 + i * 2, -30 - i * 2],
              x: [-10 + i, 10 - i, -10 + i],
              opacity: [0.2, 0.6, 0.2],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 4 + i * 0.3,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Breathing center glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{
          background: [
            'radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)',
            'radial-gradient(circle at 50% 50%, rgba(168, 85, 247, 0.25) 0%, transparent 60%)',
            'radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)',
          ]
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Gradient sweep */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(45deg, transparent, rgba(139, 92, 246, 0.08), transparent)',
          backgroundSize: '200% 200%',
        }}
        animate={{
          backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
        }}
        transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
      />

      <AnimatePresence mode="wait">
        {phase === "logo" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05, y: -10 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 flex flex-col items-center gap-6"
          >
            {/* Logo with shimmer effect */}
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
              <div className="absolute inset-0 rounded-[22%] overflow-hidden">
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, ease: "easeInOut" }}
                />
              </div>
              <img
                src={logoImg}
                alt="SwitchControl"
                className="w-28 h-28 max-w-[112px] max-h-[112px] object-contain rounded-[22%]"
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

            {/* Progress bar */}
            <motion.div
              className="mt-4 w-48"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            >
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-gradient-to-r from-primary via-purple-400 to-primary rounded-full"
                  style={{ width: `${progress}%` }}
                  transition={{ ease: "easeOut" }}
                />
              </div>
              <div className="flex items-center justify-center gap-2 mt-3">
                <motion.div 
                  className="w-1.5 h-1.5 rounded-full bg-primary"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <span className="text-xs text-muted-foreground">Initializing...</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
