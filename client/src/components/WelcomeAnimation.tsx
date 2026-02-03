import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import logoImg from "@/assets/logo.png";
import { Sparkles, Zap, Gamepad2, Crown } from "lucide-react";

interface WelcomeAnimationProps {
  userName: string | null;
  isPremium?: boolean;
  onComplete: () => void;
}

const floatingIcons = [
  { Icon: Sparkles, delay: 0.2, x: -120, y: -80 },
  { Icon: Zap, delay: 0.4, x: 130, y: -60 },
  { Icon: Gamepad2, delay: 0.6, x: -100, y: 80 },
  { Icon: Crown, delay: 0.8, x: 110, y: 70 },
];

export function WelcomeAnimation({ userName, isPremium, onComplete }: WelcomeAnimationProps) {
  const [phase, setPhase] = useState<"intro" | "logo" | "text" | "particles" | "fade">("intro");

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("logo"), 300),
      setTimeout(() => setPhase("text"), 1200),
      setTimeout(() => setPhase("particles"), 2200),
      setTimeout(() => setPhase("fade"), 4000),
      setTimeout(() => onComplete(), 4600),
    ];

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {phase !== "fade" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
          style={{ background: "linear-gradient(135deg, #0a0a0f 0%, #12121a 50%, #0a0a0f 100%)" }}
        >
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(50)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 rounded-full bg-primary/30"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0, 1.5, 0],
                }}
                transition={{
                  duration: 2 + Math.random() * 2,
                  repeat: Infinity,
                  delay: Math.random() * 2,
                }}
              />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            className="absolute inset-0"
            style={{
              background: "radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)",
            }}
          />

          <div className="relative">
            {floatingIcons.map(({ Icon, delay, x, y }, index) => (
              <motion.div
                key={index}
                className="absolute text-primary/40"
                initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                animate={phase !== "intro" ? {
                  opacity: [0, 0.6, 0.4],
                  scale: [0, 1.2, 1],
                  x: x,
                  y: y,
                  rotate: [0, 10, -10, 0],
                } : {}}
                transition={{
                  delay: delay,
                  duration: 1.5,
                  rotate: { duration: 4, repeat: Infinity, ease: "easeInOut" }
                }}
                style={{ left: "50%", top: "50%", marginLeft: -12, marginTop: -12 }}
              >
                <Icon className="w-6 h-6" />
              </motion.div>
            ))}

            <motion.div
              initial={{ scale: 0, opacity: 0, rotateY: -180 }}
              animate={phase !== "intro" ? { 
                scale: 1, 
                opacity: 1, 
                rotateY: 0,
              } : {}}
              transition={{ 
                type: "spring", 
                stiffness: 150, 
                damping: 15,
                duration: 0.8 
              }}
              className="relative"
            >
              <motion.div
                animate={{ 
                  boxShadow: [
                    "0 0 0 0 rgba(139, 92, 246, 0)",
                    "0 0 80px 30px rgba(139, 92, 246, 0.4)",
                    "0 0 100px 40px rgba(139, 92, 246, 0.2)",
                  ]
                }}
                transition={{ duration: 2.5, repeat: Infinity, repeatType: "reverse" }}
                className="rounded-3xl"
              >
                <motion.div
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                >
                  <img
                    src={logoImg}
                    alt="SwitchControl"
                    className="w-36 h-36 object-contain rounded-3xl"
                  />
                </motion.div>
              </motion.div>

              <motion.div
                className="absolute -inset-4 rounded-[2rem] border-2 border-primary/30"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={phase !== "intro" ? { 
                  opacity: [0, 1, 0], 
                  scale: [0.8, 1.3, 1.5],
                } : {}}
                transition={{ duration: 1.5, delay: 0.3 }}
              />
              <motion.div
                className="absolute -inset-8 rounded-[2.5rem] border border-primary/20"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={phase !== "intro" ? { 
                  opacity: [0, 0.5, 0], 
                  scale: [0.8, 1.4, 1.6],
                } : {}}
                transition={{ duration: 1.5, delay: 0.5 }}
              />
            </motion.div>
          </div>

          <AnimatePresence>
            {(phase === "text" || phase === "particles") && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="mt-10 text-center relative"
              >
                <motion.div
                  className="absolute -inset-10 bg-gradient-to-r from-primary/5 via-primary/10 to-pink-500/5 blur-3xl rounded-full"
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
                
                <motion.h1 
                  className="relative text-4xl font-bold mb-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <span className="bg-gradient-to-r from-white via-white to-zinc-300 bg-clip-text text-transparent">
                    Welcome
                  </span>
                  {userName && (
                    <span className="bg-gradient-to-r from-primary via-pink-400 to-primary bg-clip-text text-transparent">
                      , {userName}
                    </span>
                  )}
                  <span className="text-white">!</span>
                </motion.h1>
                
                <motion.p 
                  className="relative text-lg text-zinc-400"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  {isPremium ? (
                    <span className="flex items-center justify-center gap-2">
                      <Crown className="w-5 h-5 text-yellow-400" />
                      <span className="bg-gradient-to-r from-yellow-200 to-yellow-400 bg-clip-text text-transparent font-medium">
                        Premium Member
                      </span>
                      <Crown className="w-5 h-5 text-yellow-400" />
                    </span>
                  ) : (
                    "Let's optimize your gaming experience"
                  )}
                </motion.p>

                {phase === "particles" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"
                  >
                    <motion.span
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      Preparing your dashboard
                    </motion.span>
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-primary"
                          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            className="absolute bottom-10 flex gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === "particles" ? 1 : 0 }}
            transition={{ delay: 0.5 }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-pink-500"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.4, 1, 0.4],
                }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.15,
                }}
              />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
