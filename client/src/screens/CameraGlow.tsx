import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CameraGlowProps {
  active: boolean;
  onComplete?: () => void;
}

const BLOOM_DURATION = 1900;
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export default function CameraGlow({ active, onComplete }: CameraGlowProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, BLOOM_DURATION);
      return () => clearTimeout(timer);
    }
  }, [active, onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
        >
          {/* ── Outermost ambient field — energy dispersing into darkness ─── */}
          <motion.div
            className="absolute"
            style={{
              left: "50%",
              top: "50%",
              width: "220vw",
              height: "220vw",
              marginLeft: "-110vw",
              marginTop: "-110vw",
              background:
                "radial-gradient(ellipse, rgba(139,92,246,0.13) 0%, rgba(100,60,200,0.07) 30%, transparent 60%)",
              filter: "blur(90px)",
              willChange: "transform, opacity",
            }}
            initial={{ scale: 0.25, opacity: 0 }}
            animate={{
              scale:   [0.25, 1.3, 1.55],
              opacity: [0,    0.85, 0],
            }}
            transition={{ duration: 1.9, ease: EASE_OUT_EXPO }}
          />

          {/* ── Primary bloom — the main cinematic glow, warm purple-white ─── */}
          <motion.div
            className="absolute"
            style={{
              left: "50%",
              top: "50%",
              width: "120vw",
              height: "120vw",
              marginLeft: "-60vw",
              marginTop: "-60vw",
              background:
                "radial-gradient(ellipse, rgba(255,255,255,0.11) 0%, rgba(210,185,255,0.18) 20%, rgba(139,92,246,0.13) 45%, transparent 68%)",
              filter: "blur(44px)",
              willChange: "transform, opacity",
            }}
            initial={{ scale: 0.35, opacity: 0 }}
            animate={{
              scale:   [0.35, 1.15, 1.28],
              opacity: [0,    1,    0],
            }}
            transition={{ duration: 1.7, ease: EASE_OUT_EXPO, delay: 0.06 }}
          />

          {/* ── Mid corona — slightly tighter, peaks a beat later ──────────── */}
          <motion.div
            className="absolute"
            style={{
              left: "50%",
              top: "50%",
              width: "70vw",
              height: "70vw",
              marginLeft: "-35vw",
              marginTop: "-35vw",
              background:
                "radial-gradient(ellipse, rgba(255,255,255,0.16) 0%, rgba(220,200,255,0.22) 28%, rgba(168,85,247,0.10) 55%, transparent 72%)",
              filter: "blur(22px)",
              willChange: "transform, opacity",
            }}
            initial={{ scale: 0.45, opacity: 0 }}
            animate={{
              scale:   [0.45, 1.05, 1.15],
              opacity: [0,    1,    0],
            }}
            transition={{ duration: 1.5, ease: EASE_OUT_EXPO, delay: 0.12 }}
          />

          {/* ── Bright inner core — soft white heart of the bloom ──────────── */}
          <motion.div
            className="absolute"
            style={{
              left: "50%",
              top: "50%",
              width: "32vw",
              height: "32vw",
              marginLeft: "-16vw",
              marginTop: "-16vw",
              background:
                "radial-gradient(ellipse, rgba(255,255,255,0.22) 0%, rgba(230,215,255,0.18) 35%, transparent 65%)",
              filter: "blur(10px)",
              willChange: "transform, opacity",
            }}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{
              scale:   [0.6, 1.0, 1.05],
              opacity: [0,   1,   0],
            }}
            transition={{ duration: 1.2, ease: EASE_OUT_EXPO, delay: 0.18 }}
          />

          {/* ── Specular pin-point — tiny bright centre, last to fade ─────── */}
          <motion.div
            className="absolute"
            style={{
              left: "50%",
              top: "50%",
              width: "10vw",
              height: "10vw",
              marginLeft: "-5vw",
              marginTop: "-5vw",
              background:
                "radial-gradient(ellipse, rgba(255,255,255,0.35) 0%, rgba(240,230,255,0.20) 40%, transparent 70%)",
              filter: "blur(4px)",
              willChange: "transform, opacity",
            }}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{
              scale:   [0.7, 1.0, 1.0],
              opacity: [0,   1,   0],
            }}
            transition={{ duration: 1.0, ease: EASE_OUT_EXPO, delay: 0.22 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
