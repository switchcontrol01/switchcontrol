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
      }, 750);
      return () => clearTimeout(timer);
    }
  }, [active, onComplete]);

  const sweepEase = [0.22, 1, 0.36, 1] as const;
  const sweepDuration = 0.65;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          {/* ── Background radial bloom — reacts to the sweep ─────────────── */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 90% 70% at 50% 50%, rgba(255,255,255,0.10) 0%, rgba(168,85,247,0.07) 30%, transparent 65%)",
              willChange: "opacity, transform",
            }}
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: [0, 1, 0.8, 0], scale: [0.75, 1.25, 1.05] }}
            transition={{ duration: sweepDuration, ease: "easeOut" }}
          />

          {/* ── Ambient center light (peaks as sweep crosses centre) ────────── */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 110% 45% at 50% 50%, rgba(255,255,255,0.07) 0%, transparent 55%)",
              willChange: "opacity",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: sweepDuration, delay: 0.08, ease: "easeInOut" }}
          />

          {/* ── Outer bloom sweep — wide, very blurred, the "halo" ─────────── */}
          <motion.div
            className="absolute"
            style={{
              top: "37%",
              left: "-35%",
              width: "170%",
              height: "90px",
              background:
                "linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.08) 20%, rgba(200,220,255,0.22) 45%, rgba(255,255,255,0.28) 50%, rgba(200,220,255,0.22) 55%, rgba(168,85,247,0.08) 80%, transparent 100%)",
              filter: "blur(22px)",
              willChange: "transform, opacity",
            }}
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: "100%", opacity: [0, 0.9, 0.9, 0] }}
            transition={{ duration: sweepDuration, ease: sweepEase }}
          />

          {/* ── Core flash body — thicker softened sweep ───────────────────── */}
          <motion.div
            className="absolute"
            style={{
              top: "44%",
              left: "-35%",
              width: "170%",
              height: "28px",
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 22%, rgba(255,255,255,0.65) 45%, rgba(220,240,255,0.90) 50%, rgba(255,255,255,0.65) 55%, rgba(255,255,255,0.15) 78%, transparent 100%)",
              filter: "blur(5px)",
              willChange: "transform, opacity",
            }}
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: "100%", opacity: [0, 1, 1, 0] }}
            transition={{ duration: sweepDuration, ease: sweepEase }}
          />

          {/* ── Inner bright core — thin high-intensity knife edge ──────────── */}
          <motion.div
            className="absolute"
            style={{
              top: "49.2%",
              left: "-35%",
              width: "170%",
              height: "5px",
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 28%, rgba(255,255,255,0.95) 48%, rgba(240,255,255,1) 50%, rgba(255,255,255,0.95) 52%, rgba(255,255,255,0.35) 72%, transparent 100%)",
              filter: "blur(1.5px)",
              willChange: "transform, opacity",
            }}
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: "100%", opacity: [0, 1, 1, 0] }}
            transition={{ duration: sweepDuration * 0.95, ease: sweepEase, delay: 0.01 }}
          />

          {/* ── Specular top edge highlight — razor-thin glint ─────────────── */}
          <motion.div
            className="absolute"
            style={{
              top: "48.5%",
              left: "-35%",
              width: "170%",
              height: "2px",
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0.7) 49%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.7) 51%, rgba(255,255,255,0) 70%, transparent 100%)",
              filter: "blur(0.5px)",
              willChange: "transform, opacity",
            }}
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: "100%", opacity: [0, 0.8, 0.8, 0] }}
            transition={{ duration: sweepDuration * 0.92, ease: sweepEase, delay: 0.015 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
