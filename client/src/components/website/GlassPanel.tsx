import { forwardRef, useCallback, useEffect, useRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "matte";
  glow?: "none" | "purple" | "cyan";
  hover?: boolean;
}

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, variant = "default", glow = "none", hover = false, children, style, onMouseMove, onMouseLeave, ...props }, ref) => {
    const isMobile = useIsMobile();
    const overlayRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // Cached bounding rect, updated on mount, resize, and mouseenter.
    // Never read inside mousemove to avoid per-frame layout thrash.
    const rectRef = useRef<DOMRect | null>(null);

    // Populate rect on mount and keep it fresh via ResizeObserver.
    // ResizeObserver callbacks run after layout, off the critical path.
    useEffect(() => {
      if (isMobile || !containerRef.current) return;
      const el = containerRef.current;
      rectRef.current = el.getBoundingClientRect();
      const ro = new ResizeObserver(() => {
        rectRef.current = el.getBoundingClientRect();
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, [isMobile]);

    // Re-read rect on mouseenter, handles page scroll shifting the element
    // position without needing a scroll listener.
    const handleMouseEnter = useCallback(() => {
      if (!isMobile && containerRef.current) {
        rectRef.current = containerRef.current.getBoundingClientRect();
      }
    }, [isMobile]);

    // Hot path: zero layout reads, uses cached rect only.
    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isMobile && overlayRef.current && rectRef.current) {
          const x = e.clientX - rectRef.current.left;
          const y = e.clientY - rectRef.current.top;
          overlayRef.current.style.setProperty("--mouse-x", `${x}px`);
          overlayRef.current.style.setProperty("--mouse-y", `${y}px`);
          overlayRef.current.style.opacity = "1";
        }
        onMouseMove?.(e);
      },
      [isMobile, onMouseMove]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (overlayRef.current) {
          overlayRef.current.style.opacity = "0";
        }
        onMouseLeave?.(e);
      },
      [onMouseLeave]
    );

    const variants = {
      default: "bg-white/[0.03] backdrop-blur-sm border border-white/[0.07] rounded-2xl",
      elevated: "bg-white/[0.05] backdrop-blur-md border border-white/[0.1] rounded-2xl shadow-2xl shadow-black/30",
      matte: "bg-[hsl(260,18%,9%)] border border-white/[0.06] rounded-2xl",
    };

    const glowStyles = {
      none: "",
      purple: "shadow-[0_0_80px_-20px_hsl(270_55%_50%/0.35),0_0_30px_-10px_hsl(280_50%_45%/0.2)]",
      cyan: "shadow-[0_0_80px_-20px_hsl(190_85%_45%/0.25),0_0_30px_-10px_hsl(190_90%_50%/0.15)]",
    };

    const innerShadow = variant === "elevated"
      ? "inset 0 1px 0 0 rgba(255,255,255,0.06), inset 0 0 30px rgba(139,92,246,0.04), 0 0 40px -10px rgba(139,92,246,0.12)"
      : variant === "default"
      ? "inset 0 1px 0 0 rgba(255,255,255,0.04)"
      : "inset 0 1px 0 0 rgba(255,255,255,0.02)";

    const mergedRef = (node: HTMLDivElement | null) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    };

    return (
      <div
        ref={mergedRef}
        className={cn(
          "relative overflow-hidden",
          variants[variant],
          glowStyles[glow],
          hover && "transition-all duration-300 hover:border-white/[0.14] hover:bg-white/[0.06] hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/8",
          className
        )}
        style={{
          boxShadow: innerShadow,
          ...style,
        }}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        {!isMobile && (
          <div
            ref={overlayRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 rounded-2xl opacity-0 transition-opacity duration-300"
            style={{
              background: "radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255,255,255,0.12), transparent 60%)",
            }}
          />
        )}
        {children}
      </div>
    );
  }
);

GlassPanel.displayName = "GlassPanel";
