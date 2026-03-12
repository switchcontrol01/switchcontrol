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

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          triggerAnimation();
          observer.disconnect();
        }
      },
      {
        root: null,
        rootMargin: "0px 0px -10% 0px",
        threshold: 0.15,
      }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={`animate-in-wrapper ${visible ? "animate-in-visible" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export { AnimateIn };
