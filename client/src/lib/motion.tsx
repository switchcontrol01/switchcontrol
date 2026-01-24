import { motion, AnimatePresence, Variants } from "framer-motion";
import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
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

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
}

export function Reveal({ 
  children, 
  className,
  delay = 0,
  duration = 0.5,
  direction = 'up',
  distance = 24
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const { prefersReducedMotion } = useMotion();

  useEffect(() => {
    // Always use IntersectionObserver for scroll reveal
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { 
        threshold: 0.1, 
        rootMargin: "0px 0px -5% 0px" // Slightly less aggressive margin
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  const getTransform = () => {
    if (isVisible) return 'translate(0, 0)';
    // Reduce distance for reduced motion, but still animate
    const actualDistance = prefersReducedMotion ? distance * 0.3 : distance;
    switch (direction) {
      case 'up': return `translateY(${actualDistance}px)`;
      case 'down': return `translateY(-${actualDistance}px)`;
      case 'left': return `translateX(${actualDistance}px)`;
      case 'right': return `translateX(-${actualDistance}px)`;
      default: return `translateY(${actualDistance}px)`;
    }
  };

  // Reduce duration for reduced motion, but don't eliminate
  const actualDuration = prefersReducedMotion ? duration * 0.5 : duration;

  return (
    <div
      ref={ref}
      className={cn(className)}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: getTransform(),
        transition: `opacity ${actualDuration}s ease-out ${delay}s, transform ${actualDuration}s ease-out ${delay}s`,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
}

export { motion, AnimatePresence };
