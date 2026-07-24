import { motion, AnimatePresence, useMotion } from "@/lib/motionTokens";

interface Props {
  active: boolean;
}

export function StartupPulse({ active }: Props) {
  const { prefersReducedMotion } = useMotion();

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed top-0 left-0 right-0 h-1 z-50 pointer-events-none"
        >
          <div className="absolute inset-0 bg-primary/10" />
          {prefersReducedMotion ? (
            // Static indicator — no infinite sweep for reduced-motion users
            <div className="absolute inset-0 bg-primary/30" />
          ) : (
            <motion.div
              className="absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent"
              animate={{ x: ["-100vw", "100vw"] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              style={{ filter: "drop-shadow(0 0 8px rgba(0, 212, 255, 0.8))" }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
