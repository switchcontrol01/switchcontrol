import { useEffect } from "react";
import { motion } from "framer-motion";
import logoImg from "@/assets/logo.png";
import { Crown } from "lucide-react";

interface WelcomeAnimationProps {
  userName: string | null;
  isPremium?: boolean;
  onComplete: () => void;
}

export function WelcomeAnimation({ userName, isPremium, onComplete }: WelcomeAnimationProps) {
  useEffect(() => {
    const t = setTimeout(onComplete, 4400);
    return () => clearTimeout(t);
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden select-none"
      style={{ background: "linear-gradient(160deg, #07070f 0%, #0e0e1c 50%, #07070f 100%)" }}
    >
      {/* Ambient glow orb */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: "50%",
          top: "50%",
          width: "70vw",
          height: "70vw",
          marginLeft: "-35vw",
          marginTop: "-35vw",
          background:
            "radial-gradient(ellipse, rgba(139,92,246,0.22) 0%, rgba(0,180,255,0.07) 45%, transparent 70%)",
          filter: "blur(80px)",
        }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* Secondary pink accent */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: "60%",
          top: "30%",
          width: "30vw",
          height: "30vw",
          background:
            "radial-gradient(ellipse, rgba(236,72,153,0.1) 0%, transparent 65%)",
          filter: "blur(60px)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2, delay: 0.4, ease: "easeOut" }}
      />

      {/* Logo */}
      <motion.div
        className="relative mb-9"
        initial={{ scale: 0.5, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      >
        {/* Pulsing halo */}
        <motion.div
          className="absolute -inset-6 rounded-[40%] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse, rgba(139,92,246,0.28) 0%, transparent 70%)",
            filter: "blur(16px)",
          }}
          animate={{ opacity: [0.5, 1, 0.5], scale: [0.9, 1.12, 0.9] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.img
          src={logoImg}
          alt="SwitchControl"
          className="w-28 h-28 object-contain rounded-3xl relative z-10"
          draggable={false}
          animate={{
            filter: [
              "drop-shadow(0 0 18px rgba(139,92,246,0.5))",
              "drop-shadow(0 0 36px rgba(139,92,246,0.8))",
              "drop-shadow(0 0 18px rgba(139,92,246,0.5))",
            ],
          }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      {/* Text block */}
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
      >
        <h1 className="text-[2.6rem] font-bold leading-none mb-3 tracking-tight">
          <span className="text-white">Welcome</span>
          {userName && (
            <span
              style={{
                background:
                  "linear-gradient(90deg, rgb(192,132,252), rgb(236,72,153))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              ,&nbsp;{userName}
            </span>
          )}
          <span className="text-white">!</span>
        </h1>

        <motion.p
          className="text-[15px] text-zinc-400"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay: 0.85 }}
        >
          {isPremium ? (
            <span className="inline-flex items-center justify-center gap-2 text-amber-300/90">
              <Crown className="w-4 h-4 flex-shrink-0" />
              Premium Member
              <Crown className="w-4 h-4 flex-shrink-0" />
            </span>
          ) : (
            "Let's optimize your gaming experience"
          )}
        </motion.p>
      </motion.div>

      {/* Loading dots */}
      <motion.div
        className="flex gap-2 mt-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.5 }}
      >
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "rgba(168,85,247,0.7)" }}
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.3, 0.8] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.22,
              ease: "easeInOut",
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}
