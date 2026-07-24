import { useMemo } from "react";
import { motion } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import type { BootApp, StartupCategory } from "./startupUtils";
import {
  HardDrive, Wrench, Gamepad2, CalendarDays, Bug,
} from "lucide-react";

const TAB_META: Record<StartupCategory, { label: string; icon: typeof HardDrive; color: string; bg: string }> = {
  system:    { label: "System",    icon: HardDrive,  color: "text-[#00D4FF]", bg: "bg-[#00D4FF]/10" },
  drivers:   { label: "Drivers",   icon: Wrench,     color: "text-cyan-400", bg: "bg-cyan-400/10" },
  userApps:  { label: "User Apps", icon: Gamepad2,   color: "text-orange-400", bg: "bg-orange-400/10" },
  scheduled: { label: "Scheduled", icon: CalendarDays, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  broken:    { label: "Broken",    icon: Bug,        color: "text-red-400", bg: "bg-red-400/10" },
};

interface Props {
  apps: BootApp[];
  activeTab: StartupCategory | "all";
  onTabChange: (tab: StartupCategory | "all") => void;
  visible: boolean;
}

export function StartupCategories({ apps, activeTab, onTabChange, visible }: Props) {
  const counts = useMemo(() => {
    const c: Record<string, { count: number; delayMs: number; enabled: number }> = {
      all: { count: 0, delayMs: 0, enabled: 0 },
    };
    for (const app of apps) {
      if (!c[app.category]) c[app.category] = { count: 0, delayMs: 0, enabled: 0 };
      c[app.category].count++;
      c[app.category].delayMs += app.delayMs;
      if (app.entry.enabled) c[app.category].enabled++;
      c.all.count++;
      c.all.delayMs += app.delayMs;
      if (app.entry.enabled) c.all.enabled++;
    }
    return c;
  }, [apps]);

  const tabs: (StartupCategory | "all")[] = ["all", "userApps", "system", "drivers", "scheduled", "broken"];

  return (
    <div className="w-full pb-1">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 w-full">
        {tabs.map(tab => {
          const meta = tab === "all"
            ? { label: "All", icon: HardDrive, color: "text-[#E6EAF0]", bg: "bg-white/10" }
            : TAB_META[tab];
          const Icon = meta.icon;
          const c = counts[tab] ?? { count: 0, delayMs: 0, enabled: 0 };
          const isActive = activeTab === tab;

          // Don't show empty categories except for 'all'
          if (tab !== "all" && c.count === 0) return null;

          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={cn(
                "group relative flex min-w-0 flex-col gap-1.5 px-2.5 py-2.5 rounded-xl border transition-all duration-300",
                isActive
                  ? "bg-[#21262D] border-white/10 shadow-lg"
                  : "bg-[#1A1F26]/40 border-white/[0.02] hover:bg-[#1A1F26] hover:border-white/[0.05]"
              )}
            >
              {isActive && (
                <motion.div 
                  layoutId="activeTabIndicator" 
                  className="absolute inset-0 rounded-xl border border-white/10 bg-white/[0.02] pointer-events-none" 
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <div className="flex items-center justify-between w-full min-w-0 relative z-10">
                <div className={cn("size-6 rounded-lg flex items-center justify-center", meta.bg)}>
                  <Icon className={cn("size-3.5", meta.color)} />
                </div>
                {c.count > 0 && (
                  <span className={cn("text-[10px] tabular-nums font-mono", isActive ? "text-[#E6EAF0]" : "text-muted-foreground/60")}>
                    {c.enabled}/{c.count}
                  </span>
                )}
              </div>
              <span className={cn("text-xs font-semibold truncate relative z-10", isActive ? "text-[#E6EAF0]" : "text-muted-foreground/70")}>
                {meta.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
