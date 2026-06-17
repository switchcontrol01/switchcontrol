import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CameraGlowProps {
  active: boolean;
  onComplete?: () => void;
}

const BLOOM_DURATION = 2400;
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

  // ── GPU layer pre-warming ────────────────────────────────────────────────
  // The outer <div> with filter:blur(12px) is ALWAYS rendered — even when
  // the glow is not active. This causes Chromium to create and texture the
  // GPU compositing layer during the Splash phase, while the window is still
  // hidden (show:false). By the time mainWindow.show() is called and the glow
  // later activates at splashDone (T≈2500ms), the GPU layer already exists
  // with a valid texture. Activating the glow merely updates the texture
  // content rather than promoting a brand-new layer, which eliminates the
  // one-frame white stall that Windows shows when a new full-screen GPU
  // compositing layer is promoted while the window is already visible.
  //
  // Without this, the layer is promoted exactly when the Splash exits, and
  // the compositor's uninitialized texture flashes white for one frame before
  // the actual content is composited — even though the outer div's opacity
  // starts at 0, the sub-layer textures take one frame to populate.
  return (
    <div
      className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden"
      style={{ filter: "blur(12px)" }}
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
          >
            {/* ── Outermost ambient field — full screen dispersion ─────────── */}
            <motion.div
              className="absolute"
              style={{
                left: "50%", top: "50%",
                width: "240vw", height: "240vw",
                marginLeft: "-120vw", marginTop: "-120vw",
                background:
                  "radial-gradient(ellipse, rgba(139,92,246,0.16) 0%, rgba(0,180,255,0.08) 30%, transparent 60%)",
              }}
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: [0.2, 1.4, 1.65], opacity: [0, 0.95, 0] }}
              transition={{ duration: 2.4, ease: EASE_OUT_EXPO }}
            />

            {/* ── Purple primary bloom ──────────────────────────────────────── */}
            <motion.div
              className="absolute"
              style={{
                left: "50%", top: "50%",
                width: "130vw", height: "130vw",
                marginLeft: "-65vw", marginTop: "-65vw",
                background:
                  "radial-gradient(ellipse, rgba(255,255,255,0.12) 0%, rgba(210,185,255,0.24) 18%, rgba(139,92,246,0.18) 42%, transparent 66%)",
              }}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 1.18, 1.32], opacity: [0, 1, 0] }}
              transition={{ duration: 2.1, ease: EASE_OUT_EXPO, delay: 0.05 }}
            />

            {/* ── Cyan complementary ring — color fringe ───────────────────── */}
            <motion.div
              className="absolute"
              style={{
                left: "50%", top: "50%",
                width: "110vw", height: "110vw",
                marginLeft: "-55vw", marginTop: "-55vw",
                background:
                  "radial-gradient(ellipse, transparent 30%, rgba(0,210,255,0.14) 55%, transparent 72%)",
              }}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: [0.4, 1.1, 1.22], opacity: [0, 0.85, 0] }}
              transition={{ duration: 1.9, ease: EASE_OUT_EXPO, delay: 0.1 }}
            />

            {/* ── Mid corona ───────────────────────────────────────────────── */}
            <motion.div
              className="absolute"
              style={{
                left: "50%", top: "50%",
                width: "75vw", height: "75vw",
                marginLeft: "-37.5vw", marginTop: "-37.5vw",
                background:
                  "radial-gradient(ellipse, rgba(255,255,255,0.18) 0%, rgba(220,200,255,0.28) 25%, rgba(0,200,255,0.12) 50%, transparent 70%)",
              }}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: [0.4, 1.08, 1.18], opacity: [0, 1, 0] }}
              transition={{ duration: 1.7, ease: EASE_OUT_EXPO, delay: 0.12 }}
            />

            {/* ── Pink/magenta accent ring ──────────────────────────────────── */}
            <motion.div
              className="absolute"
              style={{
                left: "50%", top: "50%",
                width: "55vw", height: "55vw",
                marginLeft: "-27.5vw", marginTop: "-27.5vw",
                background:
                  "radial-gradient(ellipse, transparent 25%, rgba(236,72,153,0.12) 48%, transparent 68%)",
              }}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: [0.5, 1.05, 1.12], opacity: [0, 0.7, 0] }}
              transition={{ duration: 1.6, ease: EASE_OUT_EXPO, delay: 0.15 }}
            />

            {/* ── Bright inner core ─────────────────────────────────────────── */}
            <motion.div
              className="absolute"
              style={{
                left: "50%", top: "50%",
                width: "34vw", height: "34vw",
                marginLeft: "-17vw", marginTop: "-17vw",
                background:
                  "radial-gradient(ellipse, rgba(255,255,255,0.28) 0%, rgba(230,215,255,0.22) 30%, rgba(0,220,255,0.10) 55%, transparent 68%)",
              }}
              initial={{ scale: 0.55, opacity: 0 }}
              animate={{ scale: [0.55, 1.02, 1.06], opacity: [0, 1, 0] }}
              transition={{ duration: 1.4, ease: EASE_OUT_EXPO, delay: 0.18 }}
            />

            {/* ── Specular pin-point ────────────────────────────────────────── */}
            <motion.div
              className="absolute"
              style={{
                left: "50%", top: "50%",
                width: "10vw", height: "10vw",
                marginLeft: "-5vw", marginTop: "-5vw",
                background:
                  "radial-gradient(ellipse, rgba(255,255,255,0.45) 0%, rgba(200,240,255,0.25) 38%, transparent 70%)",
              }}
              initial={{ scale: 0.65, opacity: 0 }}
              animate={{ scale: [0.65, 1.0, 1.0], opacity: [0, 1, 0] }}
              transition={{ duration: 1.1, ease: EASE_OUT_EXPO, delay: 0.22 }}
            />

            {/* ── Horizontal lens streak ────────────────────────────────────── */}
            <motion.div
              className="absolute"
              style={{
                left: "-10%", top: "50%",
                width: "120%", height: "2px",
                marginTop: "-1px",
                background:
                  "linear-gradient(90deg, transparent, rgba(168,85,247,0.4), rgba(255,255,255,0.6), rgba(0,210,255,0.4), transparent)",
              }}
              initial={{ opacity: 0, scaleX: 0.2 }}
              animate={{ opacity: [0, 0.85, 0], scaleX: [0.2, 1, 1] }}
              transition={{ duration: 0.9, ease: EASE_OUT_EXPO, delay: 0.2 }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
