import { motion, AnimatePresence, Variants, useInView } from "framer-motion";
import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

const MotionContext = createContext({ prefersReducedMotion: false });

export function MotionProvider({ children }: { children: ReactNode }) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setPrefersReducedMotion(e.matches);
    };
    handleChange(mediaQuery);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return (
    <MotionContext.Provider value={{ prefersReducedMotion }}>
      {children}
    </MotionContext.Provider>
  );
}

export function useMotion() {
  return useContext(MotionContext);
}

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const slideUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export const slideIn: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 25 }
  },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
};

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 15 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" }
  },
};

export const sidebarSlide: Variants = {
  initial: { opacity: 0, x: -30 },
  animate: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }
  },
};

// Intentional no-op — used as a pass-through so callers can unconditionally
// spread a transition variant prop without needing to branch on whether
// page transitions are enabled. All states are identical by design.
export const pageTransition: Variants = {
  initial: { opacity: 1, x: 0 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 1, x: 0 },
};

export const cardHover = {
  rest: { scale: 1, y: 0 },
  hover: { 
    scale: 1.02, 
    y: -4,
    transition: { duration: 0.2, ease: "easeOut" }
  },
};

export const buttonPress = {
  rest: { scale: 1 },
  hover: { scale: 1.02 },
  tap: { scale: 0.97 },
};

// Premium micro-interactions
export const microHover = {
  rest: { scale: 1, y: 0 },
  hover: { 
    scale: 1.01, 
    y: -1,
    transition: { duration: 0.15, ease: "easeOut" }
  },
};

// NOTE: boxShadow is intentionally absent from both glowHover and liftHover.
// Animating box-shadow forces a full CPU-side repaint on every frame of the
// hover transition — the same class of bug as the CSS background-position
// animations on the landing page.
//
// To add a hover glow visually, use a CSS ::before/::after pseudo-element
// that has the shadow as a static style, then animate its opacity with a
// CSS transition (e.g. `.card::after { box-shadow: …; opacity: 0; transition: opacity 0.2s }
// .card:hover::after { opacity: 1 }`). The shadow is painted once; only
// the opacity change runs on the compositor — zero repaint per frame.
export const glowHover = {
  rest: {
    scale: 1,
  },
  hover: {
    scale: 1.005,
    transition: { duration: 0.2 },
  },
};

export const liftHover = {
  rest: { y: 0 },
  hover: { 
    y: -2,
    transition: { duration: 0.2, ease: "easeOut" }
  },
};

// Timing presets (as const prevents accidental mutation of shared references)
export const timing = {
  fast: 0.12,
  normal: 0.2,
  slow: 0.3,
  page: 0.25,
} as const;

// Easing presets (as const prevents accidental mutation of shared references)
// NOTE: easing.bounce has control-point values outside [0,1] — this is
// intentional (it produces an overshoot/bounce). Only pair it with
// transform/position properties, never with opacity or color: overshoot on
// those produces a visible flash rather than a bouncy feel.
export const easing = {
  smooth: [0.25, 0.1, 0.25, 1],
  snappy: [0.4, 0, 0.2, 1],
  bounce: [0.68, -0.55, 0.265, 1.55],
  gentle: [0.22, 1, 0.36, 1],
} as const;

// Spring presets
export const springs = {
  snappy: { type: "spring" as const, stiffness: 400, damping: 30 },
  gentle: { type: "spring" as const, stiffness: 200, damping: 25 },
  bouncy: { type: "spring" as const, stiffness: 300, damping: 20 },
};

// Entrance animations
export const entrancePresets = {
  fadeUp: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: timing.normal, ease: easing.gentle },
  },
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: timing.normal },
  },
  scaleUp: {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: timing.normal, ease: easing.gentle },
  },
  slideRight: {
    initial: { opacity: 0, x: -16 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: timing.normal, ease: easing.gentle },
  },
} as const;

export const toggleSpring = {
  type: "spring" as const,
  stiffness: 500,
  damping: 30,
};

export const modalBackdrop: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { type: "spring", stiffness: 350, damping: 30 }
  },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.1 } },
};

export const pillIndicator: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

interface RevealProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode;
  delay?: number;
  y?: number;
  once?: boolean;
}

export function Reveal({
  children,
  className,
  delay = 0,
  y = 10,
  once = true,
  ...rest
}: Omit<RevealProps, 'blur'>) {
  const { prefersReducedMotion } = useMotion();
  const ref = useRef<HTMLDivElement | null>(null);

  // skipAnim = true when the element is already in the viewport on mount.
  // useLayoutEffect fires synchronously before the first browser paint, so
  // setting this here prevents the opacity-0 → opacity-1 transition from
  // ever being painted — eliminating the black flash on tab/page navigation.
  //
  // Edge case: if async content above this element causes a reflow that pushes
  // it out of the viewport after this check runs, skipAnim remains true and the
  // element will appear immediately without animation. This is acceptable — the
  // alternative (a stale false that races with useInView) is worse.
  const [skipAnim, setSkipAnim] = useState(false);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (rect.top < window.innerHeight * 1.1 && rect.bottom > 0) {
      setSkipAnim(true);
    }
  }, []);

  const inView = useInView(ref, {
    once,
    margin: "0px 0px -5% 0px",
    amount: 0.08,
  });

  const isVisible = skipAnim || inView;

  // When the user prefers reduced motion, render immediately without any
  // position or opacity animation — the context is live and responds to
  // OS-level changes at runtime.
  if (prefersReducedMotion) {
    return (
      <div ref={ref} className={cn(className)} {...(rest as object)}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={cn(className)}
      initial={{ opacity: 0, y }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{
        duration: skipAnim ? 0 : 0.50,
        delay: skipAnim ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      {...(rest as object)}
    >
      {children}
    </motion.div>
  );
}

// NOTE on stagger child counts: staggerChildren: 0.08 means a list of N items
// takes N×0.08 s before the last item finishes. Keep consumers to ≤15 items,
// or reduce staggerChildren proportionally for larger lists. For lists of 20+
// items prefer individual Reveal wrappers with capped delays rather than
// RevealGroup so Framer Motion doesn't track intersection state for every child
// simultaneously.
export function RevealGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { prefersReducedMotion } = useMotion();

  if (prefersReducedMotion) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <motion.div
      className={cn(className)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "0px 0px -8% 0px", amount: 0.1 }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: 0.08,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { prefersReducedMotion } = useMotion();

  if (prefersReducedMotion) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <motion.div
      className={cn(className)}
      variants={{
        hidden: { opacity: 0, y: 10 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.50,
            ease: [0.22, 1, 0.36, 1],
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export { motion, AnimatePresence };
