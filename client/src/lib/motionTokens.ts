/**
 * motionTokens.ts
 *
 * Single import point for all animation tokens, presets, and hooks.
 * Backed by motion.tsx — never import framer-motion directly in component files.
 *
 * Usage:
 *   import { timing, easing, springs, fadeIn, slideUp, ... } from "@/lib/motionTokens";
 *
 * Token categories:
 *   timing    — duration presets in seconds  (fast / normal / slow / page)
 *   easing    — cubic-bezier curve presets   (smooth / snappy / bounce / gentle)
 *   springs   — spring physics presets       (snappy / gentle / bouncy)
 *
 * Variant presets (Framer-Motion Variants):
 *   fadeIn, slideUp, slideIn, scaleIn, popIn
 *   staggerContainer, staggerItem
 *   sidebarSlide, pageTransition
 *   modalBackdrop, modalContent, pillIndicator
 *
 * Hover / interaction presets:
 *   cardHover, buttonPress, microHover, glowHover, liftHover
 *
 * Entrance presets (ready-to-spread):
 *   entrancePresets.fadeUp / fadeIn / scaleUp / slideRight
 *
 * Spring configs:
 *   toggleSpring
 *
 * Components / hooks re-exported:
 *   motion            — framer-motion motion proxy
 *   AnimatePresence   — framer-motion AnimatePresence
 *   Reveal            — scroll-reveal wrapper component
 *   MotionProvider    — context provider (mount in root)
 *   useMotion         — hook: { prefersReducedMotion }
 */

export {
  // Tokens
  timing,
  easing,
  springs,
  toggleSpring,

  // Variants
  fadeIn,
  slideUp,
  slideIn,
  scaleIn,
  popIn,
  staggerContainer,
  staggerItem,
  sidebarSlide,
  pageTransition,
  cardHover,
  buttonPress,
  microHover,
  glowHover,
  liftHover,
  entrancePresets,
  modalBackdrop,
  modalContent,
  pillIndicator,

  // Components & hooks
  motion,
  AnimatePresence,
  Reveal,
  MotionProvider,
  useMotion,
} from "@/lib/motion";
