/**
 * HistoryTimeline — a user-scoped log of recorded driver / firmware changes.
 *
 * Each entry is a "restore point": metadata (previous version, date, vendor
 * package) that helps the user roll back to an earlier driver from the vendor.
 * We NEVER store driver binaries and NEVER auto-install — the actual restore is
 * a desktop-only, user-driven action that opens the right vendor tool/page.
 */

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "@/lib/motion";
import {
  History,
  RotateCcw,
  Trash2,
  ExternalLink,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useMotion } from "@/lib/motion";
import type { DriverHistoryItem } from "@/lib/driver-intel-data";

interface HistoryTimelineProps {
  /** Bumped by the parent to force a refresh after a new entry is recorded. */
  refreshKey?: number;
  /** True for trial users — restore is read-only (timeline still visible). */
  readOnly?: boolean;
  /** Open the vendor page/tool for a restore (parent owns launch/redirect). */
  onRestore?: (item: DriverHistoryItem) => void;
}

function fmtDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function HistoryTimeline({
  refreshKey = 0,
  readOnly = false,
  onRestore,
}: HistoryTimelineProps) {
  const { prefersReducedMotion } = useMotion();
  const [items, setItems] = useState<DriverHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const { cloudApiGet } = await import("@/lib/cloud-api");
      const res = await cloudApiGet<{ items: DriverHistoryItem[] }>(
        "/driver-intel/history",
        { signal },
      );
      setItems(res.items ?? []);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setError("Couldn't load your history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, refreshKey]);

  const remove = useCallback(async (id: string) => {
    // Optimistic removal — restore on failure.
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== id));
    try {
      const { cloudApiDelete } = await import("@/lib/cloud-api");
      await cloudApiDelete(`/driver-intel/history/${id}`);
    } catch {
      setItems(prev);
    }
  }, [items]);

  return (
    <div className="mt-7" data-testid="history-timeline">
      <div className="flex items-center gap-2 mb-3">
        <History className="size-4 text-[#33E0FF]" />
        <h2 className="text-sm font-semibold text-[#E6EAF0]">Update History</h2>
        <span className="text-[10px] text-muted-foreground">
          Restore points are saved as version metadata — never driver files.
        </span>
      </div>

      {loading ? (
        <GlassCard className="p-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading history…
        </GlassCard>
      ) : error ? (
        <GlassCard className="p-6 text-center" data-testid="history-error">
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            onClick={() => load()}
            className="mt-2 text-xs text-[#33E0FF] hover:underline"
            data-testid="button-history-retry"
          >
            Try again
          </button>
        </GlassCard>
      ) : items.length === 0 ? (
        <GlassCard className="p-6 text-center" data-testid="history-empty">
          <p className="text-sm text-[#E6EAF0]">No updates logged yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            When you update a driver, log it here to build a timeline and keep a
            restore point for rolling back.
          </p>
        </GlassCard>
      ) : (
        <div className="relative pl-5">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/10" />
          <AnimatePresence initial={false}>
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                layout={!prefersReducedMotion}
                initial={prefersReducedMotion ? false : { opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, delay: prefersReducedMotion ? 0 : i * 0.04 }}
                className="relative mb-3"
                data-testid={`history-item-${item.id}`}
              >
                {/* Node dot */}
                <span
                  className="absolute -left-[18px] top-3 size-2.5 rounded-full border-2 border-[#0a0e14]"
                  style={{
                    background: item.action === "restore" ? "#fbbf24" : "#33E0FF",
                  }}
                />
                <GlassCard className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-[#E6EAF0]">
                          {item.componentLabel || item.component}
                        </span>
                        {item.vendor && (
                          <span className="text-[10px] text-muted-foreground">
                            {item.vendor}
                          </span>
                        )}
                        {item.action === "restore" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-300">
                            restore
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                        {item.fromVersion && (
                          <>
                            <span className="font-mono">{item.fromVersion}</span>
                            <ArrowRight className="size-3" />
                          </>
                        )}
                        <span className="font-mono text-[#E6EAF0]">
                          {item.toVersion}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {fmtDate(item.createdAt)}
                        {item.packageName ? ` · ${item.packageName}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.rollbackAvailable && onRestore && (
                        <button
                          onClick={() => onRestore(item)}
                          disabled={readOnly}
                          title={
                            readOnly
                              ? "Upgrade to use restore points"
                              : "Open the vendor page to roll back"
                          }
                          data-testid={`button-restore-${item.id}`}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] border border-white/12 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40"
                        >
                          <RotateCcw className="size-3" />
                          Restore
                          <ExternalLink className="size-2.5 opacity-60" />
                        </button>
                      )}
                      <button
                        onClick={() => remove(item.id)}
                        title="Remove this entry"
                        data-testid={`button-delete-history-${item.id}`}
                        className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-red-300 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
