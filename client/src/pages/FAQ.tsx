import { useState, useRef, useEffect, type ElementType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { WebsiteShell } from "@/components/website/WebsiteShell";
import {
  ChevronDown,
  Shield,
  Zap,
  Brain,
  CreditCard,
  MonitorDown,
  MessageCircle,
  CheckCircle2,
  HelpCircle,
  Cpu,
  Wifi,
  RotateCcw,
  ArrowRight,
  Star,
} from "lucide-react";
import { SOCIAL_LINKS } from "@/config/socialLinks";

// ── Easings ──────────────────────────────────────────────────────────────────
const EASE_OUT  = [0.22, 1, 0.36, 1] as const;
const EASE_IO   = [0.65, 0, 0.35, 1] as const;

// ── Data ─────────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "general",     label: "General",              icon: HelpCircle,    color: "rgba(168,85,247," },
  { id: "safety",      label: "Safety & Anti-Cheat",  icon: Shield,        color: "rgba(52,211,153," },
  { id: "performance", label: "Performance",           icon: Zap,           color: "rgba(251,191,36," },
  { id: "usage",       label: "Installation & Usage",  icon: MonitorDown,   color: "rgba(6,182,212,"  },
  { id: "billing",     label: "Billing & Refunds",     icon: CreditCard,    color: "rgba(249,115,22," },
] as const;

type CategoryId = typeof CATEGORIES[number]["id"];

interface FAQItem {
  question: string;
  answer:   string;
  category: CategoryId;
  badge?:   string;
}

const FAQ_ITEMS: FAQItem[] = [
  // ── General ─────────────────────────────────────────────────────────────────
  {
    category: "general",
    question: "What makes SwitchControl different from other optimizers?",
    answer: "Unlike one-click bloatware that blindly applies hundreds of changes, SwitchControl is precise. Every tweak is individually described, risk-rated, and reversible. You choose what runs on your system. Nothing is hidden, nothing is automatic without your approval — and the AI Advisor gives you hardware-aware guidance instead of generic advice that works for no one in particular.",
  },
  {
    category: "general",
    question: "Is this just another script wrapped in a UI?",
    answer: "No. SwitchControl is a full desktop application with a live system monitor, AI reasoning engine, BIOS scoring system, real-time network diagnostics, and a persistent history log. It executes changes through validated, signed system calls — not random PowerShell scripts you found on Reddit.",
    badge: "Important",
  },
  {
    category: "general",
    question: "Do I need to keep SwitchControl running while gaming?",
    answer: "No. Most optimizations are applied to Windows settings and persist across reboots. SwitchControl does its job, then stays out of your way. The only reason to keep it open is if you want the live Activity Monitor running or want to make additional changes mid-session.",
  },
  {
    category: "general",
    question: "How does the AI Advisor actually work?",
    answer: "The AI Advisor knows your specific hardware — your CPU, GPU, RAM, and current usage patterns. It uses this data to give you contextual advice instead of generic tweaks. Ask it why you're dropping frames, how to reduce input lag, or what BIOS changes matter for your chipset. It pulls context from your live telemetry and responds in plain language.",
  },
  {
    category: "general",
    question: "What does BIOS Advisor do?",
    answer: "BIOS Advisor scans the hardware capabilities SwitchControl can detect and cross-references them with known BIOS settings that affect performance — XMP/EXPO, C-States, Resizable BAR, HPET, core isolation, and more. It gives you a score and prioritized recommendations. You still make the changes yourself in your BIOS — it just tells you exactly what to look for and why.",
  },

  // ── Safety & Anti-Cheat ───────────────────────────────────────────────────
  {
    category: "safety",
    question: "Is it safe? Will it break my games or system?",
    answer: "Yes — safety is the first design constraint, not an afterthought. Every tweak is tagged with a risk level: Safe, Moderate, or Experimental. Safe tweaks are applied without concern. Experimental ones show explicit warnings and are opt-in only. Nothing touches boot sectors, kernel drivers, or security mechanisms. Every change is logged and one-click reversible from the History page.",
    badge: "Core principle",
  },
  {
    category: "safety",
    question: "Does it work with Fortnite, Valorant, CS2, and other anti-cheat games?",
    answer: "Yes. SwitchControl modifies Windows system settings and registry values only — the same class of changes you'd make manually through Control Panel or regedit. It does not inject into game processes, hook system calls at the kernel level, or touch game files. It is fully compatible with Easy Anti-Cheat, Vanguard, FACEIT AC, and BattlEye.",
    badge: "Anti-cheat safe",
  },
  {
    category: "safety",
    question: "Can I undo every change SwitchControl makes?",
    answer: "Yes. The History page records every action taken. Each entry shows what was changed, when, and what the original value was. You can revert individual tweaks or roll back an entire session. For system-wide safety, you can also use the one-click 'Revert All' option that restores every setting to what it was before your first SwitchControl session.",
  },

  // ── Performance ──────────────────────────────────────────────────────────
  {
    category: "performance",
    question: "What kind of performance improvements can I expect?",
    answer: "Results depend on your hardware and starting configuration, so we won't give you fake numbers. In general: users with stock Windows settings see the most gains. Common wins include lower input latency (2–8ms on many systems), reduced frame time variance (smoother frame pacing), lower background CPU usage during gaming, and reduced ping jitter on wireless connections. Systems that are already heavily tuned will see smaller improvements.",
  },
  {
    category: "performance",
    question: "Does tweaking power plans actually help, or is it placebo?",
    answer: "It depends on the game and your hardware. On AMD Ryzen systems, the Windows power plan has measurable effect on boost clock behavior and latency. On Intel systems running at or near base clocks, the effect is smaller. The Power Plan page lets you switch between profiles and explains exactly what changes each one makes, so you can test it yourself rather than take anyone's word for it.",
  },
  {
    category: "performance",
    question: "Will network tweaks reduce my ping?",
    answer: "Not your base ping — that is determined by your ISP and server distance. What network tweaks can reduce is jitter and packet loss, which cause the inconsistent spikes you feel as rubber-banding or stuttering in online games. Tweaks like TCP auto-tuning, QoS settings, and Nagle algorithm adjustments address these. Results are most visible on Wi-Fi and on connections with variable latency.",
  },

  // ── Installation & Usage ─────────────────────────────────────────────────
  {
    category: "usage",
    question: "Do I need to be technical to use SwitchControl?",
    answer: "No. Every setting has a plain-English description, a risk label, and a clear explanation of what it does. Recommended tweaks are curated for all experience levels. The AI Advisor can guide you in natural language. You can go deep if you want — or just apply the Recommended set and be done in two minutes.",
  },
  {
    category: "usage",
    question: "What Windows versions are supported?",
    answer: "Windows 10 (version 1903 and later) and Windows 11. Both 64-bit only. SwitchControl will not run on 32-bit systems or Windows versions older than 1903. ARM-based Windows devices are not currently supported.",
    badge: "Compatibility",
  },
  {
    category: "usage",
    question: "What if a tweak does nothing or makes things worse on my system?",
    answer: "Revert it. That is genuinely the entire answer. SwitchControl is built around reversibility. If something does not help your specific hardware and driver combination, undo it from History and move on. No harm done.",
  },
  {
    category: "usage",
    question: "Does SwitchControl run at startup? Does it add background processes?",
    answer: "Only if you explicitly enable startup launch in Settings. By default it does not add itself to startup, does not run background services, and does not send telemetry. The Activity Monitor updates only when the app is open. There is no hidden agent or daemon.",
  },

  // ── Billing ──────────────────────────────────────────────────────────────
  {
    category: "billing",
    question: "What is your refund policy?",
    answer: "All sales are final unless required by applicable consumer protection law in your jurisdiction. The free trial is available so you can evaluate the product before committing. We strongly recommend using it.",
  },
  {
    category: "billing",
    question: "What is included in the free plan vs Premium?",
    answer: "The free plan includes core tweaks, the Activity Monitor, system cleaner, startup manager, and debloater. Premium unlocks the AI Advisor, BIOS Advisor, Network Tweaks, Power Plans, and App Booster — the performance-critical features where the real gains happen. You can try all Premium features free with a trial before paying anything.",
    badge: "Trial available",
  },
];

// ── Trust badges ─────────────────────────────────────────────────────────────
const TRUST_ITEMS = [
  { icon: Shield,        label: "Anti-cheat safe",    sub: "EAC · Vanguard · FACEIT",   color: "rgba(52,211,153,0.85)" },
  { icon: RotateCcw,     label: "100% reversible",    sub: "One-click undo on everything", color: "rgba(6,182,212,0.85)"  },
  { icon: Cpu,           label: "No background agent", sub: "Nothing runs without you",   color: "rgba(168,85,247,0.85)" },
  { icon: Star,          label: "Free trial",          sub: "No card required",            color: "rgba(251,191,36,0.85)" },
];

// ── Animated background SVG ────────────────────────────────────────────────
function HeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Deep base */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 90% 75% at 50% 0%, rgba(88,28,220,0.14) 0%, transparent 65%)" }}
      />
      {/* Animated orb — left */}
      <motion.div
        className="absolute"
        style={{
          top: "5%", left: "-8%",
          width: 700, height: 700,
          background: "radial-gradient(circle, rgba(109,40,217,0.11) 0%, transparent 68%)",
          filter: "blur(60px)",
        }}
        animate={{ x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Animated orb — right */}
      <motion.div
        className="absolute"
        style={{
          top: "-5%", right: "-6%",
          width: 600, height: 600,
          background: "radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 65%)",
          filter: "blur(70px)",
        }}
        animate={{ x: [0, -25, 0], y: [0, 25, 0], scale: [1, 1.06, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />
      {/* SVG grid */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.025]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="faq-grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(168,85,247,1)" strokeWidth="0.7" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#faq-grid)" />
      </svg>
      {/* Scan line */}
      <motion.div
        className="absolute left-0 right-0 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.35) 30%, rgba(6,182,212,0.35) 70%, transparent 100%)" }}
        initial={{ top: "0%", opacity: 0 }}
        animate={{ top: ["0%", "100%"], opacity: [0, 0.7, 0.7, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "linear", times: [0, 0.05, 0.95, 1] }}
      />
    </div>
  );
}

// ── Accordion item ────────────────────────────────────────────────────────────
function AccordionItem({ item, index }: { item: FAQItem; index: number }) {
  const [open, setOpen] = useState(false);
  const cat = CATEGORIES.find(c => c.id === item.category)!;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, delay: index * 0.04, ease: EASE_OUT }}
    >
      <motion.button
        className="w-full text-left group"
        onClick={() => setOpen(o => !o)}
        data-testid={`faq-${item.question.slice(0, 20).toLowerCase().replace(/\s/g, "-")}`}
      >
        <div
          className="relative rounded-xl overflow-hidden transition-all duration-300"
          style={{
            background: open
              ? "linear-gradient(145deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.025) 100%)"
              : "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)",
            border: open
              ? `1px solid ${cat.color}0.28)`
              : "1px solid rgba(255,255,255,0.07)",
            boxShadow: open
              ? `0 0 0 1px ${cat.color}0.12), 0 8px 40px rgba(0,0,0,0.28)`
              : "0 2px 12px rgba(0,0,0,0.12)",
          }}
        >
          {/* Top accent bar (visible when open) */}
          {open && (
            <div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{ background: `linear-gradient(90deg, transparent, ${cat.color}0.7), ${cat.color}0.4), transparent)` }}
            />
          )}

          <div className="flex items-start gap-4 px-6 py-5">
            {/* Icon */}
            <div
              className="shrink-0 size-9 rounded-lg flex items-center justify-center mt-0.5"
              style={{
                background: `${cat.color}0.1)`,
                border: `1px solid ${cat.color}0.22)`,
              }}
            >
              <cat.icon className="size-4" style={{ color: cat.color + "0.9)" }} />
            </div>

            {/* Question + badge */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span
                  className="text-[15px] font-semibold leading-snug"
                  style={{ color: open ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.78)" }}
                >
                  {item.question}
                </span>
                {item.badge && (
                  <span
                    className="text-[9px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-md shrink-0"
                    style={{
                      background: `${cat.color}0.1)`,
                      border: `1px solid ${cat.color}0.2)`,
                      color: cat.color + "0.9)",
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
            </div>

            {/* Chevron */}
            <motion.div
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.3, ease: EASE_IO }}
              className="shrink-0 mt-1"
            >
              <ChevronDown className="size-4 text-white/30" />
            </motion.div>
          </div>

          {/* Answer */}
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.38, ease: EASE_IO }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-5 pl-[4.25rem]">
                  <div
                    className="h-px mb-4"
                    style={{ background: `linear-gradient(90deg, ${cat.color}0.2), transparent)` }}
                  />
                  <p className="text-[14px] leading-relaxed text-white/55">
                    {item.answer}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.button>
    </motion.div>
  );
}

// ── Category pill ─────────────────────────────────────────────────────────────
interface CatLike {
  id: string;
  label: string;
  icon: ElementType;
  color: string;
}

function CategoryPill({
  cat,
  active,
  count,
  onClick,
}: {
  cat: CatLike;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
      style={{
        background: active ? `${cat.color}0.1)` : "transparent",
        border: active ? `1px solid ${cat.color}0.25)` : "1px solid transparent",
      }}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      data-testid={`faq-category-${cat.id}`}
    >
      <div
        className="size-7 rounded-lg flex items-center justify-center shrink-0"
        style={{
          background: active ? `${cat.color}0.15)` : "rgba(255,255,255,0.04)",
          border: `1px solid ${active ? cat.color + "0.25)" : "rgba(255,255,255,0.07)"}`,
        }}
      >
        <cat.icon className="size-3.5" style={{ color: active ? cat.color + "0.95)" : "rgba(255,255,255,0.4)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-[12.5px] font-semibold leading-none"
          style={{ color: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)" }}
        >
          {cat.label}
        </div>
      </div>
      <div
        className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md"
        style={{
          background: active ? `${cat.color}0.12)` : "rgba(255,255,255,0.04)",
          color: active ? cat.color + "0.85)" : "rgba(255,255,255,0.22)",
        }}
      >
        {count}
      </div>
    </motion.button>
  );
}

// ── Info card ─────────────────────────────────────────────────────────────────
function InfoCard({
  icon: Icon,
  title,
  body,
  accentColor,
  delay = 0,
}: {
  icon: ElementType;
  title: string;
  body: string;
  accentColor: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.55, delay, ease: EASE_OUT }}
      className="relative rounded-xl p-5 overflow-hidden"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
        border: `1px solid ${accentColor}0.2)`,
        boxShadow: `0 0 32px ${accentColor}0.06)`,
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}0.55), transparent)` }}
      />
      <div className="flex items-start gap-3">
        <div
          className="size-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${accentColor}0.12)`, border: `1px solid ${accentColor}0.22)` }}
        >
          <Icon className="size-4" style={{ color: accentColor + "0.9)" }} />
        </div>
        <div>
          <div className="text-[12px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: accentColor + "0.75)" }}>
            {title}
          </div>
          <p className="text-[12.5px] text-white/45 leading-relaxed">{body}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState<CategoryId | "all">("all");

  const filteredItems =
    activeCategory === "all"
      ? FAQ_ITEMS
      : FAQ_ITEMS.filter(q => q.category === activeCategory);

  const countFor = (id: CategoryId) => FAQ_ITEMS.filter(q => q.category === id).length;

  return (
    <WebsiteShell variant="full" showFooter={true}>
      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden">
        <HeroBackground />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE_OUT }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-6"
            style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(6,182,212,0.08))",
              border: "1px solid rgba(139,92,246,0.22)",
            }}
          >
            <HelpCircle className="size-3.5 text-violet-400" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-300">
              Frequently Asked Questions
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.08, ease: EASE_OUT }}
            className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.08] mb-5"
          >
            <span className="text-white">Real answers,</span>
            <br />
            <span
              style={{
                background: "linear-gradient(90deg, #c084fc 0%, #818cf8 45%, #22d3ee 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              not corporate copy.
            </span>
          </motion.h1>

          {/* Sub */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18, ease: EASE_OUT }}
            className="text-[16px] text-white/45 max-w-xl mx-auto leading-relaxed mb-10"
          >
            We answer the questions that actually matter — safety, compatibility,
            what to expect, and what makes SwitchControl worth using.
          </motion.p>

          {/* Trust pills */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.28, ease: EASE_OUT }}
            className="flex flex-wrap justify-center gap-2.5"
          >
            {TRUST_ITEMS.map((t, i) => (
              <div
                key={t.label}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <t.icon className="size-3" style={{ color: t.color }} />
                <span className="text-[11.5px] font-medium text-white/55">{t.label}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Animated divider */}
        <motion.div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px w-3/4 max-w-2xl"
          style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.25), rgba(6,182,212,0.15), transparent)" }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 1.0, delay: 0.5, ease: EASE_OUT }}
        />
      </section>

      {/* ── QUICK STATS ─────────────────────────────────────────────────────── */}
      <section className="py-10 relative">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {TRUST_ITEMS.map((t, i) => (
              <motion.div
                key={t.label}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.06, ease: EASE_OUT }}
                className="relative rounded-xl p-4 text-center overflow-hidden group"
                style={{
                  background: "linear-gradient(145deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.015) 100%)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${t.color}0.07) 0%, transparent 70%)` }}
                />
                <div
                  className="inline-flex size-9 rounded-xl items-center justify-center mb-2.5"
                  style={{ background: `${t.color}0.1)`, border: `1px solid ${t.color}0.2)` }}
                >
                  <t.icon className="size-4" style={{ color: t.color }} />
                </div>
                <div className="text-[13px] font-bold text-white/85 leading-tight mb-0.5">{t.label}</div>
                <div className="text-[11px] text-white/35">{t.sub}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MAIN FAQ BODY ────────────────────────────────────────────────────── */}
      <section className="py-12 md:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start">

            {/* ── Left: category nav ────────────────────────────────────────── */}
            <div className="lg:w-56 shrink-0">
              <div
                className="sticky top-24 rounded-2xl p-3 space-y-1"
                style={{
                  background: "linear-gradient(145deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.016) 100%)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div className="px-3 pb-2 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">Categories</span>
                </div>
                <CategoryPill
                  cat={{ id: "all" as any, label: "All Questions", icon: HelpCircle, color: "rgba(168,85,247," }}
                  active={activeCategory === "all"}
                  count={FAQ_ITEMS.length}
                  onClick={() => setActiveCategory("all")}
                />
                {CATEGORIES.map(cat => (
                  <CategoryPill
                    key={cat.id}
                    cat={cat}
                    active={activeCategory === cat.id}
                    count={countFor(cat.id)}
                    onClick={() => setActiveCategory(cat.id)}
                  />
                ))}
              </div>
            </div>

            {/* ── Right: questions + info cards ─────────────────────────────── */}
            <div className="flex-1 min-w-0">

              {/* Active category label */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeCategory}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.25, ease: EASE_IO }}
                  className="mb-6"
                >
                  {activeCategory === "all" ? (
                    <h2 className="text-xl font-bold text-white/80">
                      All Questions
                      <span className="ml-2 text-sm font-normal text-white/25">({FAQ_ITEMS.length})</span>
                    </h2>
                  ) : (() => {
                    const cat = CATEGORIES.find(c => c.id === activeCategory)!;
                    return (
                      <div className="flex items-center gap-3">
                        <div
                          className="size-8 rounded-lg flex items-center justify-center"
                          style={{ background: `${cat.color}0.12)`, border: `1px solid ${cat.color}0.22)` }}
                        >
                          <cat.icon className="size-4" style={{ color: cat.color + "0.9)" }} />
                        </div>
                        <h2 className="text-xl font-bold text-white/80">
                          {cat.label}
                          <span className="ml-2 text-sm font-normal text-white/25">({countFor(activeCategory)})</span>
                        </h2>
                      </div>
                    );
                  })()}
                </motion.div>
              </AnimatePresence>

              {/* Accordion items */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeCategory}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2.5"
                >
                  {filteredItems.map((item, i) => (
                    <AccordionItem key={item.question} item={item} index={i} />
                  ))}
                </motion.div>
              </AnimatePresence>

              {/* ── Info callout block ─────────────────────────────────── */}
              {(activeCategory === "all" || activeCategory === "safety") && (
                <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <InfoCard
                    icon={Shield}
                    title="Anti-cheat safe"
                    body="EAC, Vanguard, FACEIT, and BattlEye all approved. SwitchControl modifies Windows settings only — no process injection, no kernel hooks, no game file modifications."
                    accentColor="rgba(52,211,153,"
                    delay={0}
                  />
                  <InfoCard
                    icon={RotateCcw}
                    title="Full revert guarantee"
                    body="Every change is logged. Revert individual tweaks or your entire session with one click from the History page. Nothing is permanent unless you want it to be."
                    accentColor="rgba(6,182,212,"
                    delay={0.07}
                  />
                </div>
              )}

              {(activeCategory === "all" || activeCategory === "general") && (
                <div className="mt-6 grid grid-cols-1 gap-3">
                  <InfoCard
                    icon={Brain}
                    title="AI Advisor — hardware aware"
                    body="The AI Advisor knows your CPU, GPU, and RAM configuration. It gives you system-specific advice — not the same generic recommendations every tweak tool gives to every user."
                    accentColor="rgba(168,85,247,"
                    delay={0.05}
                  />
                </div>
              )}

              {(activeCategory === "all" || activeCategory === "performance") && (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <InfoCard
                    icon={Zap}
                    title="Power plan impact"
                    body="Most impactful on AMD Ryzen. Correct power plan affects boost clock behavior, memory latency, and scheduler decisions — real, measurable gains on supported hardware."
                    accentColor="rgba(251,191,36,"
                    delay={0}
                  />
                  <InfoCard
                    icon={Wifi}
                    title="Network tweaks scope"
                    body="Target: jitter and packet loss — not raw ping. Reduces the spikes you feel as rubber-banding in online games. Most effective on Wi-Fi and variable-latency connections."
                    accentColor="rgba(59,130,246,"
                    delay={0.07}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── STILL HAVE QUESTIONS ─────────────────────────────────────────────── */}
      <section className="py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.65, ease: EASE_OUT }}
            className="relative rounded-2xl p-10 md:p-14 overflow-hidden"
            style={{
              background: "linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* Corner glows */}
            <div
              className="absolute -top-10 -left-10 w-48 h-48 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)", filter: "blur(28px)" }}
            />
            <div
              className="absolute -bottom-10 -right-10 w-48 h-48 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)", filter: "blur(28px)" }}
            />

            <div
              className="inline-flex size-12 rounded-xl items-center justify-center mb-5"
              style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.22)" }}
            >
              <MessageCircle className="size-5 text-violet-400" />
            </div>

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
              Still have a question?
            </h2>
            <p className="text-white/40 mb-8 leading-relaxed text-[15px] max-w-md mx-auto">
              Join the Discord — we answer questions fast, and the community has been through most setup scenarios already.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={SOCIAL_LINKS.discord}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, rgba(109,40,217,0.85), rgba(168,85,247,0.65))",
                  border: "1px solid rgba(168,85,247,0.4)",
                  color: "rgba(255,255,255,0.9)",
                  boxShadow: "0 4px 22px rgba(139,92,246,0.3)",
                }}
                data-testid="link-faq-discord"
              >
                Join Discord
                <ArrowRight className="size-4" />
              </a>
              <a
                href="mailto:switchcontrol67@gmail.com"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.5)",
                }}
                data-testid="link-faq-email"
              >
                Email us
              </a>
            </div>

            {/* Small reassurances */}
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              {[
                { icon: CheckCircle2, text: "Responses within 24h" },
                { icon: CheckCircle2, text: "Real human support" },
                { icon: CheckCircle2, text: "Community of 100+ users" },
              ].map(r => (
                <div key={r.text} className="flex items-center gap-1.5 text-[12px] text-white/30">
                  <r.icon className="size-3.5 text-emerald-500/60" />
                  {r.text}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>
    </WebsiteShell>
  );
}
