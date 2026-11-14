import { useState } from "react";
import { Package, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "./_PageHeader";

export function DebloaterHeader({ className }: { className?: string }) {
  const [mainTab, setMainTab] = useState<"curated" | "installed">("curated");

  return (
    <div className={cn("debloater-notebook-head", className)}>
      <PageHeader
        icon={ShieldCheck}
        title="Debloater"
        subtitle="Role-based system reduction with real Windows integration. Items are removed via PowerShell, honest results only."
      />
      <div className="debloater-tabs flex gap-1 p-1 rounded-xl bg-[#21262D] border border-[#2A313A] w-fit">
        {([
          { id: "curated", label: "Curated Removals", icon: ShieldCheck },
          { id: "installed", label: "Installed Apps", icon: Package },
        ] as const).map(tab => {
          const Icon = tab.icon;
          const active = mainTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setMainTab(tab.id)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-base font-semibold transition-all duration-200",
                active
                  ? "bg-primary/15 text-primary border border-primary/25 shadow-sm"
                  : "text-muted-foreground hover:text-foreground/80 hover:bg-[#21262D]",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
