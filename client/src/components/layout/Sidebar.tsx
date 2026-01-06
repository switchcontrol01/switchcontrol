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

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Tweaks", icon: Settings, href: "/tweaks" },
  { label: "Power Plan", icon: Zap, href: "/power-plan" },
  { label: "App Booster", icon: Rocket, href: "/app-booster" },
  { label: "Focus Mode", icon: Moon, href: "/focus" },
  { label: "Network Tweaks", icon: Wifi, href: "/network" },
  { label: "Network Scripts", icon: Terminal, href: "/scripts" },
  { label: "Cleaner", icon: Trash2, href: "/cleaner" },
  { label: "Debloat", icon: ShieldCheck, href: "/debloat" },
  { label: "Startup", icon: List, href: "/startup" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-50">
      {/* Brand */}
      <div className="p-6 flex items-center gap-3">
        <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold shadow-lg shadow-primary/20">
          S
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-lg tracking-tight text-white">SwitchControl</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Optimization</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <a
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative",
                  isActive 
                    ? "text-white bg-sidebar-accent/50 shadow-inner" 
                    : "text-muted-foreground hover:text-white hover:bg-sidebar-accent/30"
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full shadow-[0_0_8px_hsl(var(--primary))]" />
                )}
                <item.icon className={cn("size-4 transition-colors", isActive ? "text-primary" : "group-hover:text-primary/80")} />
                {item.label}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/10">
        <div className="flex items-center gap-3 px-2">
          <div className="size-8 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 ring-1 ring-white/10 flex items-center justify-center text-xs font-mono text-zinc-400">
            ST
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-white">SwitchTech</span>
            <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded w-fit">Premium</span>
          </div>
        </div>
        <div className="mt-3 text-[10px] text-center text-muted-foreground font-mono opacity-50">
          v0.1.0-alpha
        </div>
      </div>
    </aside>
  );
}
