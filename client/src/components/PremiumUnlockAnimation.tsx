import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { postUnlockSeen } from "@/lib/auth-store";

export function PremiumUnlockAnimation() {
  const { isPremium, isLoading, user } = useAuth();
  const [showAnimation, setShowAnimation] = useState(false);
  const previousPremiumRef = useRef<boolean | null>(null);
  const hasCheckedRef = useRef(false);
  const markingSeenRef = useRef(false);

  useEffect(() => {
    if (isLoading || !user) return;

    const hasSeenUnlock = user.hasSeenPremiumUnlock === true;
    const wasNotPremium = previousPremiumRef.current === false;
    const isNowPremium = isPremium === true;

    if (previousPremiumRef.current === null && !hasCheckedRef.current) {
      hasCheckedRef.current = true;
      previousPremiumRef.current = isPremium;

      const eligible = isNowPremium && !hasSeenUnlock;
      console.log(`[PremiumUnlock] eligible=${eligible} premium=${isNowPremium} seen=${hasSeenUnlock} reason=${eligible ? 'first_load' : 'not_eligible'}`);

      if (eligible) {
        setShowAnimation(true);
        const timer = setTimeout(() => {
          setShowAnimation(false);
          markSeen();
        }, 3500);
        return () => clearTimeout(timer);
      }
      return;
    }

    if (wasNotPremium && isNowPremium && !hasSeenUnlock) {
      console.log(`[PremiumUnlock] eligible=true premium=true seen=false reason=upgrade_transition`);
      setShowAnimation(true);
      const timer = setTimeout(() => {
        setShowAnimation(false);
        markSeen();
      }, 3500);
      previousPremiumRef.current = isPremium;
      return () => clearTimeout(timer);
    }

    previousPremiumRef.current = isPremium;
  }, [isPremium, isLoading, user]);

  async function markSeen() {
    if (markingSeenRef.current) return;
    markingSeenRef.current = true;
    await postUnlockSeen();
    markingSeenRef.current = false;
  }

  return (
    <AnimatePresence>
      {showAnimation && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(270,60%,15%,0.9)] via-[hsl(260,50%,10%,0.95)] to-[hsl(190,50%,10%,0.9)]" />

          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, 0.3, 0.5, 0.3, 0],
              background: [
                "radial-gradient(circle at 50% 50%, hsl(270 60% 55% / 0) 0%, transparent 50%)",
                "radial-gradient(circle at 50% 50%, hsl(270 60% 55% / 0.4) 0%, transparent 70%)",
                "radial-gradient(circle at 50% 50%, hsl(190 90% 50% / 0.3) 0%, transparent 80%)",
                "radial-gradient(circle at 50% 50%, hsl(270 60% 55% / 0.2) 0%, transparent 60%)",
                "radial-gradient(circle at 50% 50%, hsl(270 60% 55% / 0) 0%, transparent 50%)",
              ]
            }}
            transition={{ duration: 3, ease: "easeInOut" }}
          />

          <motion.div
            className="relative text-center z-10"
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -20 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <motion.div
              className="mx-auto w-24 h-24 rounded-full flex items-center justify-center mb-6"
              style={{
                background: "linear-gradient(135deg, hsl(270 60% 55%), hsl(190 90% 50%))",
                boxShadow: "0 0 60px hsl(270 60% 55% / 0.5), 0 0 100px hsl(190 90% 50% / 0.3)"
              }}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                delay: 0.3,
                duration: 0.8,
                type: "spring",
                stiffness: 200
              }}
            >
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{
                  delay: 1.1,
                  duration: 0.5
                }}
              >
                <Crown className="w-12 h-12 text-white" />
              </motion.div>
            </motion.div>

            <motion.h2
              className="text-3xl md:text-4xl font-bold text-white mb-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.5 }}
            >
              Premium Unlocked
            </motion.h2>

            <motion.p
              className="text-lg text-white/70 mb-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.5 }}
            >
              All features are now available
            </motion.p>

            <motion.div
              className="flex items-center justify-center gap-2 text-[hsl(190,90%,50%)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.3, duration: 0.5 }}
            >
              <Check className="w-5 h-5" />
              <span className="text-sm font-medium">Lifetime access activated</span>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function usePremiumUnlockReset() {
  return () => {};
}
