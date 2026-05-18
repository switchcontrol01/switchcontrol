import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { AnimatePresence, motion } from "@/lib/motionTokens";
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
  sm: { icon: 13, container: 24 },
  md: { icon: 16, container: 32 },
  lg: { icon: 20, container: 40 },
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
    <div
      className={cn(
        "relative flex items-center justify-center cursor-pointer rounded-md",
        "bg-[#21262D] border border-[#2A313A] hover:bg-[#21262D] transition-colors duration-150",
        className
      )}
      style={{ width: sizes.container, height: sizes.container }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <Crown
        className="text-[#00D4FF]/70"
        style={{ width: sizes.icon, height: sizes.icon }}
      />

      <AnimatePresence>
        {isHovered && showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="px-2.5 py-1 rounded-md bg-zinc-900 border border-[#2A313A] shadow-xl whitespace-nowrap">
              <span className="text-xs text-[#E6EAF0]">{tooltipText}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded",
        "text-[10px] font-semibold uppercase tracking-wide",
        "bg-[#00D4FF]/10 border border-[#00D4FF]/30 text-[#00D4FF]",
        className
      )}
    >
      {showCrown && <Crown className="size-2.5" />}
      Premium
    </span>
  );
}
