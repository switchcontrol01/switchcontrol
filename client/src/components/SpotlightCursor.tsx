import { useEffect, useState, useRef } from 'react';
import { useMotion } from '@/lib/motion';

export function SpotlightCursor() {
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(true);
  const { prefersReducedMotion } = useMotion();
  const rafRef = useRef<number | undefined>(undefined);
  const targetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  useEffect(() => {
    if (isMobile) return;

    let isTabVisible = true;

    const handleMouseMove = (e: MouseEvent) => {
      targetRef.current = { x: e.clientX, y: e.clientY };
      if (!isVisible) setIsVisible(true);
    };

    const handleMouseLeave = () => {
      setIsVisible(false);
    };

    const handleVisibilityChange = () => {
      isTabVisible = document.visibilityState === 'visible';
      if (isTabVisible) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    const smoothness = prefersReducedMotion ? 0.15 : 0.08;
    
    const animate = () => {
      if (!isTabVisible) return;
      
      setPosition(prev => ({
        x: prev.x + (targetRef.current.x - prev.x) * smoothness,
        y: prev.y + (targetRef.current.y - prev.y) * smoothness,
      }));
      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isMobile, prefersReducedMotion]);

  if (isMobile) return null;

  if (prefersReducedMotion) {
    return (
      <div
        className="fixed pointer-events-none"
        style={{
          left: position.x,
          top: position.y,
          width: 600,
          height: 600,
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.04) 0%, rgba(139, 92, 246, 0.01) 30%, transparent 70%)',
          opacity: isVisible ? 0.7 : 0,
          zIndex: 1,
          transition: 'left 0.5s ease-out, top 0.5s ease-out, opacity 0.5s',
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className="fixed pointer-events-none transition-opacity duration-500"
      style={{
        left: position.x,
        top: position.y,
        width: 600,
        height: 600,
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, rgba(139, 92, 246, 0.02) 30%, transparent 70%)',
        opacity: isVisible ? 1 : 0,
        zIndex: 1,
      }}
      aria-hidden="true"
    />
  );
}
