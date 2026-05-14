import { useState, useCallback, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "@/lib/motionTokens";
import { DiscordIcon } from "@/components/ui/discord-icon";
import { Zap, Wifi, Cpu, Sparkles, Crown, Lock, Unlock } from "lucide-react";
import { TourShell, type TourStep } from "./TourShell";
import { useAuthStore, postTourSeen } from "@/lib/auth-store";
import { TourLineGraph } from "@/components/ui/tour-line-graph";
import { SOCIAL_LINKS } from "@/config/socialLinks";

// ── Shared: Glass panel wrapper ───────────────────────────────────────────────
function GlassPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.3)",
      }}
    >
      {children}
    </div>
  );
}

// ── Preview: Welcome to Premium ───────────────────────────────────────────────
const WELCOME_METRICS = [
  { label: "FPS",        before: 84,   after: 127,  color: "rgba(251,191,36,",   unit: "" },
  { label: "Input Lag",  before: 12,   after: 4,    color: "rgba(0,210,255,",    unit: "ms", lower: true },
  { label: "Ping",       before: 24,   after: 11,   color: "rgba(52,211,153,",   unit: "ms", lower: true },
];

function WelcomePremiumPreview() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase(p => (p + 1) % 2), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <GlassPanel>
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "rgba(251,191,36,0.55)" }}>
            Premium Upgrade
          </span>
          <motion.div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
            style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)" }}
            animate={{ opacity: [1, 0.65, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Crown className="w-2.5 h-2.5" style={{ color: "rgba(251,191,36,0.9)" }} />
            <span className="text-[8px] font-bold" style={{ color: "rgba(251,191,36,0.85)" }}>PREMIUM</span>
          </motion.div>
        </div>

        <div className="space-y-2">
          {WELCOME_METRICS.map((m, i) => {
            const val   = phase === 0 ? m.before : m.after;
            const isGood = m.lower ? val < m.before : val > m.before;
            const pct   = phase === 0
              ? (m.lower ? 60 : 40)
              : (m.lower ? 30 : 75);

            return (
              <div key={m.label}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] font-medium" style={{ color: `${m.color}0.5)` }}>{m.label}</span>
                  <motion.span
                    key={`${m.label}-${phase}`}
                    className="text-[10px] font-mono font-semibold tabular-nums"
                    style={{ color: `${m.color}0.9)` }}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    {val}{m.unit}
                    {phase === 1 && (
                      <span className="text-[8px] ml-1" style={{ color: "rgba(52,211,153,0.7)" }}>
                        {m.lower ? "↓" : "↑"}
                      </span>
                    )}
                  </motion.span>
                </div>
                <div className="h-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${m.color}0.85), ${m.color}0.55))`,
                      boxShadow: `0 0 8px ${m.color}0.4)`,
                    }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 pt-0.5">
          {[
            { label: "Before", color: "rgba(255,255,255,0.3)" },
            { label: "After",  color: "rgba(251,191,36,0.8)" },
          ].map(tag => (
            <motion.div
              key={tag.label}
              onClick={() => setPhase(tag.label === "Before" ? 0 : 1)}
              className="flex-1 py-1 rounded-lg text-center cursor-pointer"
              style={{
                background: `${tag.color.replace("0.3)", "0.07)").replace("0.8)", "0.07)")}`,
                border: `1px solid ${tag.color.replace("0.3)", "0.18)").replace("0.8)", "0.18)")}`,
              }}
              whileHover={{ opacity: 0.85 }}
              whileTap={{ scale: 0.97 }}
            >
              <span className="text-[9px] font-semibold" style={{ color: tag.color }}>{tag.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </GlassPanel>
  );
}

// ── Preview: Power Plan ───────────────────────────────────────────────────────
const POWER_PLANS = [
  { id: "ultra",   label: "Ultra Performance",   icon: "⚡", pct: 100, color: "rgba(251,191,36," },
  { id: "high",    label: "High Performance",     icon: "🔥", pct: 76,  color: "rgba(251,146,60," },
  { id: "balanced",label: "Balanced",             icon: "⚖", pct: 48,  color: "rgba(255,255,255," },
];

const POWER_FPS = [94, 102, 98, 107, 104, 112, 109, 118, 114, 122, 119, 126, 122, 128, 124];

function PowerPlanPreview() {
  const [selected, setSelected] = useState("ultra");

  return (
    <GlassPanel>
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "rgba(251,191,36,0.55)" }}>
            Power Plan Control
          </span>
          <motion.span
            className="text-[8px] font-semibold px-1.5 py-0.5 rounded-md"
            style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.22)", color: "rgba(251,191,36,0.85)" }}
            animate={{ opacity: [1, 0.6, 1] }}
            transition={{ duration: 2.2, repeat: Infinity }}
          >
            Premium only
          </motion.span>
        </div>

        <div className="space-y-1.5">
          {POWER_PLANS.map((plan, i) => (
            <motion.button
              key={plan.id}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left"
              style={{
                background: selected === plan.id ? `${plan.color}0.1)` : "rgba(255,255,255,0.03)",
                border: `1px solid ${selected === plan.id ? `${plan.color}0.25)` : "rgba(255,255,255,0.06)"}`,
              }}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => setSelected(plan.id)}
              whileTap={{ scale: 0.98 }}
            >
              <span className="text-base leading-none">{plan.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-medium" style={{ color: selected === plan.id ? `${plan.color}0.9)` : "rgba(255,255,255,0.5)" }}>
                  {plan.label}
                </div>
                <div className="mt-1 h-[2px] rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${plan.color}0.8), ${plan.color}0.4))`,
                      boxShadow: selected === plan.id ? `0 0 6px ${plan.color}0.4)` : "none",
                    }}
                    animate={{ width: selected === plan.id ? `${plan.pct}%` : `${plan.pct * 0.45}%` }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
              {selected === plan.id && (
                <motion.div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ background: `${plan.color}0.9)`, boxShadow: `0 0 8px ${plan.color}0.6)` }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18 }}
                />
              )}
            </motion.button>
          ))}
        </div>

        <div className="rounded-lg px-2 pt-2 pb-1" style={{ background: "rgba(0,0,0,0.18)" }}>
          <TourLineGraph
            points={POWER_FPS}
            color="rgba(251,191,36,"
            height={32}
            delay={0.4}
            label="FPS stability"
            labelValue="124 avg"
          />
        </div>
      </div>
    </GlassPanel>
  );
}

// ── Preview: Network Tweaks ───────────────────────────────────────────────────
const NET_LATENCY = [22, 19, 21, 18, 16, 14, 13, 15, 14, 12, 11, 14, 13, 12, 11];
const NET_TX      = [42, 55, 48, 61, 58, 65, 70, 63, 68, 72, 65, 70, 74, 68, 73];

const NET_TWEAKS = [
  { label: "TCP Auto-Tuning",      active: true },
  { label: "UDP Offload",          active: true },
  { label: "DNS Prefetch",         active: true },
  { label: "Nagle Algorithm",      active: false },
];

function NetworkTweaksPreview() {
  return (
    <GlassPanel>
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-4">
          <div>
            <motion.div
              className="text-[20px] font-bold font-mono tabular-nums leading-none"
              style={{ color: "rgba(0,210,255,0.9)" }}
              animate={{ opacity: [1, 0.7, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            >
              11ms
            </motion.div>
            <div className="text-[8px] uppercase tracking-widest" style={{ color: "rgba(0,210,255,0.35)" }}>Ping</div>
          </div>
          <div>
            <div className="text-[20px] font-bold font-mono leading-none" style={{ color: "rgba(52,211,153,0.9)" }}>0.0%</div>
            <div className="text-[8px] uppercase tracking-widest" style={{ color: "rgba(52,211,153,0.35)" }}>Loss</div>
          </div>
          <div className="ml-auto">
            <div className="space-y-1">
              {NET_TWEAKS.map((t, i) => (
                <motion.div
                  key={t.label}
                  className="flex items-center gap-1.5"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.06 + i * 0.07, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: t.active ? "rgba(0,210,255,0.8)" : "rgba(255,255,255,0.15)" }}
                  />
                  <span className="text-[9px]" style={{ color: t.active ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.2)" }}>
                    {t.label}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <TourLineGraph
          points={NET_LATENCY}
          color="rgba(0,210,255,"
          height={36}
          delay={0.1}
          label="Latency trace"
          labelValue="11ms"
        />

        <div className="rounded-lg px-2 pt-2 pb-1" style={{ background: "rgba(0,0,0,0.18)" }}>
          <TourLineGraph
            points={NET_TX}
            color="rgba(52,211,153,"
            height={28}
            delay={0.35}
            label="Throughput"
            labelValue="73 Mbps"
          />
        </div>
      </div>
    </GlassPanel>
  );
}

// ── Preview: BIOS Advisor ─────────────────────────────────────────────────────
const BIOS_SCORE_POINTS = [40, 44, 48, 52, 55, 58, 61, 64, 67, 70, 73, 76, 78, 80, 82];

const BIOS_ROWS = [
  { setting: "XMP / EXPO",  current: "Off",  rec: "Enable",  warn: true },
  { setting: "HPET",        current: "On",   rec: "Disable", warn: true },
  { setting: "C-States",    current: "Auto", rec: "Disable", warn: false },
  { setting: "ReBAR",       current: "Off",  rec: "Enable",  warn: true },
];

function BiosAdvisorPreview() {
  const circumference = 2 * Math.PI * 18;

  return (
    <GlassPanel>
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "rgba(251,191,36,0.55)" }}>
            BIOS Intelligence
          </span>
          <motion.span
            className="text-[8px] px-1.5 py-0.5 rounded-md font-semibold"
            style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", color: "rgba(251,191,36,0.8)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            4 recommendations
          </motion.span>
        </div>

        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="relative" style={{ width: 52, height: 52 }}>
              <svg viewBox="0 0 44 44" className="w-full h-full">
                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3.5" />
                <motion.circle
                  cx="22" cy="22" r="18"
                  fill="none"
                  stroke="url(#bios-premium-grad)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: circumference * 0.18 }}
                  transition={{ delay: 0.3, duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
                />
                <defs>
                  <linearGradient id="bios-premium-grad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(251,191,36,0.9)" />
                    <stop offset="100%" stopColor="rgba(0,210,255,0.9)" />
                  </linearGradient>
                </defs>
              </svg>
              <motion.div
                className="absolute inset-0 flex items-center justify-center text-xs font-bold"
                style={{ color: "#fbbf24" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                82
              </motion.div>
            </div>
            <span className="text-[8px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.25)" }}>Score</span>
          </div>

          <div className="flex-1 space-y-1.5">
            {BIOS_ROWS.map((r, i) => (
              <motion.div
                key={r.setting}
                className="flex items-center justify-between"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12 + i * 0.09, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <div>
                  <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.55)" }}>{r.setting}</div>
                  <div className="text-[8px]" style={{ color: "rgba(255,255,255,0.22)" }}>{r.current}</div>
                </div>
                <span
                  className="text-[8px] px-1.5 py-0.5 rounded-md font-semibold flex-shrink-0 ml-2"
                  style={{
                    background: r.warn ? "rgba(251,191,36,0.1)" : "rgba(0,210,255,0.08)",
                    border: `1px solid ${r.warn ? "rgba(251,191,36,0.18)" : "rgba(0,210,255,0.13)"}`,
                    color: r.warn ? "#fbbf24" : "#22d3ee",
                  }}
                >
                  → {r.rec}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="rounded-lg px-2 pt-2 pb-1" style={{ background: "rgba(0,0,0,0.18)" }}>
          <TourLineGraph
            points={BIOS_SCORE_POINTS}
            color="rgba(251,191,36,"
            height={28}
            delay={0.5}
            label="Score trajectory"
            labelValue="+42pts"
          />
        </div>
      </div>
    </GlassPanel>
  );
}

// ── Preview: AI Advisor / Full System Visibility ──────────────────────────────
const AI_CONFIDENCE = [65, 68, 72, 69, 74, 78, 76, 80, 77, 82, 80, 84, 82, 85, 87];

const AI_MESSAGES = [
  { from: "user", text: "Why is my FPS dropping mid-game?" },
  { from: "ai",   text: "CPU thermal throttling detected at 94°C. Recommend disabling C-States + undervolting by 80mV." },
];

function AiFullSystemPreview() {
  return (
    <GlassPanel>
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "rgba(168,85,247,0.55)" }}>
            AI System Advisor
          </span>
          <motion.span
            className="text-[8px] px-1.5 py-0.5 rounded-md"
            style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.22)", color: "rgba(168,85,247,0.8)" }}
            animate={{ opacity: [1, 0.6, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Analyzing…
          </motion.span>
        </div>

        <div className="space-y-2">
          {AI_MESSAGES.map((m, i) => (
            <motion.div
              key={i}
              className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.3, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div
                className="text-[10px] leading-snug rounded-xl px-3 py-1.5 max-w-[92%]"
                style={{
                  background: m.from === "user"
                    ? "linear-gradient(135deg, rgba(168,85,247,0.4), rgba(139,92,246,0.25))"
                    : "rgba(255,255,255,0.05)",
                  color: m.from === "user" ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)",
                  border: m.from === "ai" ? "1px solid rgba(255,255,255,0.07)" : "none",
                  boxShadow: m.from === "user" ? "0 2px 12px rgba(168,85,247,0.2)" : "none",
                }}
              >
                {m.text}
              </div>
            </motion.div>
          ))}

          <motion.div
            className="flex justify-start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
          >
            <div
              className="flex items-center gap-1 px-3 py-2 rounded-xl"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  className="w-1 h-1 rounded-full"
                  style={{ background: "rgba(168,85,247,0.7)" }}
                  animate={{ scale: [1, 1.7, 1], opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 0.9, delay: i * 0.18, repeat: Infinity, ease: "easeInOut" }}
                />
              ))}
            </div>
          </motion.div>
        </div>

        <div className="rounded-lg px-2 pt-2 pb-1" style={{ background: "rgba(0,0,0,0.18)" }}>
          <TourLineGraph
            points={AI_CONFIDENCE}
            color="rgba(168,85,247,"
            height={28}
            delay={0.6}
            label="Analysis confidence"
            labelValue="87%"
          />
        </div>
      </div>
    </GlassPanel>
  );
}

// ── Staged unlock animation ───────────────────────────────────────────────────
function StagedUnlockAnimation() {
  return (
    <div className="flex justify-center py-2">
      <motion.div className="relative flex items-center justify-center w-16 h-16">
        <motion.div
          className="absolute inset-0 rounded-full"
          initial={{ boxShadow: "0 0 0 0 rgba(251,191,36,0)" }}
          animate={{
            boxShadow: [
              "0 0 0 0 rgba(251,191,36,0)",
              "0 0 20px 8px rgba(251,191,36,0.3)",
              "0 0 40px 16px rgba(251,191,36,0.5)",
              "0 0 60px 24px rgba(251,191,36,0)",
            ],
          }}
          transition={{ duration: 1.4, ease: "easeOut" }}
        />

        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            animate={{
              rotate: [0, -6, 6, -4, 4, 0],
              scale: [1, 1.05, 1.05, 1.05, 1.05, 1.1],
            }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          >
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ delay: 0.6, duration: 0.15 }}
            >
              <Lock className="w-8 h-8 text-amber-400" />
            </motion.div>
          </motion.div>
        </motion.div>

        <motion.div
          className="absolute"
          initial={{ opacity: 0, scale: 0.6, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            delay: 0.7,
            type: "spring",
            stiffness: 500,
            damping: 15,
          }}
        >
          <Unlock className="w-8 h-8 text-amber-300" />
        </motion.div>

        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full"
            style={{ background: "rgba(251,191,36,0.8)" }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1.5, 0],
              x: Math.cos((i * Math.PI * 2) / 6) * 28,
              y: Math.sin((i * Math.PI * 2) / 6) * 28,
            }}
            transition={{
              delay: 0.75 + i * 0.03,
              duration: 0.5,
              ease: "easeOut",
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}

// ── Premium Tour steps ────────────────────────────────────────────────────────
const PREMIUM_TOUR_STEPS: TourStep[] = [
  {
    id: "welcome-premium",
    title: "Welcome to Premium",
    description:
      "You now have access to the full SwitchControl suite. Let us show you everything that just unlocked.",
    icon: <Crown className="w-5 h-5 text-amber-400" />,
    targetSelector: '[data-tour="dashboard-hero"]',
    route: "/dashboard",
    sidebarHighlight: "dashboard",
    preview: <WelcomePremiumPreview />,
  },
  {
    id: "power-plan",
    title: "Power Plan Control",
    description:
      "Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.",
    icon: <Zap className="w-5 h-5 text-amber-400" />,
    targetSelector: '[data-tour="power-plan"]',
    route: "/dashboard",
    sidebarHighlight: "tweaks",
    preview: <PowerPlanPreview />,
  },
  {
    id: "network-tweaks",
    title: "Network Tweaks",
    description:
      "Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.",
    icon: <Wifi className="w-5 h-5 text-cyan-400" />,
    targetSelector: '[data-tour="network-content"]',
    route: "/network",
    sidebarHighlight: "network",
    preview: <NetworkTweaksPreview />,
  },
  {
    id: "bios-advisor",
    title: "BIOS Intelligence",
    description:
      "Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.",
    icon: <Cpu className="w-5 h-5 text-amber-400" />,
    targetSelector: '[data-tour="bios-content"]',
    route: "/bios-advisor",
    sidebarHighlight: "bios-advisor",
    preview: <BiosAdvisorPreview />,
  },
  {
    id: "ai-advisor",
    title: "Full System Visibility",
    description:
      "Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.",
    icon: <Sparkles className="w-5 h-5 text-text-[#00D4FF]" />,
    targetSelector: '[data-tour="ai-advisor"]',
    route: "/dashboard",
    sidebarHighlight: "dashboard",
    preview: <AiFullSystemPreview />,
  },
  {
    id: "premium-unlocked",
    title: "Premium Activated",
    description:
      "Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.",
    icon: <Crown className="w-5 h-5 text-amber-400" />,
    targetSelector: '[data-tour="dashboard-hero"]',
    route: "/dashboard",
    action: <StagedUnlockAnimation />,
  },
  {
    id: "discord",
    title: "Join the Community",
    description:
      "Join the Discord for updates, announcements, and premium giveaways.",
    icon: <DiscordIcon className="w-5 h-5 text-[#5865F2]" />,
    targetSelector: '[data-tour="dashboard-hero"]',
    route: "/dashboard",
    action: (
      <button
        onClick={() => {
          const url = SOCIAL_LINKS.discord;
          const api = (window as any).electronAPI;
          if (api?.openExternal) {
            api.openExternal(url);
          } else {
            window.open(url, "_blank", "noopener,noreferrer");
          }
        }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-[#E6EAF0] font-medium text-sm transition-colors w-full justify-center"
        data-testid="premium-tour-join-discord"
      >
        <DiscordIcon className="w-4 h-4" />
        Join Discord
      </button>
    ),
  },
];

// ── GuidedTour component ──────────────────────────────────────────────────────
interface GuidedTourProps {
  show: boolean;
  onComplete: () => void;
}

export function GuidedTour({ show, onComplete }: GuidedTourProps) {
  return (
    <TourShell
      show={show}
      steps={PREMIUM_TOUR_STEPS}
      onComplete={onComplete}
      returnRoute="/dashboard"
      testId="premium-guided-tour"
      isPremium={true}
    />
  );
}

export function usePremiumTourState() {
  const [showTour, setShowTour] = useState(false);

  const triggerTour = useCallback(() => {
    const user = useAuthStore.getState().user;
    if (user?.isPremium === true && user?.hasSeenPremiumTour === false) {
      console.log(
        "[PremiumTour] Triggering premium guided tour (server-driven)",
      );
      setShowTour(true);
    } else {
      console.log(
        `[PremiumTour] Tour skipped — isPremium=${user?.isPremium} hasSeenPremiumTour=${user?.hasSeenPremiumTour}`,
      );
    }
  }, []);

  const completeTour = useCallback(async () => {
    console.log("[PremiumTour] Tour completed — posting tour-seen to server");
    await postTourSeen();
    setShowTour(false);
  }, []);

  return { showTour, triggerTour, completeTour };
}
