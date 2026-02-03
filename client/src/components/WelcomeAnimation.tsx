import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import logoImg from "@/assets/logo.png";

interface WelcomeAnimationProps {
  userName: string | null;
  onComplete: () => void;
}

export function WelcomeAnimation({ userName, onComplete }: WelcomeAnimationProps) {
  const [phase, setPhase] = useState<"logo" | "text" | "fade">("logo");

  useEffect(() => {
    const timer1 = setTimeout(() => setPhase("text"), 800);
    const timer2 = setTimeout(() => setPhase("fade"), 2800);
    const timer3 = setTimeout(() => onComplete(), 3400);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {phase !== "fade" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0f]"
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ 
              type: "spring", 
              stiffness: 200, 
              damping: 20,
              duration: 0.6 
            }}
            className="relative"
          >
            <motion.div
              animate={{ 
                boxShadow: [
                  "0 0 0 0 rgba(139, 92, 246, 0)",
                  "0 0 60px 20px rgba(139, 92, 246, 0.3)",
                  "0 0 80px 30px rgba(139, 92, 246, 0.1)",
                ]
              }}
              transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
              className="rounded-3xl"
            >
              <img
                src={logoImg}
                alt="SwitchControl"
                className="w-32 h-32 object-contain rounded-3xl"
              />
            </motion.div>
          </motion.div>

          <AnimatePresence>
            {phase === "text" && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mt-8 text-center"
              >
                <motion.h1 
                  className="text-3xl font-bold text-white mb-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  Welcome{userName ? `, ${userName}` : ""}!
                </motion.h1>
                <motion.p 
                  className="text-muted-foreground text-lg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  Let's optimize your gaming experience
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            className="absolute bottom-12 flex gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-primary/50"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
