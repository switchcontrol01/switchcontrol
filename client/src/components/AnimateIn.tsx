import { useEffect, useRef, useState, ReactNode } from "react";
import { useMotion } from "@/lib/motion";

interface AnimateInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export default function AnimateIn({ children, delay = 0, className = "" }: AnimateInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { prefersReducedMotion } = useMotion();
  const [visible, setVisible] = useState(false);
  const hasTriggered = useRef(false);

  useEffect(() => {
    if (hasTriggered.current) return;
    
    const el = ref.current;
    if (!el) {
      hasTriggered.current = true;
      setVisible(true);
      return;
    }

    const triggerAnimation = () => {
      if (hasTriggered.current) return;
      hasTriggered.current = true;
      setTimeout(() => setVisible(true), delay);
    };

    // Create observer that triggers on any intersection
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          triggerAnimation();
          observer.disconnect();
        }
      },
      { 
        threshold: 0,
        rootMargin: "100px 0px 0px 0px"
      }
    );

    observer.observe(el);

    // CRITICAL: Also check immediately after mount for desktop
    // Use RAF to ensure layout is complete
    requestAnimationFrame(() => {
      if (hasTriggered.current) return;
      const rect = el.getBoundingClientRect();
      const inViewport = rect.top < window.innerHeight + 100 && rect.bottom > -100;
      if (inViewport) {
        triggerAnimation();
        observer.disconnect();
      }
    });

    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      style={{ 
        transitionDelay: `${delay}ms`,
        willChange: visible ? 'auto' : 'transform, opacity, filter',
        filter: visible ? 'blur(0px)' : prefersReducedMotion ? 'none' : 'blur(6px)',
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      className={`transition-all ${prefersReducedMotion ? 'duration-400' : 'duration-700'}
        ${visible ? "opacity-100 translate-y-0" : `opacity-0 ${prefersReducedMotion ? 'translate-y-2' : 'translate-y-6'}`}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

export { AnimateIn };
