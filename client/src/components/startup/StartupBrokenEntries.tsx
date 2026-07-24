import { useState } from "react";
import { motion, AnimatePresence } from "@/lib/motionTokens";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BootApp } from "./startupUtils";
import { Bug, AlertTriangle, ChevronDown, Wrench, Trash2 } from "lucide-react";

interface Props {
  apps: BootApp[];
  onFixAll: () => void;
  visible: boolean;
}

export function StartupBrokenEntries({ apps, onFixAll, visible }: Props) {
  const [expanded, setExpanded] = useState(false);
  const broken = apps.filter(a => a.entry.broken);

  if (!visible || broken.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-red-500/30 bg-red-500/[0.04] p-4 overflow-hidden relative"
    >
      <div className="absolute top-0 right-0 w-48 h-48 bg-red-500/10 rounded-full blur-[50px] pointer-events-none -translate-y-1/2 translate-x-1/2" />

      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-red-500/20 flex items-center justify-center border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
            <Bug className="size-4 text-red-400" />
          </div>
          <div>
            <span className="text-sm font-bold text-[#E6EAF0] uppercase tracking-wide">Ghost Entries Found</span>
            <div className="text-[10px] text-red-400/80 font-medium mt-0.5">
              {broken.length} orphaned registry {broken.length === 1 ? "key" : "keys"}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={onFixAll}
            className="h-8 px-4 text-xs font-bold uppercase tracking-wider rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 transition-all"
          >
            <Trash2 className="size-3.5 mr-1.5" />
            Clean Registry
          </Button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400/60 hover:text-red-400 transition-colors"
          >
            <ChevronDown className={cn("size-4 transition-transform duration-300", expanded && "rotate-180")} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden relative z-10"
          >
            <div className="mt-4 pt-3 border-t border-red-500/20 space-y-2">
              {broken.map(app => (
                <div
                  key={app.entry.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#0E1116]/60 border border-red-500/10"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="size-3.5 text-red-400 shrink-0" />
                    <span className="text-xs font-medium text-[#E6EAF0] truncate">{app.entry.name || "Unknown"}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/50 font-mono truncate bg-black/40 px-2 py-1 rounded w-full sm:w-auto text-left sm:text-right" title={app.entry.executablePath || app.entry.commandLine}>
                    {app.entry.executablePath || app.entry.commandLine || "No path data"}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
