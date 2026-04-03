import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Settings, 
  Zap, 
  Shield,
  Trash2, 
  Rocket, 
  Moon,
  List,
  Wifi,
  Cpu,
  Crown,
  LogOut,
  Activity,
  Brain
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SOCIAL_LINKS } from "@/config/socialLinks";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useTourStore } from "@/lib/tour-store";


function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
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
  { label: "App Booster", icon: Rocket, href: "/app-booster" },
  { label: "Focus Mode", icon: Moon, href: "/focus" },
  { label: "Network Tweaks", icon: Wifi, href: "/network", isPremium: true, tourId: "network" },
  { label: "Cleaner", icon: Trash2, href: "/cleaner" },
  { label: "Debloat", icon: Shield, href: "/debloat" },
  { label: "Startup", icon: List, href: "/startup" },
  { label: "AI Advisor", icon: Brain, href: "/ai-advisor", isPremium: true, tourId: "ai-advisor" },
  { label: "BIOS Advisor", icon: Cpu, href: "/bios-advisor", isPremium: true, tourId: "bios-advisor" },
  { label: "Security", icon: Shield, href: "/security", tourId: "security" },
  { label: "History", icon: Activity, href: "/history" },
  { label: "Settings", icon: Settings, href: "/settings", tourId: "settings" },
];

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { user, isPremium, logout } = useAuth();
  const activeItemRef = useRef<HTMLDivElement>(null);
  const { activeTourHighlight, isTourActive } = useTourStore();

  useEffect(() => {
    const handleWindowBlur = () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, []);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, []);
  
  const currentPath = location === "/" ? "/dashboard" : location;
  
  const userName = user?.name || user?.firstName || user?.email?.split('@')[0] || 'User';
  const userInitials = userName.slice(0, 2).toUpperCase();
  const avatarUrl = user?.avatar;

  const navigate = (href: string) => {
    setLocation(href);
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-gradient-to-b from-[hsl(270,60%,55%,0.08)] via-sidebar/90 to-sidebar/95 backdrop-blur-xl border-r border-[hsl(270,60%,55%,0.15)] flex flex-col z-50 shadow-2xl">
      {/* Tour active: gentle vignette on the sidebar top/bottom edges */}
      <AnimatePresence>
        {isTourActive && (
          <motion.div
            className="absolute inset-0 pointer-events-none rounded-none overflow-hidden"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(ellipse 100% 60% at 50% 50%, transparent 40%, rgba(139,92,246,0.07) 100%)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-6">
        <BrandLogo size="lg" linkTo="#/dashboard" />
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-thin scrollbar-thumb-sidebar-accent scrollbar-track-transparent">
        {NAV_ITEMS.map((item) => {
          const isActive = currentPath === item.href;
          const isTourHighlighted = isTourActive && item.tourId === activeTourHighlight;
          
          return (
            <div key={item.href} ref={isActive ? activeItemRef : undefined} className="relative">

              {/* Tour highlight glow layer — rendered BEHIND the button */}
              <AnimatePresence>
                {isTourHighlighted && (
                  <motion.div
                    className="absolute inset-0 rounded-lg pointer-events-none overflow-hidden"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* Main glow fill */}
                    <motion.div
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: 'linear-gradient(90deg, rgba(139,92,246,0.28) 0%, rgba(168,85,247,0.12) 70%, transparent 100%)',
                      }}
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    {/* Outer glow ring */}
                    <motion.div
                      className="absolute -inset-[2px] rounded-[10px] border"
                      style={{ borderColor: 'rgba(168,85,247,0.5)' }}
                      animate={{ boxShadow: [
                        '0 0 0px rgba(168,85,247,0)',
                        '0 0 16px rgba(168,85,247,0.5), inset 0 0 8px rgba(168,85,247,0.15)',
                        '0 0 0px rgba(168,85,247,0)',
                      ]}}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    {/* Shimmer sweep */}
                    <motion.div
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.08) 50%, transparent 65%)',
                        backgroundSize: '200% 100%',
                      }}
                      animate={{ backgroundPosition: ['-100% 0', '200% 0'] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.8 }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                onClick={() => navigate(item.href)}
                data-tour={item.tourId}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium group relative overflow-hidden text-left",
                  isActive || isTourHighlighted
                    ? "text-white shadow-lg shadow-black/20"
                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                )}
                animate={isTourHighlighted ? { scale: [1, 1.015, 1] } : { scale: 1 }}
                transition={isTourHighlighted ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : {}}
              >
                {/* Standard active background */}
                {isActive && !isTourHighlighted && (
                  <div className="absolute inset-0 bg-gradient-to-r from-[hsl(270,60%,55%,0.25)] to-transparent" />
                )}

                {/* Left accent bar — active or tour-highlighted */}
                {(isActive || isTourHighlighted) && (
                  <motion.div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full"
                    style={{
                      height: isTourHighlighted ? 20 : 18,
                      background: isTourHighlighted
                        ? 'linear-gradient(180deg, #c084fc, #a855f7, #ec4899)'
                        : 'hsl(270,60%,55%)',
                    }}
                    animate={isTourHighlighted ? {
                      boxShadow: [
                        '0 0 6px rgba(168,85,247,0.5)',
                        '0 0 18px rgba(168,85,247,0.9), 0 0 30px rgba(236,72,153,0.4)',
                        '0 0 6px rgba(168,85,247,0.5)',
                      ],
                      height: [18, 24, 18],
                    } : {
                      boxShadow: '0 0 12px hsl(270,60%,55%,0.6)',
                    }}
                    transition={isTourHighlighted ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : {}}
                  />
                )}
                
                {/* Icon */}
                <motion.div
                  className="z-10"
                  animate={isTourHighlighted ? {
                    filter: [
                      'drop-shadow(0 0 4px rgba(168,85,247,0.4))',
                      'drop-shadow(0 0 12px rgba(168,85,247,0.9)) drop-shadow(0 0 20px rgba(236,72,153,0.5))',
                      'drop-shadow(0 0 4px rgba(168,85,247,0.4))',
                    ],
                    scale: [1, 1.2, 1],
                  } : {}}
                  transition={isTourHighlighted ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : {}}
                >
                  <item.icon className={cn(
                    "size-4",
                    isActive && !isTourHighlighted ? "text-primary scale-110 drop-shadow-[0_0_8px_hsl(270,60%,55%,0.5)]" : "",
                    isTourHighlighted ? "text-violet-300" : "",
                  )} />
                </motion.div>

                {/* Label */}
                <motion.span
                  className={cn("z-10 flex-1", (isActive || isTourHighlighted) && "translate-x-0.5")}
                  animate={isTourHighlighted ? { color: ['#e9d5ff', '#ffffff', '#e9d5ff'] } : {}}
                  transition={isTourHighlighted ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : {}}
                >
                  {item.label}
                </motion.span>

                {item.isPremium && (
                  <Crown className="size-3.5 text-[hsl(270,60%,55%)] z-10 shrink-0" />
                )}
              </motion.button>

              {/* Tour: beam shooting rightward from this item */}
              <AnimatePresence>
                {isTourHighlighted && (
                  <motion.div
                    className="absolute pointer-events-none"
                    style={{
                      top: '50%',
                      left: '100%',
                      height: 1,
                      width: 40,
                      marginTop: -0.5,
                      background: 'linear-gradient(90deg, rgba(168,85,247,0.6), transparent)',
                      filter: 'blur(1px)',
                    }}
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: [0, 1, 0], scaleX: [0, 1, 1] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut', repeatDelay: 0.4 }}
                  />
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/5 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-2 group">
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt={userName}
              className="size-9 rounded-full ring-2 ring-white/10 object-cover"
            />
          ) : (
            <div className="size-9 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 ring-2 ring-white/10 flex items-center justify-center text-xs font-mono text-zinc-400 shadow-inner">
              {userInitials}
            </div>
          )}
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium text-white truncate">{userName}</span>
            {isPremium ? (
              <span className="text-[10px] text-[hsl(270,60%,65%)] font-medium bg-[hsl(270,60%,55%,0.15)] px-1.5 py-0.5 rounded w-fit border border-[hsl(270,60%,55%,0.2)] flex items-center gap-1">
                <Crown className="size-2.5" />
                Premium
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground font-medium bg-white/5 px-1.5 py-0.5 rounded w-fit border border-white/10">
                Free
              </span>
            )}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={logout}
                className="size-7 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10"
              >
                <LogOut className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Sign out
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="mt-3 flex items-center justify-between px-2">
          <span className="text-[10px] text-muted-foreground font-mono opacity-50">v1.0.0 (Early Access)</span>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    const api = (window as any).electronAPI;
                    if (api?.openExternal) {
                      api.openExternal(SOCIAL_LINKS.discord);
                    } else {
                      window.open(SOCIAL_LINKS.discord, '_blank');
                    }
                  }}
                  className="size-6 rounded flex items-center justify-center text-muted-foreground/50 hover:text-[#5865F2] hover:bg-[#5865F2]/10"
                  data-testid="sidebar-link-discord"
                >
                  <DiscordIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Join our Discord
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    const api = (window as any).electronAPI;
                    if (api?.openExternal) {
                      api.openExternal(SOCIAL_LINKS.tiktok);
                    } else {
                      window.open(SOCIAL_LINKS.tiktok, '_blank');
                    }
                  }}
                  className="size-6 rounded flex items-center justify-center text-muted-foreground/50 hover:text-pink-500 hover:bg-pink-500/10"
                  data-testid="sidebar-link-tiktok"
                >
                  <TikTokIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Follow on TikTok
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </aside>
  );
}
