import { motion, AnimatePresence, Variants, useInView } from "framer-motion";
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

const MotionContext = createContext({ prefersReducedMotion: false, hasLoaded: false });

export function MotionProvider({ children }: { children: ReactNode }) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    // Only respect reduced motion if user has EXPLICITLY set it in their OS
    // Check the media query directly and be less aggressive
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    // Only disable animations if the preference is explicitly set
    // Many browsers/systems don't set this, so default to animations ON
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      // Be conservative: only disable if explicitly requested
      setPrefersReducedMotion(e.matches);
    };
    
    handleChange(mediaQuery);
    mediaQuery.addEventListener('change', handleChange);
    
    const timer = setTimeout(() => setHasLoaded(true), 100);
    
    // Debug check for animation blocking - log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[SwitchControl Animation Debug]', {
        prefersReducedMotion: mediaQuery.matches,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        isMobile: window.innerWidth < 768,
        userAgent: navigator.userAgent
      });
    }
    
    return () => {
      clearTimeout(timer);
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return (
    <MotionContext.Provider value={{ prefersReducedMotion, hasLoaded }}>
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

export const pageTransition: Variants = {
  initial: { opacity: 0, x: 10 },
  animate: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.25, ease: "easeOut" }
  },
  exit: { 
    opacity: 0, 
    x: -10,
    transition: { duration: 0.15, ease: "easeIn" }
  },
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

export const glowHover = {
  rest: { 
    boxShadow: "0 0 0 rgba(139, 92, 246, 0)",
  },
  hover: { 
    boxShadow: "0 0 20px rgba(139, 92, 246, 0.15)",
    transition: { duration: 0.2 }
  },
};

export const liftHover = {
  rest: { y: 0, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" },
  hover: { 
    y: -2, 
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2)",
    transition: { duration: 0.2, ease: "easeOut" }
  },
};

// Timing presets
export const timing = {
  fast: 0.12,
  normal: 0.2,
  slow: 0.3,
  page: 0.25,
};

// Easing presets
export const easing = {
  smooth: [0.25, 0.1, 0.25, 1],
  snappy: [0.4, 0, 0.2, 1],
  bounce: [0.68, -0.55, 0.265, 1.55],
  gentle: [0.22, 1, 0.36, 1],
};

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
};

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
  blur?: number;
  once?: boolean;
}

export function Reveal({
  children,
  className,
  delay = 0,
  y = 14,
  blur = 6,
  once = true,
  ...rest
}: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, {
    once,
    margin: "0px 0px -8% 0px",
    amount: 0.12,
  });

  return (
    <motion.div
      ref={ref}
      className={cn(className)}
      initial={{ opacity: 0, y, filter: `blur(${blur}px)` }}
      animate={
        inView
          ? { opacity: 1, y: 0, filter: "blur(0px)" }
          : { opacity: 0, y, filter: `blur(${blur}px)` }
      }
      transition={{
        duration: 0.55,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      {...(rest as object)}
    >
      {children}
    </motion.div>
  );
}

export function RevealGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
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
  return (
    <motion.div
      className={cn(className)}
      variants={{
        hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
        visible: {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          transition: {
            duration: 0.55,
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
