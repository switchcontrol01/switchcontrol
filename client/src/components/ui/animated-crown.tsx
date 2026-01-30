import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";

interface AnimatedCrownProps {
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
  tooltipText?: string;
  onClick?: () => void;
  linkTo?: string;
  className?: string;
}

const sizeMap = {
  sm: { icon: 14, container: 28, glow: 20 },
  md: { icon: 18, container: 36, glow: 24 },
  lg: { icon: 24, container: 48, glow: 32 },
};

export function AnimatedCrown({
  size = "md",
  showTooltip = true,
  tooltipText = "Premium feature",
  onClick,
  linkTo = "/pricing",
  className,
}: AnimatedCrownProps) {
  const [isHovered, setIsHovered] = useState(false);
  const sizes = sizeMap[size];

  const content = (
    <motion.div
      className={cn(
        "relative flex items-center justify-center cursor-pointer",
        "rounded-full bg-[rgba(168,85,247,0.15)]",
        "transition-all duration-300",
        className
      )}
      style={{
        width: sizes.container,
        height: sizes.container,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      animate={{
        boxShadow: isHovered
          ? "0 0 32px rgba(168,85,247,0.6)"
          : [
              "0 0 24px rgba(168,85,247,0.25)",
              "0 0 24px rgba(168,85,247,0.45)",
              "0 0 24px rgba(168,85,247,0.25)",
            ],
      }}
      transition={{
        boxShadow: isHovered
          ? { duration: 0.2 }
          : {
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            },
      }}
    >
      <motion.div
        animate={{
          opacity: [0.8, 1, 0.8],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <Crown
          className="text-[hsl(270,60%,65%)]"
          style={{ width: sizes.icon, height: sizes.icon }}
        />
      </motion.div>

      <AnimatePresence>
        {isHovered && showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 shadow-xl whitespace-nowrap">
              <span className="text-xs text-white/90">{tooltipText}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  if (linkTo && !onClick) {
    return <Link href={linkTo}>{content}</Link>;
  }

  return content;
}

export function PremiumBadge({
  className,
  showCrown = true,
}: {
  className?: string;
  showCrown?: boolean;
}) {
  return (
    <motion.span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full",
        "text-xs font-medium",
        "bg-gradient-to-r from-[rgba(124,58,237,0.2)] to-[rgba(168,85,247,0.15)]",
        "border border-[rgba(168,85,247,0.3)]",
        "text-[hsl(270,60%,75%)]",
        className
      )}
      animate={{
        boxShadow: [
          "0 0 12px rgba(168,85,247,0.2)",
          "0 0 20px rgba(168,85,247,0.35)",
          "0 0 12px rgba(168,85,247,0.2)",
        ],
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      {showCrown && <Crown className="size-3" />}
      Premium
    </motion.span>
  );
}
