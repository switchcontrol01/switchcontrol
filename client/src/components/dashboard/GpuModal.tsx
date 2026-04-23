/**
 * GpuModal — GPU Details modal
 *
 * Section 1 — GPU Identity: static fields from systeminformation.graphics()
 *   (fetched once via /api/system-intelligence/profile, cached by the store)
 * Section 2 — Live Telemetry: live fields from the existing WebSocket telemetry
 *   pipeline (no extra polling — reads from useTelemetryStore directly)
 * Section 3 — Availability note
 *
 * Hard rule: every value displayed here comes from a real backend source.
 * No fake metrics, no hardcoded placeholders, no guessed values.
 * Fields not available from the backend are simply omitted.
 *
 * GPU resolution — both sections must reference the same physical GPU:
 *   1. Exact model-name match against telemetry.gpu.name
 *   2. Fuzzy name match (one name contains the other)
 *   3. Prefer discrete GPU (NVIDIA / AMD / Radeon)
 *   4. Controller with the most VRAM
 *   5. controllers[0]
 */

import { useEffect, useRef, useState } from "react";
import { GlassModalLayout, HwBadge } from "@/components/ui/GlassModalLayout";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTelemetryStore } from "@/stores/telemetryStore";
import { useSystemIntelligenceStore, type SipController } from "@/stores/systemIntelligenceStore";
import { Info } from "lucide-react";

interface GpuModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SPARKLINE_MAX = 60;
const IS_DEV = import.meta.env.DEV;

// ── GPU resolution ────────────────────────────────────────────────────────────

type MatchType = "exact" | "fuzzy" | "discrete_pref" | "vram_fallback" | "first" | "none";

interface ResolvedGpu {
  ctrl: SipController | null;
  matchType: MatchType;
}

const DISCRETE_SIG = ["nvidia", "amd", "radeon", "geforce", "rx ", "rtx ", "gtx "];

function normalizeModel(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Resolves which static SipController corresponds to the currently active
 * GPU reported by the telemetry stream. Tries name matching first, then falls
 * back to discrete-GPU preference, then VRAM, then first controller.
 */
function resolveGpu(
  controllers: SipController[],
  telemetryName: string | null,
): ResolvedGpu {
  if (!controllers.length) return { ctrl: null, matchType: "none" };
  if (controllers.length === 1) return { ctrl: controllers[0], matchType: "first" };

  const telNorm = normalizeModel(telemetryName);

  // 1. Exact name match
  if (telNorm) {
    const exact = controllers.find(c => normalizeModel(c.name) === telNorm);
    if (exact) return { ctrl: exact, matchType: "exact" };
  }

  // 2. Fuzzy name match — one name fully contains the other
  if (telNorm) {
    const fuzzy = controllers.find(c => {
      const cn = normalizeModel(c.name);
      return cn.length > 0 && (cn.includes(telNorm) || telNorm.includes(cn));
    });
    if (fuzzy) return { ctrl: fuzzy, matchType: "fuzzy" };
  }

  // 3. Prefer discrete GPU (NVIDIA / AMD / Radeon)
  const discrete = controllers.find(c => {
    const sig = `${c.vendor ?? ""} ${c.name ?? ""}`.toLowerCase();
    return DISCRETE_SIG.some(d => sig.includes(d));
  });
  if (discrete) return { ctrl: discrete, matchType: "discrete_pref" };

  // 4. Highest VRAM
  const sorted = [...controllers].sort((a, b) => (b.vramMb ?? 0) - (a.vramMb ?? 0));
  if ((sorted[0].vramMb ?? 0) > 0) return { ctrl: sorted[0], matchType: "vram_fallback" };

  // 5. First controller
  return { ctrl: controllers[0], matchType: "first" };
}

// ── UI primitives ─────────────────────────────────────────────────────────────

function GpuIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M2 10h2" /><path d="M2 14h2" /><path d="M20 10h2" /><path d="M20 14h2" />
      <path d="M9 6V4" /><path d="M15 6V4" /><path d="M9 18v2" /><path d="M15 18v2" />
    </svg>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">{children}</span>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[11px] text-white/35 uppercase tracking-wider font-medium">{label}</span>
      <span className={cn("text-[12px] text-white/80", mono && "font-mono")}>{value}</span>
    </div>
  );
}

function MiniSparkline({ samples, color }: { samples: number[]; color: string }) {
  if (samples.length < 2) return null;
  const h = 32;
  const w = 160;
  const step = w / (SPARKLINE_MAX - 1);
  const padded = samples.length < SPARKLINE_MAX
    ? [...Array(SPARKLINE_MAX - samples.length).fill(0), ...samples]
    : samples;
  const max = Math.max(...padded, 1);
  const points = padded.map((v, i) => `${i * step},${h - (v / max) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8 mt-1 opacity-80" preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={points} />
    </svg>
  );
}

function LiveBar({ pct, color, criticalColor, critical }: { pct: number; color: string; criticalColor?: string; critical?: boolean }) {
  const safePct = Number.isFinite(pct) ? Math.min(Math.max(pct, 0), 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-1">
      <motion.div
        className={cn("h-full rounded-full", critical && criticalColor ? criticalColor : color)}
        initial={{ width: 0 }}
        animate={{ width: `${safePct}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
    </div>
  );
}

// Format VRAM — show in MB if < 1024, else GB
function fmtVram(mb: number | null): string {
  if (mb === null || mb === undefined || !Number.isFinite(mb)) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function fmtNum(v: number | null | undefined, unit: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${Math.round(v)}${unit}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GpuModal({ open, onOpenChange }: GpuModalProps) {
  // ── Sources of truth ────────────────────────────────────────────────────────
  const { profile, fetch: fetchProfile, loading: profileLoading } = useSystemIntelligenceStore();
  const { telemetry } = useTelemetryStore();

  // Sparkline history — accumulate GPU load samples while modal is open
  const [loadHistory, setLoadHistory] = useState<number[]>([]);
  const prevLoadRef = useRef<number | null>(null);

  // Ensure the system profile has been loaded.
  // Also trigger an on-demand GPU perf counter refresh so the load reading is
  // fresh when the modal opens (GPU counter is no longer polled continuously).
  useEffect(() => {
    if (!open) {
      setLoadHistory([]);
      prevLoadRef.current = null;
      return;
    }
    fetchProfile();
    // Fire-and-forget — result flows back via gpuPollCache → getLive → telemetry stream
    (window as any).electronAPI?.telemetry?.refreshGpuLoad?.().catch?.(() => {});
  }, [open, fetchProfile]);

  // Accumulate GPU load into sparkline while modal is open
  useEffect(() => {
    if (!open) return;
    const liveLoad = telemetry?.gpu?.load;
    if (liveLoad !== null && liveLoad !== undefined && Number.isFinite(liveLoad)) {
      if (liveLoad !== prevLoadRef.current) {
        prevLoadRef.current = liveLoad;
        setLoadHistory(prev => {
          const next = [...prev, liveLoad];
          return next.length > SPARKLINE_MAX ? next.slice(-SPARKLINE_MAX) : next;
        });
      }
    }
  }, [open, telemetry?.gpu?.load]);

  // ── GPU resolution ───────────────────────────────────────────────────────────
  const controllers = profile?.gpu.controllers ?? [];
  const telGpu = telemetry?.gpu ?? null;

  const { ctrl, matchType } = resolveGpu(controllers, telGpu?.name ?? null);

  // Dev-mode logging so mismatches are immediately visible during development
  useEffect(() => {
    if (!IS_DEV || !open) return;
    console.group("[GpuModal] GPU resolution");
    console.log("Controllers (%d):", controllers.length, controllers.map(c => c.name));
    console.log("Telemetry GPU name:", telGpu?.name ?? "(none)");
    console.log("Selected controller:", ctrl?.name ?? "(none)");
    console.log("Match type:", matchType);
    console.groupEnd();
  }, [open, controllers.length, telGpu?.name, ctrl?.name, matchType]);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const gpu = telGpu;

  const loadPct = gpu?.load != null && Number.isFinite(gpu.load) ? Math.round(gpu.load) : null;
  const vramUsed = gpu?.vramUsedMb ?? null;
  const vramTotal = gpu?.vramTotalMb ?? ctrl?.vramMb ?? null;
  const vramPct = gpu?.vramPercent ?? (
    vramUsed != null && vramTotal != null && vramTotal > 0
      ? (vramUsed / vramTotal) * 100
      : null
  );
  const isVramCritical = vramPct != null && Number.isFinite(vramPct) && vramPct > 90;
  const gpuName = ctrl?.name ?? gpu?.name ?? null;

  // Whether the controller uses shared/dynamic memory (iGPU or eGPU with shared RAM)
  const isSharedMemory = ctrl?.vramDynamic === true;

  // ── Modal state detection ────────────────────────────────────────────────────
  const hasStatic = ctrl !== null;
  const hasLiveTelemetry = loadPct !== null || vramUsed !== null || gpu?.tempC != null || gpu?.clockMhz != null;
  const hasNoGpuAtAll = !hasStatic && !hasLiveTelemetry && !profileLoading;

  return (
    <GlassModalLayout
      open={open}
      onOpenChange={onOpenChange}
      title={
        <>
          <HwBadge color="cyan"><GpuIcon className="size-3.5 text-cyan-300" /></HwBadge>
          GPU Details
          {isVramCritical && (
            <span className="text-[9px] ml-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 font-medium">
              VRAM Critical
            </span>
          )}
        </>
      }
      description={
        gpuName ?? (profileLoading ? "Loading…" : "No GPU detected")
      }
      testId="modal-gpu"
    >
      <AnimatePresence mode="wait">
        {profileLoading && !profile ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="py-10 flex flex-col items-center justify-center gap-2"
          >
            <GpuIcon className="size-8 text-muted-foreground/50 animate-pulse" />
            <div className="text-sm text-muted-foreground">Loading GPU info…</div>
          </motion.div>

        ) : hasNoGpuAtAll ? (
          <motion.div
            key="no-gpu"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="py-10 flex flex-col items-center justify-center gap-2 text-center"
          >
            <GpuIcon className="size-8 text-white/20" />
            <p className="text-[13px] text-white/40">No GPU data available</p>
            <p className="text-[11px] text-white/25 max-w-xs">
              No GPU controllers were detected and no live telemetry is active.
              This is normal on headless servers or virtual machines.
            </p>
          </motion.div>

        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {/* ── Section 1: GPU Identity ─────────────────────────────────── */}
            <div>
              <SectionLabel>GPU Identity</SectionLabel>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-1">
                {hasStatic ? (
                  <>
                    {ctrl!.name      && <InfoRow label="Model"      value={ctrl!.name} />}
                    {ctrl!.vendor    && <InfoRow label="Vendor"     value={ctrl!.vendor} />}
                    {ctrl!.subVendor && <InfoRow label="Sub-vendor" value={ctrl!.subVendor} />}
                    {ctrl!.vendorId  && <InfoRow label="Vendor ID"  value={ctrl!.vendorId.toUpperCase()} mono />}
                    {ctrl!.deviceId  && <InfoRow label="Device ID"  value={ctrl!.deviceId.toUpperCase()} mono />}
                    {ctrl!.bus       && <InfoRow label="Bus"        value={ctrl!.bus} />}
                    {ctrl!.vramMb != null && (
                      <InfoRow
                        label={isSharedMemory ? "Memory" : "VRAM"}
                        value={
                          <>
                            {fmtVram(ctrl!.vramMb)}
                            {isSharedMemory && (
                              <span className="ml-1.5 text-[9px] text-amber-400/70 border border-amber-400/20 bg-amber-400/[0.08] px-1 rounded">Shared / dynamic</span>
                            )}
                          </>
                        }
                      />
                    )}
                    {ctrl!.external === true && (
                      <InfoRow label="Type" value={<span className="text-purple-300/80">External GPU (eGPU)</span>} />
                    )}
                    {/* Multi-GPU notice when more than one controller exists */}
                    {controllers.length > 1 && (
                      <div className="pt-2 pb-1 flex items-center gap-1.5">
                        <Info className="size-3 text-white/20 shrink-0" />
                        <span className="text-[10px] text-white/25">
                          {controllers.length} GPU{controllers.length > 1 ? "s" : ""} detected
                          {matchType !== "first" && matchType !== "none" && ` · showing active GPU (matched by ${matchType.replace("_", " ")})`}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="py-3 text-center text-[12px] text-white/35">
                    Static GPU identity not available
                  </div>
                )}
              </div>
            </div>

            {/* ── Section 2: Live Telemetry ───────────────────────────────── */}
            <div>
              <SectionLabel>Live Telemetry</SectionLabel>

              {hasLiveTelemetry ? (
                <div className="space-y-2.5">
                  {/* GPU Load */}
                  {loadPct !== null && (
                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-white/40 uppercase tracking-wider">GPU Load</span>
                        <span className="text-lg font-bold tabular-nums text-cyan-400" data-testid="text-gpu-load-pct">{loadPct}%</span>
                      </div>
                      <LiveBar pct={loadPct} color="bg-gradient-to-r from-cyan-500 to-teal-400" />
                      <MiniSparkline samples={loadHistory} color="#22d3ee" />
                    </div>
                  )}

                  {/* VRAM / Shared Memory */}
                  {(vramUsed !== null || vramTotal !== null) && (
                    <div className={cn(
                      "rounded-xl border px-4 py-3",
                      isVramCritical
                        ? "border-red-500/30 bg-red-500/[0.04]"
                        : "border-cyan-500/20 bg-cyan-500/[0.025]"
                    )}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-white/40 uppercase tracking-wider">
                          {isSharedMemory ? "Shared Memory" : "VRAM Usage"}
                        </span>
                        <span className={cn("text-sm font-bold tabular-nums", isVramCritical ? "text-red-400" : "text-white/80")}>
                          {vramUsed !== null ? fmtVram(vramUsed) : "—"}
                          {vramTotal !== null ? ` / ${fmtVram(vramTotal)}` : ""}
                        </span>
                      </div>
                      {vramPct !== null && Number.isFinite(vramPct) && (
                        <LiveBar
                          pct={vramPct}
                          color="bg-gradient-to-r from-cyan-500 to-teal-400"
                          criticalColor="bg-gradient-to-r from-red-500 to-orange-400"
                          critical={isVramCritical}
                        />
                      )}
                      {isSharedMemory && (
                        <p className="text-[10px] text-amber-400/50 mt-1.5">Shared / dynamic memory — allocated from system RAM.</p>
                      )}
                      {isVramCritical && !isSharedMemory && (
                        <p className="text-[10px] text-red-400/70 mt-1.5">VRAM pressure is critically high. Close unused applications.</p>
                      )}
                    </div>
                  )}

                  {/* Temperature + Clock — inline tiles */}
                  {(gpu?.tempC != null || gpu?.clockMhz != null) && (
                    <div className="grid grid-cols-2 gap-2">
                      {gpu?.tempC != null && Number.isFinite(gpu.tempC) && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                          className="p-3 rounded-lg bg-white/[0.06] border border-white/[0.10] text-center"
                        >
                          <div className="text-base font-bold tabular-nums text-orange-300">{fmtNum(gpu.tempC, "°C")}</div>
                          <div className="text-[9px] text-muted-foreground mt-0.5">Temperature</div>
                        </motion.div>
                      )}
                      {gpu?.clockMhz != null && Number.isFinite(gpu.clockMhz) && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.14 }}
                          className="p-3 rounded-lg bg-white/[0.06] border border-white/[0.10] text-center"
                        >
                          <div className="text-base font-bold tabular-nums text-violet-300">{fmtNum(gpu.clockMhz, " MHz")}</div>
                          <div className="text-[9px] text-muted-foreground mt-0.5">Core Clock</div>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-4 text-center space-y-1">
                  <p className="text-[12px] text-white/40">Live metrics unavailable</p>
                  <p className="text-[11px] text-white/25">
                    GPU load, VRAM usage, temperature, and clock speed require driver-level telemetry support.
                  </p>
                </div>
              )}
            </div>

            {/* ── Section 3: Availability note ────────────────────────────── */}
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05]">
              <Info className="size-3 text-white/25 mt-0.5 shrink-0" />
              <p className="text-[10px] text-white/30 leading-relaxed">
                Static identity is read once from the OS via <span className="font-mono">systeminformation.graphics()</span>.
                Live metrics (load, VRAM, temperature, clock) are streamed from the telemetry pipeline and depend on driver support.
                Fan speed, power draw, and driver version are not collected and are not shown.
                {isSharedMemory && " Memory values reflect dynamic allocation from system RAM."}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassModalLayout>
  );
}
