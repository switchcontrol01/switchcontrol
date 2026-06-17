import { useState } from "react";
import { motion, AnimatePresence } from "@/lib/motionTokens";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BootApp } from "./startupUtils";
import { Bug, AlertTriangle, ChevronDown, ChevronUp, Wrench } from "lucide-react";

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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-red-500/10 flex items-center justify-center">
            <Bug className="size-3.5 text-red-400" />
          </div>
          <div>
            <span className="text-sm font-medium text-[#E6EAF0]">Broken Entries</span>
            <span className="text-[10px] text-red-400/70 ml-2">{broken.length} missing {broken.length === 1 ? "executable" : "executables"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={onFixAll}
            size="sm"
            className="h-7 px-2.5 text-xs rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/20"
          >
            <Wrench className="size-3 mr-1" />
            Fix All
          </Button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1 rounded hover:bg-[#21262D] text-[#6B7380] hover:text-[#E6EAF0] transition-colors"
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2.5 pt-2.5  space-y-1.5">
              {broken.map(app => (
                <div
                  key={app.entry.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[#1A1F26]"
                >
                  <AlertTriangle className="size-3 text-red-400/60 shrink-0" />
                  <span className="text-xs text-[#A0A8B3] truncate">{app.entry.name}</span>
                  <span className="text-[9px] text-muted-foreground/30 ml-auto truncate max-w-[200px]">
                    {app.entry.executablePath ?? "unknown path"}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
