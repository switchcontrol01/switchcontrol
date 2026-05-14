import { useRef, useEffect, useState, type ReactNode } from "react";
import { motion } from "@/lib/motion";

interface DrawUnderlineProps {
  children: ReactNode;
  className?: string;
  underlineColor?: string;
  glowColor?: string;
  trigger?: "hover" | "scroll" | "both";
}

export default function DrawUnderline({
  children,
  className = "",
  underlineColor = "hsl(190,85%,55%)",
  glowColor = "hsl(190,85%,55%,0.4)",
  trigger = "both",
}: DrawUnderlineProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (trigger === "hover" || trigger === "both") return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setActive(true);
      },
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [trigger]);

  return (
    <span
      ref={ref}
      className={`relative inline ${className}`}
      onMouseEnter={() =>
        (trigger === "hover" || trigger === "both") && setActive(true)
      }
      onMouseLeave={() =>
        (trigger === "hover" || trigger === "both") && setActive(false)
      }
      style={{ cursor: "default" }}
    >
      {children}
      <svg
        className="absolute -bottom-1 left-0 w-full overflow-visible pointer-events-none"
        viewBox="0 0 100 6"
        height="6"
        preserveAspectRatio="none"
      >
        <motion.path
          d="M0,3 Q25,6 50,3 T100,3"
          fill="none"
          stroke={underlineColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={
            active
              ? { pathLength: 1, opacity: 1 }
              : { pathLength: 0, opacity: 0 }
          }
          transition={{ duration: 0.5, ease: "easeInOut" }}
          style={{
            filter: active ? `drop-shadow(0 0 4px ${glowColor})` : "none",
            transition: "filter 0.3s ease",
          }}
        />
      </svg>
    </span>
  );
}
