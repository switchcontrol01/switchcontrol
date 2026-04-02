import { AppLayout } from "@/components/layout/AppLayout";
import { useStore } from "@/lib/store";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileJson, Trash2, History as HistoryIcon, Zap, Clock, CheckCircle2, Inbox } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence, pageTransition, staggerContainer, staggerItem, useMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

const PAGE_BADGES: Record<string, { label: string; cls: string }> = {
  Tweaks:    { label: "Tweaks",    cls: "bg-primary/15 text-primary border-primary/25" },
  Dashboard: { label: "Dashboard", cls: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  Security:  { label: "Security",  cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  Power:     { label: "Power",     cls: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
};

export default function History() {
  const { history, resetData } = useStore();
  const { prefersReducedMotion } = useMotion();

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(history, null, 2));
    const a = document.createElement("a");
    a.setAttribute("href", dataStr);
    a.setAttribute("download", "switchcontrol_history.json");
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const MotionDiv = prefersReducedMotion ? "div" : motion.div;
  const pageProps = prefersReducedMotion ? {} : { variants: pageTransition, initial: "initial", animate: "animate" };
  const listProps = prefersReducedMotion ? {} : { variants: staggerContainer, initial: "initial", animate: "animate" };
  const itemProps = prefersReducedMotion ? {} : { variants: staggerItem };

  return (
    <AppLayout>
      <MotionDiv className="flex flex-col gap-6 pb-10" {...pageProps}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <motion.h1
              className="text-2xl font-bold tracking-tight flex items-center gap-3"
              initial={prefersReducedMotion ? false : { opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.span
                initial={prefersReducedMotion ? false : { rotate: -20, scale: 0.6, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                transition={{ duration: 0.45, delay: 0.08, ease: [0.34, 1.56, 0.64, 1] }}
                style={{ display: "inline-flex" }}
              >
                <HistoryIcon className="size-7 text-primary" />
              </motion.span>
              Scan History
            </motion.h1>
            <motion.p
              className="text-sm text-muted-foreground mt-1"
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.18 }}
            >
              Live log of all applied optimization actions.
            </motion.p>
          </div>

          <motion.div
            className="flex items-center gap-2 shrink-0"
            initial={prefersReducedMotion ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <Button
              variant="outline"
              onClick={resetData}
              disabled={history.length === 0}
              className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 disabled:opacity-40"
              data-testid="button-clear-history"
            >
              <Trash2 className="size-4" />
              Clear History
            </Button>
            <Button
              onClick={handleExport}
              disabled={history.length === 0}
              className="gap-2 disabled:opacity-40"
              data-testid="button-export-history"
            >
              <FileJson className="size-4" />
              Export JSON
            </Button>
          </motion.div>
        </div>

        {/* ── Stats row ──────────────────────────────────────────────────── */}
        {history.length > 0 && (
          <MotionDiv className="flex items-center gap-3 flex-wrap" {...listProps}>
            {[
              {
                Icon: CheckCircle2,
                label: `${history.length} action${history.length !== 1 ? "s" : ""}`,
                cls: "text-primary border-primary/25 bg-primary/10",
              },
              {
                Icon: Clock,
                label: `Last: ${format(new Date(history[0].timestamp), "MMM d, HH:mm")}`,
                cls: "text-muted-foreground border-white/10 bg-white/5",
              },
            ].map(chip => (
              <MotionDiv key={chip.label} {...itemProps}>
                <Badge variant="outline" className={cn("gap-1.5 py-1 px-2.5 text-xs font-medium", chip.cls)}>
                  <chip.Icon className="size-3" />
                  {chip.label}
                </Badge>
              </MotionDiv>
            ))}
          </MotionDiv>
        )}

        {/* ── Main card ──────────────────────────────────────────────────── */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <GlassCard className="overflow-hidden" data-testid="card-history">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-white/[0.06]">
              <Zap className="size-4 text-primary" />
              <h3 className="font-semibold text-sm">Recent Activity</h3>
              {history.length > 0 && (
                <Badge variant="outline" className="ml-auto text-xs text-muted-foreground">
                  {history.length}
                </Badge>
              )}
            </div>

            <ScrollArea className="h-[540px]">
              {history.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                  <div className="size-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Inbox className="size-7 text-primary opacity-50" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">No actions recorded yet</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                      Apply tweaks, run scans, or use any optimization feature to see activity here.
                    </p>
                  </div>
                </div>
              ) : (
                <MotionDiv className="divide-y divide-white/[0.05]" {...listProps}>
                  <AnimatePresence initial={false}>
                    {history.map((item, i) => {
                      const badge = PAGE_BADGES[item.page] ?? {
                        label: item.page,
                        cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
                      };
                      return (
                        <MotionDiv
                          key={item.id}
                          {...itemProps}
                          layout
                          exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                          className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.03] transition-colors group"
                          data-testid={`row-history-${i}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                              <Zap className="size-3.5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm text-white truncate" data-testid={`text-action-${i}`}>
                                  {item.action}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={cn("text-[10px] px-1.5 py-0 shrink-0 border", badge.cls)}
                                  data-testid={`badge-page-${i}`}
                                >
                                  {badge.label}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Result:{" "}
                                <span className="text-emerald-400 font-medium" data-testid={`text-result-${i}`}>
                                  {item.result}
                                </span>
                                {item.notes && (
                                  <span className="ml-1.5 opacity-60">· {item.notes}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-right pl-4">
                            <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground" data-testid={`text-timestamp-${i}`}>
                              <Clock className="size-3 opacity-50" />
                              {format(new Date(item.timestamp), "MMM d, HH:mm:ss")}
                            </div>
                          </div>
                        </MotionDiv>
                      );
                    })}
                  </AnimatePresence>
                </MotionDiv>
              )}
            </ScrollArea>
          </GlassCard>
        </motion.div>

      </MotionDiv>
    </AppLayout>
  );
}
