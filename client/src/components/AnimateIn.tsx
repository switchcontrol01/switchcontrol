import { useEffect, useRef, useState, ReactNode } from "react";

interface AnimateInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export default function AnimateIn({ children, delay = 0, className = "" }: AnimateInProps) {
  const ref = useRef<HTMLDivElement>(null);
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
        willChange: visible ? 'auto' : 'transform, opacity'
      }}
      className={`transition-all duration-700 ease-out
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

export { AnimateIn };
