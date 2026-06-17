/**
 * NeuralScanField.tsx — premium animated neural/particle background.
 *
 * Canvas-based for performance: a bounded set of drifting nodes connected by
 * proximity lines (the classic "neural" look), tinted in brand cyan. DPR-aware,
 * fully cleaned up on unmount, and degrades to a static dim field when the user
 * prefers reduced motion.
 *
 * `intensity` (0–1) scales particle energy/brightness so callers can ramp the
 * field up as a scan progresses.
 */

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export function NeuralScanField({
  intensity = 1,
  className,
}: {
  intensity?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles: Particle[] = [];
    let raf = 0;
    let running = true;

    const LINK_DIST = 130;

    function seed() {
      // Particle count scales with area but stays bounded for perf.
      const target = Math.max(26, Math.min(64, Math.round((width * height) / 26000)));
      particles = Array.from({ length: target }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: 0.8 + Math.random() * 1.8,
      }));
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.max(1, Math.floor(width * dpr));
      canvas!.height = Math.max(1, Math.floor(height * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function drawStatic() {
      ctx!.clearRect(0, 0, width, height);
      for (const p of particles) {
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = "rgba(0,212,255,0.18)";
        ctx!.fill();
      }
    }

    function frame() {
      if (!running) return;
      const I = Math.max(0.15, Math.min(1, intensityRef.current));
      ctx!.clearRect(0, 0, width, height);

      // Move + draw nodes
      for (const p of particles) {
        p.x += p.vx * I;
        p.y += p.vy * I;
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;
      }

      // Links
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DIST) {
            const alpha = (1 - dist / LINK_DIST) * 0.28 * I;
            ctx!.strokeStyle = `rgba(0,212,255,${alpha.toFixed(3)})`;
            ctx!.lineWidth = 0.6;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      // Nodes (drawn on top of links)
      for (const p of particles) {
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(102,235,255,${(0.35 + 0.4 * I).toFixed(3)})`;
        ctx!.fill();
      }

      raf = requestAnimationFrame(frame);
    }

    resize();

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) drawStatic();
    });
    ro.observe(canvas);

    if (reduced) {
      drawStatic();
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
