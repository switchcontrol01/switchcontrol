import { useState } from "react";
import { Crown, ShieldCheck, RefreshCw, Cloud, ArrowLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence, useTranslation } from "./_motion";
import { MotherboardMap } from "./_MotherboardMap";
import { HealthRadial } from "./_HealthRadial";
import { GlassCard } from "./_GlassCard";
import { previewComponents, previewScore, getHealthMeta, type ComponentKind, type DriverComponent } from "./_data";
import "./_group.css";
const SKELETON_KINDS: DriverComponent[] = [];
const SCAN_STEPS: {label:string}[] = [];
function SkeletonCard() { return null; }
export function Current() {
 const { t } = useTranslation();
 const [selected, setSelected] = useState<ComponentKind | null>(null);
 const displayComponents = previewComponents, displayScore = previewScore;
 const dataReady = true, scanning = false, stepIndex = 0, prefersReducedMotion = false;
 const actionable = displayComponents.filter(c => c.health === "outdated" || c.health === "critical").length;
 const unverified = displayComponents.filter(c => c.health === "unknown").length;
 const detail = previewComponents.find(c => c.kind === selected);
 return <div className="driver-preview p-8">
  <div className="max-w-6xl mx-auto relative">
   <div className="flex items-center justify-between mb-7">
    <div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-[#00D4FF]/10 border border-[#00D4FF]/25"><ShieldCheck className="size-6 text-[#33E0FF]" /></div><div><h1 className="text-lg font-bold text-[#E6EAF0] flex items-center gap-2">Driver Intelligence <span className="inline-flex items-center gap-1 rounded-full bg-[#00D4FF]/15 text-[#33E0FF] border border-[#00D4FF]/30 text-[10px] px-2 py-0.5"><Crown className="size-3" /> Premium</span></h1><p className="text-[11px] text-muted-foreground">System-health intelligence — detect, compare, and update safely</p></div></div>
    <div className="flex items-center gap-3"><span className="flex items-center gap-2 text-[11px] text-muted-foreground"><Cloud className="size-3.5 text-[#33E0FF]" /> Scanned 3 min ago</span><button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs border border-border"><RefreshCw className="size-3.5" /> Rescan</button><button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs border border-border"><ArrowLeft className="size-3.5" /> Dashboard</button></div>
   </div>
   {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          {/* Left: motherboard centerpiece */}
          <GlassCard className="relative p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-[#E6EAF0]">{t("System Map")}</h2>
              {dataReady && (
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={
                    actionable > 0
                      ? { background: "rgba(251,191,36,0.15)", color: "#fbbf24" }
                      : unverified > 0
                        ? { background: "rgba(148,163,184,0.15)", color: "#94a3b8" }
                        : { background: "rgba(52,211,153,0.15)", color: "#34d399" }
                  }
                  data-testid="text-actionable-count"
                >
                  {actionable > 0
                    ? `${actionable} ${t(actionable === 1 ? "item needs attention" : "items need attention")}`
                    : unverified > 0
                      ? `${unverified} ${t(unverified === 1 ? "component not verified" : "components not verified")}`
                      : t("All systems healthy")}
                </span>
              )}
            </div>

            <MotherboardMap
              components={displayComponents}
              scanning={scanning}
              activeKind={selected}
              onSelect={(k) => setSelected(k)}
            />

            {/* Scan step overlay */}
            <AnimatePresence>
              {scanning && (
                <motion.div
                  className="absolute inset-x-0 bottom-0 p-5"
                  initial={{ opacity: 0, filter: "blur(6px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: "blur(6px)" }}
                >
                  <div className="rounded-xl border border-[#00D4FF]/20 bg-black/40 backdrop-blur-sm p-3">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-[#33E0FF] font-medium" data-testid="text-scan-step">
                         {t(SCAN_STEPS[stepIndex]?.label ?? "Scanning…")}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {stepIndex + 1}/{SCAN_STEPS.length}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-[#00D4FF] to-[#3b82f6]"
                        animate={{ width: `${((stepIndex + 1) / SCAN_STEPS.length) * 100}%` }}
                        transition={{ ease: "easeOut", duration: 0.35 }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>

          {/* Right: health radial */}
          <GlassCard className="p-6 flex flex-col">
            <h2 className="text-sm font-semibold text-[#E6EAF0] mb-4">{t("Health Score")}</h2>
            {displayScore ? (
              <HealthRadial score={displayScore} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground py-10">
                 {scanning ? t("Calculating…") : t("Run a scan to see your score")}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Component cards grid */}
        <div className="mt-6">
           <h2 className="text-sm font-semibold text-[#E6EAF0] mb-3">{t("Components")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {(dataReady ? displayComponents : SKELETON_KINDS).map((c, i) =>
              "kind" in c && "device" in c ? (
                <ComponentCard
                  key={c.kind}
                  component={c as DriverComponent}
                  index={i}
                  reduced={prefersReducedMotion}
                  onClick={() => setSelected((c as DriverComponent).kind)}
                />
              ) : (
                <SkeletonCard key={i} />
              ),
            )}
          </div>
        </div>

        
   <p className="mt-5 text-[10px] text-muted-foreground">Design preview · illustrative hardware data · no driver changes are performed</p>
  </div>
  {detail && <div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onClick={() => setSelected(null)}><aside className="w-[380px] bg-[#111821] border-l border-cyan-300/20 p-7" onClick={e => e.stopPropagation()}><button onClick={() => setSelected(null)} className="text-xs text-cyan-300 mb-8">Close details ×</button><p className="text-xs uppercase tracking-wider text-slate-500">{detail.title}</p><h2 className="text-xl mt-3 font-semibold">{detail.device}</h2><p className="text-sm mt-6 leading-6 text-slate-400">{detail.rationale}</p><div className="mt-8 text-sm border-t border-white/10 pt-5"><p>Installed: {detail.current ?? "Not verified"}</p><p className="mt-3">Reference: {detail.latest ?? "Windows managed"}</p></div></aside></div>}
 </div>;
}
function ComponentCard({
  component: c,
  index,
  reduced,
  onClick,
}: {
  component: DriverComponent;
  index: number;
  reduced: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const meta = getHealthMeta(c.health);
  return (
    <motion.button
      onClick={onClick}
      className="group text-left rounded-xl border bg-white/[0.02] p-4 cursor-pointer transition-all hover:bg-white/[0.07]"
      style={{ borderColor: `${meta.color}44` }}
      initial={reduced ? false : { opacity: 0, filter: "blur(6px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.5 }}
      whileHover={reduced ? undefined : { boxShadow: `0 4px 20px ${meta.glow}` }}
      whileTap={{ scale: 0.98 }}
      data-testid={`card-component-${c.kind}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{t(c.title)}</span>
        <span
          className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border"
          style={{ background: `${meta.color}22`, color: meta.color, borderColor: `${meta.color}44` }}
        >
          <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
          {t(meta.label)}
        </span>
      </div>
      <div className="text-sm font-medium text-[#E6EAF0] truncate mb-1" title={c.device}>
        {c.device}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {c.latest ? `${t("Latest")}: ${c.latest}` : c.current ? t("Detected") : t("No data")}
        </span>
        <span
          className="inline-flex items-center gap-0.5 font-medium opacity-40 group-hover:opacity-100 transition-opacity"
          style={{ color: meta.color }}
        >
          {t("Details")} <ChevronRight className="size-3" />
        </span>
      </div>
    </motion.button>
  );
}
