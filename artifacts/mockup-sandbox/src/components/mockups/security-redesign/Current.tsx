import "./_group.css";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity, AlertCircle, AlertTriangle, BarChart2, CheckCircle2, Clock, Copy,
  Cpu, Eye, FolderLock, Globe, Info, Lock, MonitorPlay, Play, RefreshCw,
  Scan, Server, Shield, ShieldAlert, ShieldOff, Zap, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Tab = "overview" | "protection" | "startup" | "processes" | "audit";
type ScanKind = "smart" | "quick";
type ScanStatus = "idle" | "scanning" | "complete";

const SCAN_STAGES = [
  "Checking protection status",
  "Fetching extended Defender data",
  "Inspecting startup entries",
  "Evaluating running processes",
  "Building recommendations",
];
const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", Icon: BarChart2 },
  { id: "protection", label: "Protection", Icon: Shield },
  { id: "startup", label: "Startup", Icon: MonitorPlay },
  { id: "processes", label: "Processes", Icon: Cpu },
  { id: "audit", label: "Audit", Icon: Server },
];

function Card({ children, className = "", ...props }: { children: ReactNode; className?: string; [key: string]: unknown }) {
  return <section {...props} className={`rounded-xl border border-[#2A313A] bg-[#21262D] ${className}`}>{children}</section>;
}

function Button({ children, secondary = false, className = "", ...props }: {
  children: ReactNode;
  secondary?: boolean;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${secondary ? "border border-[#363D46] bg-[#2A313A] text-[#E6EAF0] hover:bg-[#343C46]" : "bg-primary text-primary-foreground hover:brightness-110"} ${className}`}>{children}</button>;
}

function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "unknown" | "warn" | "info" | "critical" | "ok" }) {
  const styles = {
    muted: "border-[#2A313A] bg-[#21262D] text-[#A0A8B3]",
    unknown: "border-zinc-500/25 bg-zinc-500/10 text-zinc-400",
    warn: "border-amber-500/25 bg-amber-500/10 text-amber-400",
    info: "border-blue-500/25 bg-blue-500/10 text-blue-400",
    critical: "border-red-500/25 bg-red-500/10 text-red-400",
    ok: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${styles}`}>{children}</span>;
}

function Heading({ icon: Icon, children, aside }: { icon: LucideIcon; children: ReactNode; aside?: ReactNode }) {
  return <div className="mb-4 flex items-center gap-2"><Icon className="size-4 text-primary" /><h2 className="text-sm font-semibold">{children}</h2>{aside}</div>;
}

function StatusRow({ label, value = "Unknown", state = "unknown" }: { label: string; value?: string; state?: "ok" | "warn" | "off" | "unknown" }) {
  const tone = state === "ok" ? "ok" : state === "warn" ? "warn" : state === "off" ? "critical" : "unknown";
  return <div className="flex items-center justify-between gap-3 border-b border-white/[0.035] py-2 last:border-0">
    <span className="text-sm text-muted-foreground">{label}</span>
    <Badge tone={tone}><span className={`size-1.5 rounded-full ${state === "ok" ? "bg-emerald-400" : state === "warn" ? "bg-amber-400" : state === "off" ? "bg-red-400" : "bg-zinc-500"}`} />{value}</Badge>
  </div>;
}

function Disclosure({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "amber" }) {
  const color = tone === "blue" ? "border-blue-500/20 bg-blue-500/10 text-blue-400" : "border-amber-500/20 bg-amber-500/[0.06] text-amber-300";
  return <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${color}`}><Info className="mt-0.5 size-4 shrink-0" /><span>{children}</span></div>;
}

function EmptyPanel({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return <div className="py-12 text-center text-muted-foreground"><Icon className="mx-auto mb-3 size-9 opacity-25" /><p className="text-sm font-medium">{title}</p><p className="mx-auto mt-1 max-w-md text-xs opacity-70">{body}</p></div>;
}

function PostureBar({ label }: { label: string }) {
  return <div className="space-y-1">
    <div className="flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="text-zinc-400">Not checked</span></div>
    <div className="h-1.5 overflow-hidden rounded-full bg-[#1A1F26]" />
  </div>;
}

function Overview({ scanStatus }: { scanStatus: ScanStatus }) {
  const hasRun = scanStatus === "complete";
  return <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
    <div className="flex flex-col gap-4">
      <Card className="p-5" data-testid="card-health-score">
        <Heading icon={Zap}>System Health Score</Heading>
        {hasRun && <div className="mb-3"><Disclosure tone="amber"><strong>Preview run only.</strong> No Windows data was collected; a health score cannot be calculated.</Disclosure></div>}
        <div className="flex items-center gap-4 py-4">
          <div className="flex size-24 shrink-0 items-center justify-center rounded-full border-[3px] border-[#2A313A]"><Zap className="size-8 opacity-20" /></div>
          <div><p className="text-sm font-medium text-muted-foreground">{hasRun ? "No data available" : "No data yet"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hasRun ? "System checks are unavailable in this local preview." : "Run a scan to calculate your system health score."}</p></div>
        </div>
      </Card>
      <Card className="p-5" data-testid="card-posture-breakdown">
        <Heading icon={BarChart2}>Security Posture Breakdown</Heading>
        <div className="space-y-3">
          <PostureBar label="Protection" />
          <PostureBar label="Startup hygiene" />
          <PostureBar label="Sampled process footprint" />
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground">Protection 50% · Startup 30% · Process footprint 20%. Run a scan to collect evidence. Unknown checks are excluded, not counted as healthy.</p>
        <p className="mt-2 text-[10px] text-muted-foreground/70">Protection uses observed real-time, firewall, tamper, and antispyware controls (40/35/15/10). Startup deducts 3/6/10 per low/medium/high review item (×1.5 for disable). Process footprint deducts 1 per 512 MB sampled, plus 8 per high-impact item. Each category is clamped to 0–100. This is a scan-based heuristic, not a malware verdict or performance benchmark.</p>
      </Card>
      <Card className="p-5" data-testid="card-health-trend"><Heading icon={Activity} aside={<span className="ml-auto text-[10px] text-muted-foreground/50">Last 0 scans</span>}>Health Score Trend</Heading>
        <div className="flex h-24 items-center justify-center text-xs text-muted-foreground/50">Not enough history</div>
      </Card>
    </div>
    <div className="flex flex-col gap-4">
      <Card className="p-5" data-testid="card-priority-issues"><Heading icon={ShieldAlert}>Priority Issues</Heading>
        <div className="py-5 text-center text-xs text-muted-foreground"><CheckCircle2 className="mx-auto mb-2 size-7 opacity-30 text-emerald-400" />{hasRun ? "No usable checks returned" : "Run a scan to detect issues"}</div>
      </Card>
      <Card className="p-5" data-testid="card-recent-changes"><Heading icon={Clock}>Recent Changes</Heading><p className="py-4 text-center text-xs text-muted-foreground/60">Run multiple scans to see change detection</p></Card>
      <Card className="p-5"><Heading icon={Activity}>Scan History</Heading><p className="py-4 text-center text-xs text-muted-foreground/60">No scan history yet</p></Card>
      <Card className="p-5"><Heading icon={Zap}>All Recommendations</Heading><p className="py-4 text-center text-xs text-muted-foreground/60">Run a scan to build recommendations</p></Card>
    </div>
  </div>;
}

function Protection() {
  const settings = [
    { label: "Cloud Protection", description: "Real-time cloud-based threat detection", Icon: Globe },
    { label: "PUA Protection", description: "Block potentially unwanted apps", Icon: ShieldAlert },
    { label: "Controlled Folder Access", description: "Ransomware protection for key folders", Icon: FolderLock },
    { label: "Sample Submission", description: "Send suspicious files to Microsoft", Icon: Globe },
    { label: "SmartScreen", description: "Block malicious websites and downloads", Icon: Shield },
  ];
  return <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
    <Card className="p-5" data-testid="card-defender-status"><Heading icon={Shield}>Defender Core Status</Heading>
      {["Real-time Protection", "Firewall", "Anti-spyware", "Tamper Protection"].map(label => <StatusRow key={label} label={label} />)}
      <p className="mt-3 border-t border-white/5 pt-3 text-xs text-amber-400">Available on Windows desktop. Status was not read from Windows in this preview.</p>
    </Card>
    <Card className="p-5" data-testid="card-advanced-protection"><Heading icon={Lock}>Advanced Protection</Heading>
      <div className="space-y-1">{settings.map(({ label, description, Icon }) => <div key={label} className="flex items-center gap-3 rounded-lg px-3 py-2">
        <Icon className="size-3.5 shrink-0 text-muted-foreground/40" /><div className="min-w-0 flex-1"><p className="text-xs font-medium">{label}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p></div>
        <Badge tone="unknown">Unknown</Badge><button type="button" role="switch" aria-checked="false" aria-label={`${label} (unavailable)`} disabled className="relative h-5 w-9 cursor-not-allowed rounded-full bg-zinc-700 opacity-50"><span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-zinc-400" /></button>
      </div>)}</div>
      <Disclosure>Settings are not collected in this preview. Controls are disabled and cannot be changed.</Disclosure>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button secondary disabled><Zap className="size-3.5" />Quick Scan</Button>
        <Button secondary disabled><RefreshCw className="size-3.5" />Update Sigs</Button>
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">Maintenance actions require Windows desktop.</p>
    </Card>
    <Card className="p-5 xl:col-span-2" data-testid="card-protection-freshness"><Heading icon={Activity}>Protection Freshness</Heading>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{["Signature Age", "Quick Scan Age", "Full Scan Age"].map(label => <div key={label} className="rounded-xl bg-[#1A1F26] p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold text-zinc-400">Unknown</p><p className="text-xs text-zinc-400">Not collected</p>
      </div>)}</div>
    </Card>
    <Card className="p-5 xl:col-span-2" data-testid="card-image-analysis"><Heading icon={Eye}>Screenshot Analysis<Badge tone="info">AI</Badge></Heading>
      <p className="mb-3 text-xs text-muted-foreground">Upload a Task Manager, Windows Security, or startup apps screenshot for AI analysis.</p>
      <div className="rounded-xl border border-dashed border-[#2A313A] p-6 text-center text-xs text-muted-foreground"><Eye className="mx-auto mb-2 size-6 opacity-40" />Screenshot analysis is unavailable in this local preview; no image or network request will be made.</div>
    </Card>
  </div>;
}

function Startup() {
  const [filter, setFilter] = useState<"all" | "review" | "disable">("all");
  return <div className="space-y-4">
    <Card className="p-5" data-testid="card-startup-tab">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><MonitorPlay className="size-4 text-primary" /><h2 className="text-sm font-semibold">Startup Applications</h2></div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-[#21262D] p-1">{(["all", "review", "disable"] as const).map(f => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${filter === f ? "bg-[#2A313A] text-foreground" : "text-muted-foreground hover:text-foreground/70"}`}>{f === "all" ? "All" : f === "review" ? "Review" : "Disable"}</button>)}</div>
          <Button secondary disabled className="size-7 px-0 py-0" aria-label="Refresh startup applications"><RefreshCw className="size-3.5" /></Button>
        </div>
      </div>
      <EmptyPanel icon={MonitorPlay} title="Available on Windows desktop" body={filter === "all" ? "Run a Smart Scan to load startup apps. No startup entries have been collected in this local preview." : "No startup entries have been collected, so there are no items to filter."} />
      <p className="border-t border-white/5 pt-3 text-[11px] text-muted-foreground/60">Actions use the Windows StartupApproved registry key — same mechanism as Task Manager. Delays use Task Scheduler. Windows actions are unavailable in this preview.</p>
    </Card>
  </div>;
}

function Processes() {
  const [filter, setFilter] = useState<"all" | "suspicious" | "review">("all");
  return <div className="space-y-4">
    <Card className="p-5" data-testid="card-processes-tab">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Cpu className="size-4 text-primary" /><h2 className="text-sm font-semibold">Process Trust Analysis</h2></div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-[#21262D] p-1">{(["all", "suspicious", "review"] as const).map(f => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${filter === f ? "bg-[#2A313A] text-foreground" : "text-muted-foreground hover:text-foreground/70"}`}>{f}</button>)}</div>
          <Button secondary disabled className="size-7 px-0 py-0" aria-label="Refresh process list"><RefreshCw className="size-3.5" /></Button>
        </div>
      </div>
      <EmptyPanel icon={ShieldOff} title="Available on Windows desktop" body={filter === "all" ? "Run a Smart Scan to collect sampled process information. No process trust states have been verified." : "No process data has been collected, so there are no items to filter."} />
      <div className="flex items-center gap-1.5 border-t border-white/5 pt-3 text-[11px] text-muted-foreground/60"><Info className="size-3.5 shrink-0" />Trust state is based on executable path location. Signature verification requires Windows Admin privileges.</div>
    </Card>
  </div>;
}

const auditSections: { title: string; Icon: LucideIcon; labels: string[] }[] = [
  { title: "Platform & Firmware Trust", Icon: Lock, labels: ["Secure Boot", "TPM Present", "TPM Ready", "BitLocker", "Memory Integrity (HVCI)", "Virtualization-Based Security", "LSA Protection", "Credential Guard", "UAC Enabled", "UAC Level"] },
  { title: "Remote & Network Exposure", Icon: Activity, labels: ["RDP (Remote Desktop)", "Remote Assistance", "SMBv1 Protocol", "Guest Account", "Proxy Configured", "Windows Update Service", "Listening TCP Ports"] },
  { title: "Persistence & File Risks", Icon: Shield, labels: ["Hosts File"] },
];

function Audit() {
  return <div className="space-y-4">
    <Card className="p-5" data-testid="card-audit-scan">
      <div className="flex flex-wrap items-center justify-between gap-3"><div>
        <Heading icon={Server}>Advanced Security Audit</Heading>
        <p className="text-xs text-muted-foreground">Firmware, process trust, credential protection, remote access, ports, and persistence risks.</p>
      </div><Button disabled><RefreshCw className="size-4" />Run Audit</Button></div>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground/70"><Info className="size-3.5 shrink-0" />Audit requires the SwitchControl desktop app running on Windows.</p>
    </Card>
    <EmptyPanel icon={Server} title="Advanced Security Audit" body="Run the audit on a supported Windows desktop to inspect firmware integrity, remote access exposure, and persistence risks. No audit checks have been collected." />
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{auditSections.map(({ title, Icon, labels }) => <Card key={title} className="p-5">
      <Heading icon={Icon}>{title}</Heading>{labels.map(label => <StatusRow key={label} label={label} />)}
    </Card>)}
      <Card className="p-5"><Heading icon={Server}>Scheduled Tasks</Heading><Badge tone="unknown">0 suspicious</Badge><p className="py-4 text-center text-xs text-muted-foreground/60">Task checks unavailable in this local preview.</p></Card>
      <Card className="p-5"><Heading icon={Server}>Running Services</Heading><Badge tone="unknown">0 suspicious</Badge><p className="py-4 text-center text-xs text-muted-foreground/60">Service checks unavailable in this local preview.</p></Card>
    </div>
  </div>;
}

export function Current() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [scanKind, setScanKind] = useState<ScanKind | null>(null);
  const [scanStage, setScanStage] = useState(0);
  const timers = useRef<number[]>([]);

  const startScan = (kind: ScanKind) => {
    timers.current.forEach(window.clearTimeout);
    setScanKind(kind);
    setScanStatus("scanning");
    setScanStage(0);
    const count = kind === "quick" ? 2 : SCAN_STAGES.length;
    for (let i = 1; i <= count; i++) {
      timers.current.push(window.setTimeout(() => {
        setScanStage(i);
        if (i === count) setScanStatus("complete");
      }, i * 700));
    }
  };
  const cancelScan = () => {
    timers.current.forEach(window.clearTimeout);
    setScanStatus("idle");
    setScanStage(0);
    setScanKind(null);
  };
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const scanning = scanStatus === "scanning";
  const stageCount = scanKind === "quick" ? 2 : SCAN_STAGES.length;
  const progress = scanning ? Math.round((scanStage / stageCount) * 100) : 0;

  return <div className="security-current min-h-screen">
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-7 md:px-8">
      <div className="flex flex-col gap-5 pb-10">
        <header className="flex items-start justify-between gap-4">
          <div><div className="flex items-center gap-3"><Shield className="size-6 text-primary" /><h1 className="text-2xl font-bold tracking-tight">System Integrity</h1></div>
            <p className="mt-0.5 text-sm text-muted-foreground">Security posture, startup analysis, process trust, and advanced audit.</p></div>
          <Badge tone="unknown"><span className="size-2 rounded-full bg-zinc-500" />Local Preview</Badge>
        </header>

        <Disclosure><strong>Windows Desktop Required for System Data.</strong> Defender status, startup apps, process data, and security audit require the SwitchControl desktop app running on Windows. This Local Preview does not connect to system APIs or network services. All Windows-dependent controls are unavailable or disabled.</Disclosure>

        <div className="flex flex-wrap items-center gap-2">
          {scanning ? <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex-1 space-y-1"><div className="flex justify-between text-xs text-muted-foreground"><span>{SCAN_STAGES[Math.min(scanStage, SCAN_STAGES.length - 1)]}</span><span>{progress}%</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#21262D]"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div></div>
            <Button secondary onClick={cancelScan} className="shrink-0 px-3 py-1.5 text-xs"><X className="size-3.5" />Cancel</Button>
          </div> : <>
            <Button onClick={() => startScan("smart")} data-testid="button-smart-scan"><Zap className="size-4" />Smart Scan</Button>
            <Button secondary onClick={() => startScan("quick")} data-testid="button-quick-scan"><Play className="size-3.5" />Quick Scan</Button>
            {scanStatus === "complete" && <Badge tone="unknown"><ShieldOff className="size-3" />System data unavailable · preview</Badge>}
          </>}
        </div>
        <p className="-mt-4 text-[11px] text-muted-foreground">Scan buttons demonstrate the page flow only; they make no system or network calls.</p>
        {scanStatus === "complete" && <Disclosure tone="amber"><strong>Preview run complete:</strong> no Windows APIs or network services were called. No checks were collected. {scanKind === "quick" && "Quick Scan is protection-only and did not inspect startup or process evidence."}</Disclosure>}

        <nav aria-label="Security sections" className="flex gap-0 overflow-x-auto border-b border-[#2A313A]">
          {TABS.map(({ id, label, Icon }) => <button key={id} type="button" onClick={() => setActiveTab(id)} aria-current={activeTab === id ? "page" : undefined} data-testid={`tab-${id}`} className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}><Icon className="size-3.5" />{label}</button>)}
        </nav>
        <div className="pt-0">
          {activeTab === "overview" && <Overview scanStatus={scanStatus} />}
          {activeTab === "protection" && <Protection />}
          {activeTab === "startup" && <Startup />}
          {activeTab === "processes" && <Processes />}
          {activeTab === "audit" && <Audit />}
        </div>
      </div>
    </main>
  </div>;
}

export default Current;
