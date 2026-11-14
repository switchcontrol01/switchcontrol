import "./_group.css";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity, AlertCircle, AlertTriangle, BarChart2, CheckCircle2, Clock, Cpu,
  Info, Lock, Play, RefreshCw, Scan, Server, Shield, ShieldAlert, ShieldOff,
  List, MonitorPlay, Zap, X,
} from "lucide-react";

type Tab = "overview" | "protection" | "startup" | "processes" | "audit";
type ScanKind = "smart" | "quick";
type ScanStatus = "idle" | "scanning" | "complete";
const tabs: { id: Tab; label: string; Icon: typeof Shield }[] = [
  { id: "overview", label: "Overview", Icon: BarChart2 },
  { id: "protection", label: "Protection", Icon: Shield },
  { id: "startup", label: "Startup", Icon: MonitorPlay },
  { id: "processes", label: "Processes", Icon: Cpu },
  { id: "audit", label: "Audit", Icon: Server },
];
const stages = ["Checking protection status", "Fetching extended Defender data", "Inspecting startup entries", "Evaluating running processes", "Building recommendations"];
const sidebarLinks: { label: string; Icon: typeof Activity }[] = [
  { label: "Dashboard", Icon: Activity }, { label: "Tweaks", Icon: Zap },
  { label: "Network Tweaks", Icon: Activity }, { label: "Power Plan", Icon: Zap },
  { label: "Cleaner", Icon: X }, { label: "Debloat", Icon: Shield },
  { label: "Startup", Icon: List }, { label: "AI Advisor", Icon: Info },
  { label: "BIOS Advisor", Icon: Cpu }, { label: "Security", Icon: Shield },
  { label: "Driver Intel", Icon: Scan }, { label: "Latency Analyzer", Icon: Activity },
  { label: "Settings", Icon: Lock },
];

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-[#2A313A] bg-[#21262D] ${className}`}>{children}</section>;
}
function Button({ children, onClick, secondary = false, disabled = false, className = "" }: {
  children: ReactNode; onClick?: () => void; secondary?: boolean; disabled?: boolean; className?: string;
}) {
  return <button onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${secondary ? "border border-[#363D46] bg-[#2A313A] text-[#E6EAF0] hover:bg-[#343C46]" : "bg-[#00D4FF] text-[#10171B] hover:bg-[#33E0FF]"} ${className}`}>{children}</button>;
}
function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "unknown" | "warn" | "info" }) {
  const toneClass = tone === "warn" ? "border-amber-500/25 bg-amber-500/10 text-amber-400" : tone === "info" ? "border-blue-500/25 bg-blue-500/10 text-blue-400" : tone === "unknown" ? "border-zinc-500/25 bg-zinc-500/10 text-zinc-400" : "border-[#2A313A] bg-[#21262D] text-[#A0A8B3]";
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${toneClass}`}>{children}</span>;
}
function Heading({ icon: Icon, children, aside }: { icon: typeof Shield; children: ReactNode; aside?: ReactNode }) {
  return <div className="mb-4 flex items-center gap-2"><Icon className="size-4 text-primary" /><h2 className="text-sm font-semibold">{children}</h2>{aside}</div>;
}
function StatusRow({ label }: { label: string }) {
  return <div className="flex items-center justify-between border-b border-white/[0.035] py-2 last:border-0"><span className="text-sm text-muted-foreground">{label}</span><Badge tone="unknown"><span className="size-1.5 rounded-full bg-zinc-500" />Not verified</Badge></div>;
}
function EmptyPanel({ icon: Icon, title, body }: { icon: typeof Shield; title: string; body: string }) {
  return <div className="py-12 text-center text-muted-foreground"><Icon className="mx-auto mb-3 size-9 opacity-25" /><p className="text-sm font-medium">{title}</p><p className="mx-auto mt-1 max-w-md text-xs opacity-70">{body}</p></div>;
}

function Overview({ scanned, kind, history }: { scanned: boolean; kind: ScanKind | null; history: number[] }) {
  const preview = scanned;
  const isQuick = kind === "quick";
  const score = isQuick ? 85 : 87;
  const coverage = isQuick ? 50 : 100;
  return <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
    <div className="flex flex-col gap-4">
      <Card className="p-5" data-testid="card-health-score">
        <Heading icon={Zap}>System Health Score</Heading>
        {preview ? <div>
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-300">
            <Info className="size-4 shrink-0" /><span><strong>Preview data only.</strong> Illustrative sample; no system was scanned and this is not a security verdict.</span>
          </div>
          <div className="flex items-center gap-6 py-2">
            <div className="flex size-24 shrink-0 items-center justify-center rounded-full border-[3px] border-amber-500/40 text-center text-2xl font-semibold text-amber-400">{score}<span className="text-xs text-muted-foreground">/100</span></div>
            <div className="flex-1">
               <p className="text-lg font-bold text-amber-400">{isQuick ? "Quick Scan · partial" : "Needs attention"}</p>
               <p className="text-xs text-muted-foreground">One protection control is off in this illustrative sample. This is not a malware verdict.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { label: "Protection issues", value: "1 preview observation" },
                  { label: "Startup", value: isQuick ? "Not checked" : "2 to review · preview" },
                  { label: "Processes", value: isQuick ? "Not checked" : "1 to review · preview" },
                  { label: "Score", value: `${score}/100 · preview` },
                ].map(item => <div key={item.label} className="rounded-lg bg-[#1A1F26] p-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.label}</p><p className="mt-0.5 text-xs font-semibold">{item.value}</p></div>)}
              </div>
            </div>
          </div>
          {isQuick && <p className="mt-2 text-xs text-amber-400">Quick Scan is protection-only and intentionally partial. Startup and process evidence was not collected.</p>}
        </div> : <div className="flex items-center gap-4 py-4">
          <div className="flex size-24 shrink-0 items-center justify-center rounded-full border-[3px] border-[#2A313A]"><Zap className="size-8 opacity-20" /></div>
          <div><p className="text-sm font-medium text-muted-foreground">No data yet</p><p className="mt-1 text-xs text-muted-foreground">Run a scan to calculate your system health score.</p></div>
        </div>}
      </Card>
      <Card className="p-5" data-testid="card-posture-breakdown">
        <Heading icon={BarChart2}>Security Posture Breakdown</Heading>
        <div className="space-y-3">{[
          ["Protection", preview ? 85 : null, "text-cyan-400"],
          ["Startup hygiene", preview && !isQuick ? 88 : null, "text-cyan-400"],
          ["Sampled process footprint", preview && !isQuick ? 91 : null, "text-cyan-400"],
        ].map(([label, val, color]) => <div key={label as string} className="space-y-1">
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className={color as string}>{val === null ? "Not checked" : `${val} · preview`}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#1A1F26]"><div className={`h-full rounded-full ${color === "text-cyan-400" ? "bg-cyan-400" : color === "text-emerald-400" ? "bg-emerald-400" : "bg-[#00D4FF]"}`} style={{ width: val === null ? 0 : `${val}%` }} /></div>
        </div>)}</div>
        <p className="mt-3 text-[10px] text-muted-foreground">Protection 50% · Startup 30% · Process footprint 20%. {preview ? `Known scan coverage: ${coverage}%. Unknown checks are excluded, not counted as healthy. (Preview data)` : "Run a scan to collect evidence."}</p>
        <p className="mt-2 text-[10px] text-muted-foreground/70">Protection uses observed real-time, firewall, tamper, and antispyware controls (40/35/15/10). Startup deducts review-item weight; process footprint uses sampled memory and impact. This is a scan-based heuristic, not a malware verdict or performance benchmark.</p>
      </Card>
      <Card className="p-5" data-testid="card-health-trend"><Heading icon={Activity} aside={<span className="ml-auto text-[10px] text-muted-foreground/50">Last {Math.min(history.length, 20)} scans</span>}>Health Score Trend</Heading>
        {history.length < 2 ? <div className="flex h-24 items-center justify-center text-xs text-muted-foreground/50">Not enough history</div> : <div className="flex h-24 items-end gap-2 px-4">{history.map((n, i) => <div key={i} className="flex-1 rounded-t bg-emerald-400/60" style={{ height: `${n}%` }} />)}</div>}
      </Card>
    </div>
    <div className="flex flex-col gap-4">
       <Card className="p-5" data-testid="card-priority-issues"><Heading icon={ShieldAlert}>Priority Issues</Heading>
         {preview ? <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs"><p className="font-medium text-amber-400">Tamper Protection is off · preview</p><p className="mt-1 text-muted-foreground">Illustrative sample only. Review the setting in Windows Security; this is not a malware finding.</p></div> : <div className="py-5 text-center text-xs text-muted-foreground"><ShieldAlert className="mx-auto mb-2 size-7 opacity-30" />Run a scan to detect issues</div>}
      </Card>
      <Card className="p-5" data-testid="card-recent-changes"><Heading icon={Clock}>Recent Changes</Heading><p className="py-4 text-center text-xs text-muted-foreground/60">Run multiple scans to see change detection</p></Card>
      <Card className="p-5"><Heading icon={List}>Scan History</Heading>{history.length ? <div className="space-y-2">{history.map((n, i) => <div key={i} className="flex justify-between border-b border-white/5 py-2 text-xs"><span>Preview scan {history.length - i}</span><Badge tone="unknown">{n}/100 · preview</Badge></div>)}</div> : <p className="py-4 text-center text-xs text-muted-foreground/60">No scan history yet</p>}</Card>
       {preview && <Card className="p-5"><Heading icon={List}>All Recommendations</Heading><div className="space-y-2 text-xs text-muted-foreground"><p>Review Tamper Protection in Windows Security.</p>{!isQuick && <><p>Review two startup entries; no change is made here.</p><p>Confirm one high-memory process locally; memory use is not a trust verdict.</p></>}</div></Card>}
    </div>
  </div>;
}

function Protection({ preview }: { preview: boolean }) {
  return <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
    <Card className="p-5"><div className="mb-4 flex items-center gap-2"><Shield className="size-4 text-primary" /><h2 className="text-sm font-semibold">Defender Core Status</h2></div>{["Real-time Protection", "Firewall", "Anti-spyware", "Tamper Protection"].map(label => <StatusRow key={label} label={label} />)}{preview && <p className="mt-3 border-t border-white/5 pt-3 text-xs text-amber-400">Preview data only. Controls were not read from Windows.</p>}</Card>
    <Card className="p-5"><div className="mb-4 flex items-center gap-2"><Lock className="size-4 text-primary" /><h2 className="text-sm font-semibold">Advanced Protection</h2></div>{["Cloud Protection", "PUA Protection", "Controlled Folder Access", "Sample Submission", "SmartScreen"].map(label => <div key={label} className="flex items-center justify-between border-b border-white/[0.035] py-3 last:border-0"><div><p className="text-xs font-medium">{label}</p><p className="mt-0.5 text-[10px] text-muted-foreground">Protection setting status</p></div><Badge tone="unknown">Unknown</Badge></div>)}<div className="mt-4 rounded-lg border border-[#2A313A] bg-[#1A1F26] p-3 text-xs text-muted-foreground"><Info className="mr-1 inline size-3.5" />Settings are not collected in this preview. No controls are interactive or changed.</div><Button secondary className="mt-4" onClick={() => {}}><Zap className="size-3.5" />Quick Scan</Button></Card>
    <Card className="p-5 xl:col-span-2"><Heading icon={Activity}>Protection Freshness</Heading><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{["Signature Age", "Quick Scan Age", "Full Scan Age"].map(label => <div key={label} className="rounded-xl bg-[#1A1F26] p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold text-zinc-400">Unknown</p><p className="text-xs text-zinc-400">Not collected</p></div>)}</div></Card>
  </div>;
}

function Startup() {
  return <Card className="p-5"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><MonitorPlay className="size-4 text-primary" /><h2 className="text-sm font-semibold">Startup Applications</h2></div><div className="flex gap-1 rounded-lg bg-[#1A1F26] p-1">{["All", "Review", "Disable"].map(item => <button key={item} className="rounded-md px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-[#2A313A]">{item}</button>)}</div></div><EmptyPanel icon={MonitorPlay} title="Available on Windows desktop" body="Run a Smart Scan on a Windows desktop to inspect startup apps. No startup entries have been collected." /></Card>;
}
function Processes() {
  return <Card className="p-5"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><Cpu className="size-4 text-primary" /><h2 className="text-sm font-semibold">Process Trust Analysis</h2></div><div className="flex gap-1 rounded-lg bg-[#1A1F26] p-1">{["all", "suspicious", "review"].map(item => <button key={item} className="rounded-md px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-[#2A313A]">{item}</button>)}</div></div><EmptyPanel icon={ShieldOff} title="Available on Windows desktop" body="Run a Smart Scan to collect sampled process information. No process trust states have been verified." /><div className="border-t border-white/5 pt-3 text-[11px] text-muted-foreground/60"><Info className="mr-1 inline size-3.5" />Trust state uses executable path; signature verification may require Windows Admin privileges.</div></Card>;
}
function Audit() {
  return <div className="space-y-4"><Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><Heading icon={Server}>Advanced Security Audit</Heading><p className="text-xs text-muted-foreground">Firmware, process trust, credential protection, remote access, ports, and persistence risks.</p></div><Button disabled><Scan className="size-4" />Run Audit</Button></div><div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground/60"><Info className="size-3.5" />Audit requires the SwitchControl desktop app running on Windows.</div></Card><EmptyPanel icon={Server} title="Advanced Security Audit" body="Run the audit on a supported Windows desktop to inspect firmware integrity, remote access exposure, and persistence risks. No audit checks have been collected." /><div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{["Platform & Firmware Trust", "Remote & Network Exposure", "Persistence & File Risks"].map(title => <Card key={title} className="p-5"><Heading icon={Lock}>{title}</Heading>{["Secure Boot", "TPM", "Credential Protection"].map(label => <StatusRow key={label} label={label} />)}</Card>)}</div></div>;
}

export function Current() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [scanKind, setScanKind] = useState<ScanKind | null>(null);
  const [scanStage, setScanStage] = useState(0);
  const timer = useRef<number[]>([]);
  const canceled = useRef(false);
  const beginScan = (kind: ScanKind) => {
    timer.current.forEach(window.clearTimeout);
    canceled.current = false;
    setScanKind(kind);
    setScanStatus("scanning");
    setScanStage(0);
    const count = kind === "quick" ? 2 : stages.length;
    for (let i = 1; i <= count; i++) timer.current.push(window.setTimeout(() => {
      if (canceled.current) return;
      setScanStage(i);
      if (i === count) {
        setScanStatus("complete");
      }
    }, i * 850));
  };
  const cancelScan = () => { canceled.current = true; timer.current.forEach(window.clearTimeout); setScanStatus("idle"); setScanStage(0); };
  useEffect(() => () => timer.current.forEach(window.clearTimeout), []);
  const scanning = scanStatus === "scanning";
  return <div className="security-current min-h-screen">
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r border-white/[0.035] bg-[#14181D] px-4 py-6 md:flex">
      <div className="mb-8 flex items-center gap-2 px-2"><span className="flex size-8 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300"><Zap className="size-4" /></span><span className="text-lg font-semibold tracking-tight">SwitchControl</span></div>
      <nav className="flex-1 space-y-1">{sidebarLinks.map(({ label, Icon }) => <div key={label} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${label === "Security" ? "bg-cyan-400/10 text-[#E6EAF0]" : "text-muted-foreground"}`}><Icon className={`size-4 ${label === "Security" ? "text-[#33E0FF]" : ""}`} />{label}</div>)}</nav>
       <div className="border-t border-white/5 px-2 pt-4"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-full bg-[#2A313A] text-xs text-[#A0A8B3]">ST</div><div><p className="text-sm font-medium">SwitchTech</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Premium</p></div></div><p className="mt-3 text-[10px] text-muted-foreground/40">SwitchControl</p></div>
    </aside>
    <main className="min-h-screen px-5 py-7 md:ml-64 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><div className="flex items-center gap-3"><Shield className="size-6 text-primary" /><h1 className="text-2xl font-bold tracking-tight">System Integrity</h1></div><p className="mt-0.5 text-sm text-muted-foreground">Security posture, startup analysis, process trust, and advanced audit.</p></div>
          <div className="hidden items-center gap-2 pt-1 md:flex"><span className="size-2 rounded-full bg-zinc-500" /><span className="text-xs text-muted-foreground">Local preview</span></div>
        </div>
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm"><Info className="mt-0.5 size-4 shrink-0 text-blue-400" /><div><span className="font-medium text-blue-400">Windows Desktop Required for System Data</span><p className="mt-0.5 text-muted-foreground">Defender status, startup apps, process data, and security audit require the SwitchControl desktop app running on Windows. This Current preview does not connect to system APIs.</p></div></div>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {scanning ? <div className="flex min-w-0 flex-1 items-center gap-3"><div className="flex-1 space-y-1"><div className="flex justify-between text-xs text-muted-foreground"><span>{stages[Math.min(scanStage, stages.length - 1)]}</span><span>{Math.round(scanStage / (scanKind === "quick" ? 2 : stages.length) * 100)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#21262D]"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round(scanStage / (scanKind === "quick" ? 2 : stages.length) * 100)}%` }} /></div></div><Button secondary onClick={cancelScan} className="shrink-0 px-3 py-1.5 text-xs"><X className="size-3.5" />Cancel</Button></div> : <>
            <Button onClick={() => beginScan("smart")}><Zap className="size-4" />Smart Scan</Button><Button secondary onClick={() => beginScan("quick")}><Play className="size-3.5" />Quick Scan</Button>
            {scanStatus === "complete" && <div className="ml-auto flex flex-wrap gap-2"><Badge tone="warn"><ShieldAlert className="size-3" />1 protection issue · preview</Badge><Badge tone="unknown"><MonitorPlay className="size-3" />{scanKind === "quick" ? "Startup not checked" : "2 startup issues · preview"}</Badge><Badge tone="unknown"><Cpu className="size-3" />Processes not checked</Badge></div>}
          </>}
        </div>
        {scanStatus === "complete" && <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5 text-xs text-amber-300"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span><strong>Preview data only:</strong> no Windows APIs or network services were called. Values below are illustrative. {scanKind === "quick" && "Quick Scan is partial and did not inspect startup or process evidence."}</span></div>}
        <div className="flex gap-0 overflow-x-auto border-b border-[#2A313A]">
          {tabs.map(({ id, label, Icon }) => <button key={id} onClick={() => setActiveTab(id)} data-testid={`tab-${id}`} className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}><Icon className="size-3.5" />{label}</button>)}
        </div>
         <div className="pt-5">{activeTab === "overview" && <Overview scanned={scanStatus === "complete"} kind={scanKind} history={[]} />}{activeTab === "protection" && <Protection preview={scanStatus === "complete"} />}{activeTab === "startup" && <Startup />}{activeTab === "processes" && <Processes />}{activeTab === "audit" && <Audit />}</div>
      </div>
    </main>
  </div>;
}

export default Current;
