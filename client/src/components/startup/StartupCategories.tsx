import { useMemo } from "react";
import { motion } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import type { BootApp, StartupCategory } from "./startupUtils";
import {
  HardDrive, Wrench, Gamepad2, CalendarDays, Bug,
} from "lucide-react";

const TAB_META: Record<StartupCategory, { label: string; icon: typeof HardDrive; color: string }> = {
  system:    { label: "System",    icon: HardDrive,  color: "text-[#00D4FF]" },
  drivers:   { label: "Drivers",   icon: Wrench,     color: "text-cyan-400" },
  userApps:  { label: "User Apps", icon: Gamepad2,   color: "text-orange-400" },
  scheduled: { label: "Scheduled", icon: CalendarDays, color: "text-emerald-400" },
  broken:    { label: "Broken",    icon: Bug,        color: "text-red-400" },
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

  const tabs: (StartupCategory | "all")[] = ["all", "system", "drivers", "userApps", "scheduled", "broken"];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tabs.map(tab => {
        const meta = tab === "all"
          ? { label: "All", icon: HardDrive, color: "text-[#E6EAF0]" }
          : TAB_META[tab];
        const Icon = meta.icon;
        const c = counts[tab] ?? { count: 0, delayMs: 0, enabled: 0 };
        const isActive = activeTab === tab;

        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
              isActive
                ? "bg-[#2A313A] border-[#2A313A] text-[#E6EAF0]"
                : "bg-transparent border-[#2A313A] text-[#6B7380] hover:text-[#A0A8B3] hover:bg-[#1A1F26]"
            )}
          >
            <Icon className={cn("size-3.5", meta.color)} />
            <span>{meta.label}</span>
            {c.count > 0 && (
              <span className={cn("text-[10px] tabular-nums", isActive ? "text-[#A0A8B3]" : "text-[#6B7380]")}>
                {c.enabled}/{c.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
