import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Settings,
  Zap,
  Shield,
  Trash2,

  List,
  Wifi,
  Cpu,
  Crown,
  LogOut,
  Loader2,
  Activity,
  Brain,
  Clock,
  Network,
  Layers,
  ScanSearch,
  Timer,
} from "lucide-react";
import { SOCIAL_LINKS } from "@/config/socialLinks";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useTourStore } from "@/lib/tour-store";
import { useEntitlementUiState } from "@/hooks/useEntitlementUiState";

// Module-level cache for the app version. `Sidebar` is remounted on every
// route change (each page wraps itself in <AppLayout>), so without this the
// version text briefly resets to its "SwitchControl" fallback on every
// navigation while the async `getVersion()` IPC call resolves. During fast
// back-to-back navigations, the old page's Sidebar (still fading out) and the
// new page's Sidebar (freshly mounted, showing the fallback) can be visually
// stacked for a frame, producing a glimpse of "SwitchControl" overlapping the
// version/social row. Caching the resolved version here means every mount
// after the first renders the real version immediately, eliminating the flash.
let cachedAppVersion: string | null = null;

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  isPremium?: boolean;
  comingSoon?: boolean;
  tourId?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", tourId: "dashboard" },
  { label: "Tweaks", icon: Settings, href: "/tweaks", tourId: "tweaks" },
  { label: "Power Plan", icon: Zap, href: "/power-plan", isPremium: true, tourId: "power-plan" },

  { label: "NIC Tuning", icon: Network, href: "/nic-tuning" },
  { label: "Network Tweaks", icon: Wifi, href: "/network", isPremium: true, tourId: "network" },
  { label: "Cleaner", icon: Trash2, href: "/cleaner" },
  { label: "Debloat", icon: Shield, href: "/debloat" },
  { label: "Startup", icon: List, href: "/startup" },
  { label: "Process Manager", icon: Layers, href: "/process-manager" },
  { label: "AI Advisor", icon: Brain, href: "/ai-advisor", isPremium: true, tourId: "ai-advisor" },
  { label: "BIOS Advisor", icon: Cpu, href: "/bios-advisor", isPremium: true, tourId: "bios-advisor" },
  { label: "Extreme Labs", icon: Zap, href: "/extreme-labs", isPremium: true, tourId: "extreme-labs" },
  { label: "Security", icon: Shield, href: "/security", tourId: "security" },
  { label: "History", icon: Activity, href: "/history" },
  { label: "Driver Intel", icon: ScanSearch, href: "/driver-intel", isPremium: true, tourId: "driver-intel" },
  { label: "Latency Analyzer", icon: Timer, href: "/latency-analyzer", isPremium: true },
  { label: "Settings", icon: Settings, href: "/settings", tourId: "settings" },
];

const SPRING_TIGHT = { type: "spring", stiffness: 420, damping: 32 } as const;
const SPRING_SNAPPY = { type: "spring", stiffness: 340, damping: 26 } as const;
const EASE_PREMIUM = [0.22, 1, 0.36, 1] as const;

function SidebarAmbientGlow() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {/* Top ambient orb — muted blue */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 260,
          height: 260,
          background: "radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)",
          top: -40,
          left: -60,
        }}
        animate={{
          x: [0, 18, -8, 0],
          y: [0, 12, -6, 0],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Mid ambient orb — faint */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 200,
          height: 200,
          background: "radial-gradient(circle, rgba(42,49,58,0.08) 0%, transparent 70%)",
          top: "38%",
          left: -40,
        }}
        animate={{
          x: [0, -12, 10, 0],
          y: [0, 20, -10, 0],
          opacity: [0.6, 1, 0.7, 0.6],
        }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut", delay: 4 }}
      />
    </div>
  );
}

function NavItemRow({
  item,
  isActive,
  isTourHighlighted,
  isTourLocked,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  isTourHighlighted: boolean;
  isTourLocked: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="relative">
      {/* Tour highlight layer — rendered BEHIND the button */}
      <AnimatePresence>
        {isTourHighlighted && (
          <motion.div
            className="absolute inset-0 rounded-xl pointer-events-none overflow-hidden"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.18, ease: EASE_PREMIUM }}
          >
            <div
              className="absolute inset-0 rounded-xl"
              style={{
                background: "linear-gradient(90deg, rgba(0,212,255,0.18) 0%, rgba(0,212,255,0.06) 70%, transparent 100%)",
              }}
            />
            <div
              className="absolute -inset-[1px] rounded-[13px] border"
              style={{ borderColor: "rgba(0,212,255,0.40)" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active pill — magnetic spring settling layer */}
      {isActive && !isTourHighlighted && (
        <motion.div
          className="absolute inset-0 rounded-xl pointer-events-none"
          layoutId="sidebar-active-pill"
          transition={SPRING_TIGHT}
        >
          {/* Multi-layer active fill */}
          <div className="absolute inset-0 rounded-xl overflow-hidden">
            {/* Inner gradient */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(105deg, rgba(0,212,255,0.20) 0%, rgba(0,212,255,0.12) 55%, rgba(0,160,200,0.06) 100%)",
              }}
            />
            {/* Shimmer sweep — breathing */}
            <motion.div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)",
                backgroundSize: "200% 100%",
              }}
              animate={{ backgroundPosition: ["-100% 0", "200% 0"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
            />
            {/* Top inner highlight line */}
            <div
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(0,212,255,0.10) 30%, rgba(0,212,255,0.15) 60%, transparent 100%)",
              }}
            />
          </div>
          {/* Outer bloom */}
          <motion.div
            className="absolute inset-0 rounded-xl"
            style={{ boxShadow: "0 0 0 1px rgba(0,212,255,0.18), 0 0 16px -2px rgba(0,212,255,0.18)" }}
            animate={{ opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      )}

      <motion.button
        onClick={isTourLocked ? undefined : onClick}
        onHoverStart={() => { if (!isTourLocked) setHovered(true); }}
        onHoverEnd={() => setHovered(false)}
        data-tour={item.tourId}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium group relative overflow-hidden text-left select-none",
          isActive || isTourHighlighted
            ? "text-[#E6EAF0]"
            : "text-muted-foreground",
          isTourLocked && !isTourHighlighted && !isActive && "opacity-35",
          isTourLocked && "cursor-default pointer-events-none",
        )}
        whileHover={!isActive && !isTourHighlighted && !isTourLocked ? { y: -1, transition: { duration: 0.15, ease: EASE_PREMIUM } } : undefined}
        whileTap={!isTourLocked ? { scale: 0.975, transition: { duration: 0.1 } } : undefined}
      >
        {/* Hover background (non-active items) */}
        {!isActive && !isTourHighlighted && (
          <motion.div
            className="absolute inset-0 rounded-xl"
            style={{
              background:
                "linear-gradient(105deg, rgba(0,212,255,0.08) 0%, rgba(255,255,255,0.04) 100%)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: hovered ? 1 : 0 }}
            transition={{ duration: hovered ? 0.15 : 0.20, ease: EASE_PREMIUM }}
          />
        )}

        {/* Left accent bar */}
        <AnimatePresence>
          {(isActive || isTourHighlighted) && (
            <motion.div
              className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 20, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SPRING_SNAPPY}
              style={{
                width: 3,
                background: "linear-gradient(180deg, #33E0FF 0%, #00D4FF 60%, #33E0FF 100%)",
                boxShadow: "0 0 8px rgba(0,212,255,0.40)",
              }}
            />
          )}
        </AnimatePresence>

        {/* Icon */}
        <motion.div
          className="z-10 relative shrink-0"
          animate={
            isTourHighlighted
              ? { scale: 1.08, filter: "drop-shadow(0 0 5px rgba(0,212,255,0.40))" }
              : isActive
              ? { scale: 1.08, filter: "drop-shadow(0 0 6px rgba(0,212,255,0.50))" }
              : hovered
              ? { scale: 1.06, filter: "drop-shadow(0 0 4px rgba(0,212,255,0.25))" }
              : { scale: 1, filter: "none" }
          }
          transition={SPRING_SNAPPY}
        >
          <item.icon
            className={cn(
              "size-4 transition-colors",
              isActive && !isTourHighlighted ? "text-[#33E0FF]" : "",
              isTourHighlighted ? "text-[#33E0FF]" : "",
              !isActive && !isTourHighlighted && hovered ? "text-[#E6EAF0]" : "",
            )}
          />
        </motion.div>

        {/* Label */}
        <motion.span
          className="z-10 flex-1 truncate"
          animate={
            isTourHighlighted
              ? { color: "#e9d5ff", x: 0 }
              : isActive
              ? { color: "#ffffff", x: 1 }
              : hovered
              ? { color: "rgba(255,255,255,0.88)", x: 0 }
              : { color: undefined, x: 0 }
          }
          transition={{ duration: 0.18, ease: EASE_PREMIUM }}
        >
          {item.label}
        </motion.span>

        {/* Premium crown chip — right-rail locked */}
        {item.isPremium && (
          <motion.span
            className="z-10 shrink-0 flex items-center"
            animate={hovered || isActive ? { opacity: 1 } : { opacity: 0.65 }}
            transition={{ duration: 0.2 }}
          >
            <span className="crown-nav sidebar-crown-chip">
              <Crown className="size-2.5 text-[#00D4FF]" />
            </span>
          </motion.span>
        )}
      </motion.button>

      {/* Tour: beam shooting rightward */}
      <AnimatePresence>
        {isTourHighlighted && (
          <motion.div
            className="absolute pointer-events-none"
            style={{
              top: "50%",
              left: "100%",
              height: 1,
              width: 40,
              marginTop: -0.5,
              background: "linear-gradient(90deg, rgba(168,85,247,0.6), transparent)",
              filter: "blur(1px)",
            }}
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: [0, 1, 0], scaleX: [0, 1, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut", repeatDelay: 0.4 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { user, logout, isSigningOut, isPremium } = useAuth();
  const ent = useEntitlementUiState();
  const activeItemRef = useRef<HTMLDivElement>(null);
  const { activeTourHighlight, isTourActive } = useTourStore();
  const [appVersion, setAppVersion] = useState<string | null>(cachedAppVersion);
  useEffect(() => {
    if (cachedAppVersion) return;
    const api = (window as any).electronAPI;
    if (api?.getVersion) {
      api.getVersion().then((v: string) => {
        cachedAppVersion = v;
        setAppVersion(v);
      }).catch(() => {});
    }
  }, []);
  useEffect(() => {
    const handleWindowBlur = () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    };
    window.addEventListener("blur", handleWindowBlur);
    return () => window.removeEventListener("blur", handleWindowBlur);
  }, []);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, []);

  const currentPath = location === "/" ? "/dashboard" : location;
  const isTrial = ent.status === "trial_active";
  // Only slide the sidebar away for premium users on Driver Intel — they get the
  // full immersive scan UI.  Trial and free users see the upgrade gate with the
  // sidebar present so they can navigate away.
  const isDriverIntel = location === "/driver-intel" && isPremium;
  const userName = user?.name || user?.firstName || user?.email?.split("@")[0] || "User";
  const userInitials = userName.slice(0, 2).toUpperCase();
  const avatarUrl = user?.avatar;

  const navigate = (href: string) => setLocation(href);

  return (
    <motion.aside
      className="sidebar-shell fixed left-0 top-0 h-full w-64 flex flex-col z-50"
      animate={{
        x: isDriverIntel ? -264 : 0,
        opacity: isDriverIntel ? 0 : 1,
      }}
      transition={{ type: "spring", stiffness: 340, damping: 38, mass: 1 }}
      style={{ willChange: "transform, opacity" }}
    >
      {/* ── Layer 1: Base surface (rendered by CSS class) ── */}

      {/* ── Layer 2: Ambient drifting glows ── */}
      <SidebarAmbientGlow />

      {/* ── Layer 3: Grid texture overlay ── */}
      <div className="sidebar-grid-overlay absolute inset-0 pointer-events-none" aria-hidden />

      {/* ── Layer 4: Right-edge seam glow ── */}
      <div className="sidebar-seam absolute right-0 top-0 h-full w-px pointer-events-none" aria-hidden />

      {/* ── Tour vignette ── */}
      <AnimatePresence>
        {isTourActive && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 100% 60% at 50% 50%, transparent 40%, rgba(20,24,29,0.4) 100%)",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Logo ── */}
      <div className="relative z-10 px-6 pt-6 pb-3">
        <BrandLogo size="lg" linkTo="#/dashboard" />
      </div>

      {/* ── Nav rail ── */}
      <nav className="relative z-10 flex-1 overflow-y-auto py-2 px-3 space-y-0.5 scrollbar-thin scrollbar-thumb-sidebar-accent scrollbar-track-transparent">
        {NAV_ITEMS.map((item) => {
          const isActive = currentPath === item.href;
          const isTourHighlighted = isTourActive && item.tourId === activeTourHighlight;

          return (
            <div
              key={item.href}
              ref={isActive ? activeItemRef : undefined}
            >
              <NavItemRow
                item={item}
                isActive={isActive}
                isTourHighlighted={isTourHighlighted}
                isTourLocked={isTourActive}
                onClick={() => { if (!isTourActive) navigate(item.href); }}
              />
            </div>
          );
        })}
      </nav>

      {/* ── Footer dock ── */}
      <div className="sidebar-footer-dock relative z-10">
        {/* Footer top glow seam */}
        <div className="sidebar-footer-seam absolute inset-x-0 top-0 h-px pointer-events-none" aria-hidden />

        <motion.div
          className="sidebar-footer-inner p-4"
        >
          {/* User row */}
          <div className="sidebar-user-row flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-[#2A313A]/60">
            {/* Avatar */}
            <div className="sidebar-avatar-wrap relative shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={userName}
                  className="size-9 rounded-full object-cover"
                />
              ) : (
                <div className="size-9 rounded-full bg-[#2A313A] border border-[#2A313A] flex items-center justify-center text-xs font-mono text-[#A0A8B3] shadow-inner">
                  {userInitials}
                </div>
              )}
              {/* Avatar ring glow — premium gets a strong outward radiant halo */}
              {isPremium && (
                <div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    inset: "-6px",
                    borderRadius: "9999px",
                    background: "radial-gradient(circle, rgba(255,195,50,0.22) 0%, rgba(255,160,30,0.10) 50%, transparent 70%)",
                    boxShadow: "0 0 0 1.5px rgba(255,215,80,0.85), 0 0 10px 3px rgba(255,195,50,0.60), 0 0 22px 8px rgba(255,170,30,0.38), 0 0 40px 14px rgba(255,140,20,0.18)",
                    animation: "sc-premium-halo 2.8s ease-in-out infinite",
                  }}
                />
              )}
              {!isPremium && (
                <div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }}
                />
              )}
            </div>

            {/* User info */}
            <div className="flex flex-col flex-1 min-w-0 gap-0.5">
              <span className="text-sm font-medium text-[#E6EAF0] truncate">{userName}</span>
              {ent.showTrialBadge ? (
                <motion.div
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-full w-fit"
                  style={{
                    background: "linear-gradient(90deg, rgba(6,182,212,0.15) 0%, rgba(139,92,246,0.12) 100%)",
                    border: "1px solid rgba(6,182,212,0.35)",
                  }}
                  animate={{ opacity: [1, 0.75, 1] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Clock className="size-2.5 shrink-0" style={{ color: "rgba(6,182,212,0.9)" }} />
                  <span className="text-[9px] font-bold truncate" style={{ color: "rgba(6,182,212,0.9)", maxWidth: 80 }}>
                    {ent.countdownLabel}
                  </span>
                </motion.div>
              ) : ent.showPremiumBadge ? (
                <div className="premium-badge">
                  <span className="crown-animated">
                    <Crown className="size-2.5" style={{ color: "hsl(48 95% 70%)" }} />
                  </span>
                  <span className="premium-badge-text">Premium</span>
                </div>
              ) : (
                <div className="free-badge">
                  <span className="free-badge-text">Free</span>
                </div>
              )}
            </div>

            {/* Logout */}
            <motion.button
              onClick={isSigningOut ? undefined : logout}
              disabled={isSigningOut}
              className={cn(
                "size-7 rounded-lg flex items-center justify-center transition-colors",
                isSigningOut ? "text-red-400/40 cursor-default" : "text-muted-foreground/40",
              )}
              whileHover={isSigningOut ? {} : {
                color: "#f87171",
                backgroundColor: "rgba(239,68,68,0.12)",
                transition: { duration: 0.15 },
              }}
              whileTap={isSigningOut ? {} : { scale: 0.9 }}
              data-testid="button-sign-out"
            >
              {isSigningOut
                ? <Loader2 className="size-3.5 animate-spin" />
                : <LogOut className="size-3.5" />}
            </motion.button>
          </div>

          {/* Bottom bar: version + social icons */}
          <div className="mt-2 flex items-center justify-between px-2">
            <span className="text-[10px] text-muted-foreground/40 font-mono tracking-wide">
              {appVersion ? `v${appVersion}` : "SwitchControl"}
            </span>
            <div className="flex items-center gap-0.5">
              <motion.button
                onClick={() => {
                  const api = (window as any).electronAPI;
                  if (api?.openExternal) {
                    api.openExternal(SOCIAL_LINKS.discord);
                  } else {
                    window.open(SOCIAL_LINKS.discord, "_blank");
                  }
                }}
                className="size-6 rounded flex items-center justify-center text-muted-foreground/40"
                whileHover={{
                  color: "#5865F2",
                  backgroundColor: "rgba(88,101,242,0.12)",
                  scale: 1.1,
                  transition: { duration: 0.15 },
                }}
                whileTap={{ scale: 0.9 }}
                title="Discord"
                data-testid="sidebar-link-discord"
              >
                <DiscordIcon className="size-3.5" />
              </motion.button>

              <motion.button
                onClick={() => {
                  const api = (window as any).electronAPI;
                  if (api?.openExternal) {
                    api.openExternal(SOCIAL_LINKS.youtube);
                  } else {
                    window.open(SOCIAL_LINKS.youtube, "_blank");
                  }
                }}
                className="size-6 rounded flex items-center justify-center text-muted-foreground/40"
                whileHover={{
                  color: "#ef4444",
                  backgroundColor: "rgba(239,68,68,0.12)",
                  scale: 1.1,
                  transition: { duration: 0.15 },
                }}
                whileTap={{ scale: 0.9 }}
                title="YouTube"
                data-testid="sidebar-link-youtube"
              >
                <YouTubeIcon className="size-3.5" />
              </motion.button>

              <motion.button
                onClick={() => {
                  const api = (window as any).electronAPI;
                  if (api?.openExternal) {
                    api.openExternal(SOCIAL_LINKS.tiktokSwitchTech);
                  } else {
                    window.open(SOCIAL_LINKS.tiktokSwitchTech, "_blank");
                  }
                }}
                className="size-6 rounded flex items-center justify-center text-muted-foreground/40"
                whileHover={{
                  color: "#ec4899",
                  backgroundColor: "rgba(236,72,153,0.12)",
                  scale: 1.1,
                  transition: { duration: 0.15 },
                }}
                whileTap={{ scale: 0.9 }}
                title="TikTok · SwitchTech"
                data-testid="sidebar-link-tiktok-switchtech"
              >
                <TikTokIcon className="size-3.5" />
              </motion.button>

              <motion.button
                onClick={() => {
                  const api = (window as any).electronAPI;
                  if (api?.openExternal) {
                    api.openExternal(SOCIAL_LINKS.tiktokSwitchControl);
                  } else {
                    window.open(SOCIAL_LINKS.tiktokSwitchControl, "_blank");
                  }
                }}
                className="size-6 rounded flex items-center justify-center text-muted-foreground/40"
                whileHover={{
                  color: "#ec4899",
                  backgroundColor: "rgba(236,72,153,0.12)",
                  scale: 1.1,
                  transition: { duration: 0.15 },
                }}
                whileTap={{ scale: 0.9 }}
                title="TikTok · SwitchControl"
                data-testid="sidebar-link-tiktok-switchcontrol"
              >
                <TikTokIcon className="size-3.5" />
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.aside>
  );
}
