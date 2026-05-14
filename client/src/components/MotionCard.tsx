import { motion } from "framer-motion";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useMotion } from "@/lib/motion";

interface MotionCardProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  onClick?: () => void;
}

export function MotionCard({
  children,
  className,
  delay = 0,
  onClick,
}: MotionCardProps) {
  const { prefersReducedMotion } = useMotion();

  return (
    <motion.div
      className={cn(
        "rounded-xl border border-[#2A313A] bg-card/50 backdrop-blur-sm",
        onClick && "cursor-pointer",
        className
      )}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={prefersReducedMotion ? false : { opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}

export function MotionButton({
  children,
  className,
  variant = "default",
  disabled,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "ghost" | "premium";
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
}) {
  const { prefersReducedMotion } = useMotion();

  return (
    <motion.button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-lg px-4 py-2 font-medium transition-colors",
        variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "ghost" && "hover:bg-[#21262D]",
        variant === "premium" && "bg-gradient-to-r from-purple-600 to-pink-600 text-white",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      transition={{ duration: 0.12 }}
    >
      {children}
    </motion.button>
  );
}

export function StaggerContainer({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { prefersReducedMotion } = useMotion();

  return (
    <motion.div
      className={className}
      initial="initial"
      animate="animate"
      variants={prefersReducedMotion ? undefined : {
        initial: {},
        animate: {
          transition: {
            staggerChildren: 0.05,
            delayChildren: delay,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { prefersReducedMotion } = useMotion();

  return (
    <motion.div
      className={className}
      variants={prefersReducedMotion ? undefined : {
        initial: { opacity: 0, y: 12 },
        animate: { 
          opacity: 1, 
          y: 0,
          transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
        },
      }}
    >
      {children}
    </motion.div>
  );
}
