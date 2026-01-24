import { useEffect, useRef, useState, ReactNode, useLayoutEffect } from "react";

interface AnimateInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export default function AnimateIn({ children, delay = 0, className = "" }: AnimateInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const hasChecked = useRef(false);

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    // Handle reduced motion - still animate but immediately
    const prefersReduced = typeof window !== 'undefined' && 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const el = ref.current;
    if (!el) {
      setVisible(true);
      return;
    }

    // CRITICAL FIX: Check if element is already in viewport on mount
    // This fixes desktop where hero is visible immediately on load
    const checkIfVisible = () => {
      const rect = el.getBoundingClientRect();
      const inViewport = (
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
      );
      
      if (inViewport) {
        // Element is already visible, trigger animation after delay
        const timer = setTimeout(() => setVisible(true), delay);
        return () => clearTimeout(timer);
      }
      return null;
    };

    // First check if already visible
    const cleanup = checkIfVisible();
    if (cleanup || visible) {
      return cleanup || undefined;
    }

    // If not visible, use IntersectionObserver for scroll reveal
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { 
        threshold: 0.05, // Lower threshold for easier triggering
        rootMargin: "50px 0px 0px 0px" // Add margin at top to trigger earlier
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay, visible]);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
      className={`transition-all duration-700 ease-out
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

export { AnimateIn };
