import { useRef, useState, useEffect, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AnimateInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  once?: boolean;
  threshold?: number;
  triggerOnMount?: boolean;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function AnimateIn({
  children,
  className,
  delay = 0,
  duration = 700,
  once = true,
  threshold = 0.15,
  triggerOnMount = false,
}: AnimateInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const reducedMotion = prefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      setIsVisible(true);
      setMounted(true);
      return;
    }

    const timer = setTimeout(() => setMounted(true), 50);

    if (triggerOnMount) {
      const mountTimer = setTimeout(() => setIsVisible(true), 100);
      return () => {
        clearTimeout(timer);
        clearTimeout(mountTimer);
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) observer.disconnect();
        }
      },
      { 
        threshold, 
        rootMargin: '0px 0px -10% 0px' 
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [reducedMotion, once, threshold, triggerOnMount]);

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all ease-out',
        className
      )}
      style={{
        opacity: mounted && isVisible ? 1 : 0,
        transform: mounted && isVisible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.98)',
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export function AnimateInGroup({
  children,
  className,
  staggerDelay = 120,
}: {
  children: ReactNode[];
  className?: string;
  staggerDelay?: number;
}) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <AnimateIn key={i} delay={i * staggerDelay}>
          {child}
        </AnimateIn>
      ))}
    </div>
  );
}
