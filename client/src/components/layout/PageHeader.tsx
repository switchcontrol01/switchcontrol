import { motion, Variants } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  icon: LucideIcon;
  iconClassName?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

const ease = [0.22, 1, 0.36, 1] as const;
const spring = [0.34, 1.56, 0.64, 1] as const;

export function PageHeader({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  badge,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <motion.div
      className={cn("flex items-start justify-between gap-4", className)}
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3 flex-wrap">
          <motion.span
            className="inline-flex"
            initial={{ rotate: -18, scale: 0.55, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ duration: 0.48, delay: 0.08, ease: spring }}
          >
            <Icon className={cn("size-8 text-primary", iconClassName)} />
          </motion.span>
          {title}
          {badge && <span className="inline-flex">{badge}</span>}
        </h1>
        {subtitle && (
          <motion.p
            className="text-muted-foreground mt-2 max-w-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.22 }}
          >
            {subtitle}
          </motion.p>
        )}
      </div>
      {actions && (
        <motion.div
          className="flex items-center gap-2 shrink-0 pt-1"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.15, ease }}
        >
          {actions}
        </motion.div>
      )}
    </motion.div>
  );
}

export const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function AnimatedSection({
  children,
  index = 0,
  className,
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      custom={index}
    >
      {children}
    </motion.div>
  );
}
