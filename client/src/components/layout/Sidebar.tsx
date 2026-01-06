import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Settings, 
  Zap, 
  Activity, 
  Network, 
  ShieldCheck, 
  Trash2, 
  Rocket, 
  Moon,
  List,
  Wifi,
  Terminal
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { motion, sidebarSlide, useMotion } from "@/lib/motion";
import { SOCIAL_LINKS } from "@/config/socialLinks";

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

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Tweaks", icon: Settings, href: "/tweaks" },
  { label: "Power Plan", icon: Zap, href: "/power-plan" },
  { label: "App Booster", icon: Rocket, href: "/app-booster" },
  { label: "Focus Mode", icon: Moon, href: "/focus" },
  { label: "Network Tweaks", icon: Wifi, href: "/network" },
  { label: "Cleaner", icon: Trash2, href: "/cleaner" },
  { label: "Debloat", icon: ShieldCheck, href: "/debloat" },
  { label: "Startup", icon: List, href: "/startup" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

export function Sidebar() {
  const [location] = useLocation();
  const { prefersReducedMotion, hasLoaded } = useMotion();
  const shouldAnimate = !prefersReducedMotion;

  const SidebarWrapper = shouldAnimate ? motion.aside : "aside";
  const sidebarProps = shouldAnimate && !hasLoaded ? {
    variants: sidebarSlide,
    initial: "initial",
    animate: "animate",
  } : {};

  return (
    <SidebarWrapper 
      className="fixed left-0 top-0 h-full w-64 bg-sidebar/80 backdrop-blur-xl border-r border-sidebar-border flex flex-col z-50 shadow-2xl"
      {...sidebarProps}
    >
      <div className="p-6 flex items-center gap-3">
        <motion.div 
          className="relative size-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold shadow-lg shadow-primary/20 group overflow-hidden"
          whileHover={shouldAnimate ? { scale: 1.05 } : undefined}
          whileTap={shouldAnimate ? { scale: 0.95 } : undefined}
        >
          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          S
        </motion.div>
        <div className="flex flex-col">
          <span className="font-bold text-lg tracking-tight text-white bg-gradient-to-br from-white to-white/60 bg-clip-text">SwitchControl</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Optimization</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-thin scrollbar-thumb-sidebar-accent scrollbar-track-transparent">
        {NAV_ITEMS.map((item, index) => {
          const isActive = location === item.href;
          const NavItem = shouldAnimate ? motion.div : "div";
          
          return (
            <NavItem
              key={item.href}
              initial={shouldAnimate && !hasLoaded ? { opacity: 0, x: -20 } : undefined}
              animate={shouldAnimate && !hasLoaded ? { opacity: 1, x: 0 } : undefined}
              transition={shouldAnimate ? { delay: index * 0.03, duration: 0.3 } : undefined}
              whileHover={shouldAnimate ? { x: 4 } : undefined}
            >
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative overflow-hidden",
                  isActive 
                    ? "text-white shadow-lg shadow-black/20" 
                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                )}
              >
                {isActive && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent"
                    layoutId={shouldAnimate ? "activeIndicator" : undefined}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                {isActive && (
                  <motion.div 
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full shadow-[0_0_10px_hsl(var(--primary))]"
                    layoutId={shouldAnimate ? "activePill" : undefined}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                
                <item.icon className={cn(
                  "size-4 transition-all duration-200 z-10", 
                  isActive ? "text-primary scale-110 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]" : "group-hover:text-primary/80 group-hover:scale-105"
                )} />
                <span className={cn("z-10 transition-transform duration-200", isActive && "translate-x-0.5")}>{item.label}</span>
              </Link>
            </NavItem>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/5 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-2 group cursor-default">
          <div className="size-8 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 ring-1 ring-white/10 flex items-center justify-center text-xs font-mono text-zinc-400 shadow-inner transition-transform duration-300 group-hover:scale-105">
            ST
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-white group-hover:text-primary transition-colors">SwitchTech</span>
            <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded w-fit border border-emerald-500/10 shadow-[0_0_10px_rgba(52,211,153,0.1)]">Premium</span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between px-2">
          <span className="text-[10px] text-muted-foreground font-mono opacity-50">v0.1.0-alpha</span>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.a
                  href={SOCIAL_LINKS.discord}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="size-6 rounded flex items-center justify-center text-muted-foreground/50 hover:text-[#5865F2] hover:bg-[#5865F2]/10 transition-all duration-200"
                  data-testid="sidebar-link-discord"
                  whileHover={shouldAnimate ? { scale: 1.1 } : undefined}
                  whileTap={shouldAnimate ? { scale: 0.9 } : undefined}
                >
                  <DiscordIcon className="size-3.5" />
                </motion.a>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Join our Discord
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.a
                  href={SOCIAL_LINKS.tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="size-6 rounded flex items-center justify-center text-muted-foreground/50 hover:text-pink-500 hover:bg-pink-500/10 transition-all duration-200"
                  data-testid="sidebar-link-tiktok"
                  whileHover={shouldAnimate ? { scale: 1.1 } : undefined}
                  whileTap={shouldAnimate ? { scale: 0.9 } : undefined}
                >
                  <TikTokIcon className="size-3.5" />
                </motion.a>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Follow on TikTok
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </SidebarWrapper>
  );
}
