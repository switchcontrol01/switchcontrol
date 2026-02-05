import { motion } from "framer-motion";

interface LockIconProps {
  locked: boolean;
  size?: number;
  className?: string;
}

export function LockIcon({ locked, size = 48, className = "" }: LockIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <motion.path
        d="M6 10V7C6 4.79086 7.79086 3 10 3H14C16.2091 3 18 4.79086 18 7V10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        animate={{
          d: locked 
            ? "M6 10V7C6 4.79086 7.79086 3 10 3H14C16.2091 3 18 4.79086 18 7V10"
            : "M6 10V7C6 4.79086 7.79086 3 10 3H14C16.2091 3 18 4.79086 18 7V7",
          rotate: locked ? 0 : -30,
          originX: "18px",
          originY: "10px",
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
      <rect
        x="4"
        y="10"
        width="16"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <motion.circle
        cx="12"
        cy="15"
        r="1.5"
        fill="currentColor"
        animate={{
          scale: locked ? 1 : 1.2,
          fill: locked ? "currentColor" : "hsl(142, 76%, 50%)",
        }}
        transition={{ duration: 0.2 }}
      />
      <motion.path
        d="M12 16.5V18.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        animate={{
          opacity: locked ? 1 : 0,
        }}
        transition={{ duration: 0.2 }}
      />
    </svg>
  );
}

export function AnimatedLockIcon({ 
  onUnlock,
  size = 64,
  className = "",
}: { 
  onUnlock?: () => void;
  size?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ scale: 1 }}
      animate={{
        x: [0, -3, 3, -2, 2, 0],
      }}
      transition={{ duration: 0.4, delay: 0.1 }}
      onAnimationComplete={onUnlock}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
      >
        <motion.g
          initial={{ rotate: 0, originX: "18px", originY: "10px" }}
          animate={{ rotate: -30 }}
          transition={{ duration: 0.3, delay: 0.4, ease: "easeOut" }}
        >
          <path
            d="M6 10V7C6 4.79086 7.79086 3 10 3H14C16.2091 3 18 4.79086 18 7V10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </motion.g>
        <rect
          x="4"
          y="10"
          width="16"
          height="12"
          rx="2"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
        <motion.circle
          cx="12"
          cy="15"
          r="1.5"
          initial={{ fill: "currentColor" }}
          animate={{ fill: "hsl(142, 76%, 50%)", scale: 1.3 }}
          transition={{ duration: 0.3, delay: 0.5 }}
        />
      </svg>
    </motion.div>
  );
}
