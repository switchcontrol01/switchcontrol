import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CameraGlowProps {
  active: boolean;
  onComplete?: () => void;
}

export default function CameraGlow({ active, onComplete }: CameraGlowProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [active, onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.35) 0%, rgba(168,85,247,0.15) 30%, transparent 65%)',
            }}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1.2, opacity: [0, 1, 0.8, 0] }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />

          <motion.div
            className="absolute"
            style={{
              top: '48%',
              left: '-20%',
              width: '140%',
              height: '4px',
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 30%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0.4) 70%, transparent 100%)',
              filter: 'blur(2px)',
            }}
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: '100%', opacity: [0, 1, 1, 0] }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />

          <motion.div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)',
            }}
            initial={{ opacity: 0, scale: 1.5 }}
            animate={{ opacity: [0, 0.6, 0], scale: [1.5, 1, 0.9] }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
