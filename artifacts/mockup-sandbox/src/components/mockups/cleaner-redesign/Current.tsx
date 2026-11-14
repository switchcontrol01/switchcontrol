import { useState } from "react";
import { Trash2, Shield, Zap, History, Play, HardDrive, ChevronDown } from "lucide-react";
import "./_group.css";

/**
 * Extracted from SystemCleaner.tsx, idle JSX (header and idle branch).
 * AppLayout/auth/API/history are stub boundaries. No native side effects.
 * Empty-history fixture avoids presenting scan totals as measured evidence.
 */
export function Current() {
  const [mode, setMode] = useState<"safe" | "advanced">("safe");
  return (
    <main className="cleaner-current space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/30 to-purple-900/30 border border-purple-500/20 flex items-center justify-center"><Trash2 className="w-4.5 h-4.5 text-purple-400" /></div>
          <div><h1 className="text-[17px] font-black text-[#E6EAF0]">System Cleaner</h1><p className="text-[11px] text-[#6B7380]">Real scan-based cleaning — every size from actual filesystem data</p></div>
        </div>
        <div className="flex items-center gap-2">
          {(["safe", "advanced"] as const).map(m => <button key={m} onClick={() => setMode(m)} className={`flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-semibold border transition-all ${mode === m ? m === "safe" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-orange-500/15 text-orange-400 border-orange-500/30" : "border-white/[0.08] text-[#6B7380]"}`}>{m === "safe" ? <Shield className="w-3 h-3" /> : <Zap className="w-3 h-3" />}{m === "safe" ? "Safe" : "Advanced"}</button>)}
          <button className="flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] text-[#6B7380] border border-white/[0.08]" title="No history in this isolated preview"><History className="w-3 h-3" />History</button>
        </div>
      </div>
      <p className="text-xs text-amber-300">Current source extraction · design preview only · no real scan attached</p>
      <div className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden p-8">
        <div className="relative flex items-center gap-8 flex-wrap">
          <div className="shrink-0 w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-purple-900 flex items-center justify-center shadow-[0_0_30px_#7c3aed33]"><Trash2 className="size-7 text-white" /></div>
          <div className="flex-[1_1_300px] min-w-[240px]">
            <p className="text-[11px] font-semibold text-purple-400/80 uppercase tracking-widest mb-2">System Analysis</p>
            <h2 className="text-[28px] font-black text-white leading-tight">Ready to scan your system for junk</h2>
            <p className="text-[12px] text-[#6B7380] mt-2 mb-6 leading-relaxed max-w-sm">Scans temp files, caches, crash dumps, privacy residue, and performance waste. Every byte shown is real — from your actual filesystem.</p>
            <button disabled className="flex items-center gap-2 h-10 px-6 rounded-xl font-bold text-[13px] text-white bg-gradient-to-br from-[#7c3aed] to-[#6d28d9]"><Play className="w-4 h-4" />Analyze System</button>
          </div>
          <div className="min-w-[160px] rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3"><p className="text-[10px] text-[#6B7380] uppercase tracking-wide mb-1">First scan</p><p className="text-[12px] text-[#4a5460] leading-relaxed">No history yet — run a scan to see results.</p></div>
        </div>
      </div>
      <details className="rounded-xl border border-white/[0.08] p-5"><summary className="flex items-center gap-3 cursor-pointer"><HardDrive className="size-5 text-purple-400" /><span><strong className="text-sm">Drive Health &amp; Optimization</strong><span className="block text-[11px] text-[#6B7380]">No drives detected</span></span><ChevronDown className="ml-auto size-4" /></summary><p className="text-sm text-[#A0A8B3] pt-4">Native Windows drive inventory is unavailable in this isolated preview.</p></details>
    </main>
  );
}
