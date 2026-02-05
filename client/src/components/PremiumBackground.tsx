import { useEffect, useRef, memo } from "react";
import { useMotion } from "@/lib/motion";

interface ParticleConfig {
  count: number;
  speed: number;
  opacity: number;
  size: number;
}

const defaultParticleConfig: ParticleConfig = {
  count: 25,
  speed: 0.3,
  opacity: 0.08,
  size: 2,
};

export const PremiumParticles = memo(function PremiumParticles({ 
  config = defaultParticleConfig 
}: { 
  config?: Partial<ParticleConfig> 
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { prefersReducedMotion } = useMotion();
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
  }>>([]);

  const finalConfig = { ...defaultParticleConfig, ...config };

  useEffect(() => {
    if (prefersReducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    particlesRef.current = Array.from({ length: finalConfig.count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * finalConfig.speed,
      vy: (Math.random() - 0.5) * finalConfig.speed,
      size: Math.random() * finalConfig.size + 1,
      opacity: Math.random() * finalConfig.opacity,
    }));

    let isVisible = true;

    const handleVisibilityChange = () => {
      isVisible = document.visibilityState === 'visible';
      if (isVisible && !animationRef.current) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    const animate = () => {
      if (!isVisible) {
        animationRef.current = null;
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(139, 92, 246, ${p.opacity})`;
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [prefersReducedMotion, finalConfig.count, finalConfig.speed, finalConfig.opacity, finalConfig.size]);

  if (prefersReducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.6 }}
    />
  );
});

export const TopographicBackground = memo(function TopographicBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { prefersReducedMotion } = useMotion();

  useEffect(() => {
    if (prefersReducedMotion) return;

    const container = containerRef.current;
    if (!container) return;

    let mouseX = 0;
    let mouseY = 0;
    let currentX = 0;
    let currentY = 0;
    let animationId: number;
    let isVisible = true;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 20;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 20;
    };

    const handleVisibilityChange = () => {
      isVisible = document.visibilityState === 'visible';
      if (isVisible) {
        animationId = requestAnimationFrame(animate);
      }
    };

    const animate = () => {
      if (!isVisible) return;

      currentX += (mouseX - currentX) * 0.05;
      currentY += (mouseY - currentY) * 0.05;

      container.style.transform = `translate(${currentX}px, ${currentY}px)`;
      animationId = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    animationId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(animationId);
    };
  }, [prefersReducedMotion]);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <div
        ref={containerRef}
        className="absolute inset-[-50px] transition-transform duration-1000 ease-out"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cpath d='M0 50 Q25 30 50 50 T100 50' stroke='rgba(139,92,246,0.04)' fill='none' stroke-width='0.5'/%3E%3Cpath d='M0 60 Q25 40 50 60 T100 60' stroke='rgba(139,92,246,0.03)' fill='none' stroke-width='0.5'/%3E%3Cpath d='M0 40 Q25 20 50 40 T100 40' stroke='rgba(139,92,246,0.03)' fill='none' stroke-width='0.5'/%3E%3Cpath d='M0 70 Q25 50 50 70 T100 70' stroke='rgba(139,92,246,0.02)' fill='none' stroke-width='0.5'/%3E%3Cpath d='M0 30 Q25 10 50 30 T100 30' stroke='rgba(139,92,246,0.02)' fill='none' stroke-width='0.5'/%3E%3C/svg%3E")`,
          backgroundSize: "200px 200px",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" />
    </div>
  );
});

export const PremiumSheen = memo(function PremiumSheen({ 
  className = "",
  duration = 3000,
}: { 
  className?: string;
  duration?: number;
}) {
  const { prefersReducedMotion } = useMotion();
  const sheenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion) return;

    const sheen = sheenRef.current;
    if (!sheen) return;

    const animate = () => {
      sheen.style.animation = `sheen ${duration}ms ease-in-out`;
      sheen.addEventListener("animationend", () => {
        sheen.style.animation = "none";
        setTimeout(animate, duration * 2);
      }, { once: true });
    };

    const timeout = setTimeout(animate, 1000);
    return () => clearTimeout(timeout);
  }, [prefersReducedMotion, duration]);

  if (prefersReducedMotion) return null;

  return (
    <>
      <style>{`
        @keyframes sheen {
          0% { transform: translateX(-100%) skewX(-15deg); opacity: 0; }
          10% { opacity: 0.5; }
          90% { opacity: 0.5; }
          100% { transform: translateX(200%) skewX(-15deg); opacity: 0; }
        }
      `}</style>
      <div
        ref={sheenRef}
        className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      >
        <div
          className="absolute inset-0 w-1/3"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
            transform: "translateX(-100%) skewX(-15deg)",
          }}
        />
      </div>
    </>
  );
});

export const GlowOrb = memo(function GlowOrb({
  color = "rgba(139, 92, 246, 0.15)",
  size = 300,
  x = "50%",
  y = "50%",
  blur = 100,
}: {
  color?: string;
  size?: number;
  x?: string;
  y?: string;
  blur?: number;
}) {
  const { prefersReducedMotion } = useMotion();

  return (
    <div
      className="absolute pointer-events-none transition-all duration-1000"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        background: color,
        borderRadius: "50%",
        filter: `blur(${blur}px)`,
        transform: "translate(-50%, -50%)",
        animation: prefersReducedMotion ? "none" : "pulse-glow 8s ease-in-out infinite",
      }}
    />
  );
});
