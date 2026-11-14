import {
  Activity,
  ArrowRight,
  Brain,
  CheckCircle2,
  Cpu,
  Gauge,
  HardDrive,
  LayoutDashboard,
  MemoryStick,
  Network,
  Settings2,
  Shield,
  Sparkles,
  Target,
  Wifi,
  Zap,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import "./_group.css";

const trend = [28, 35, 32, 39, 36, 44, 41, 48, 43, 38, 44, 41, 49, 45, 41, 48, 44, 41];
const ramTrend = [30, 31, 31, 32, 32, 33, 33, 32, 34, 33, 34, 35, 34, 34, 35, 34, 34, 34];
const gpuTrend = [24, 28, 32, 31, 35, 33, 37, 39, 36, 40, 37, 41, 39, 36, 40, 38, 40, 38];
const miniTrendA = [27, 34, 31, 44, 38, 49, 42, 52, 47, 55, 49, 58, 51, 62, 56];
const miniTrendB = [54, 49, 56, 48, 45, 50, 42, 47, 43, 39, 44, 38, 43, 36, 39];
const miniTrendC = [37, 40, 35, 43, 40, 47, 44, 49, 46, 52, 48, 54, 50, 56, 53];
const monitorData = trend.map((cpuLoad, index) => ({
  time: `${10}:${String(41 + Math.floor(index / 2)).padStart(2, "0")}`,
  cpuLoad,
  ram: ramTrend[index],
  gpuLoad: gpuTrend[index],
  diskActiveTime: [4, 2, 3, 2, 5, 3, 2, 4, 3, 2, 3, 2, 4, 3, 2, 3, 2, 2][index],
}));

function AreaLine({ values, color, id, height = 100 }: { values: number[]; color: string; id: string; height?: number }) {
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${height - value}`).join(" ");
  const area = `0,${height} ${points} 100,${height}`;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".24" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="sc-monitor-grid">
        {[20, 40, 60, 80].map((y) => <line key={y} x1="0" y1={y} x2="100" y2={y} />)}
      </g>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function HardwareCard({
  title,
  value,
  unit,
  detail,
  icon: Icon,
  progress,
  tone,
}: {
  title: string;
  value: string;
  unit?: string;
  detail: string;
  icon: typeof Cpu;
  progress?: number;
  tone: string;
}) {
  // Markup and class structure are copied from the production StatCard component.
  return (
    <div className={`sc-current-card relative overflow-hidden ${tone}`}>
      <div className="p-5">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="text-sm font-medium text-[#A0A8B3]">{title}</div>
          <Icon className="h-4 w-4 text-[#6B7380]" />
        </div>
        <div>
          <div className="flex items-end justify-between">
            <div className="space-y-1 relative z-10 w-full">
              <div className="text-2xl font-bold font-data tracking-tight text-[#E6EAF0] tabular-nums">
                {value}
                {unit && <span className="text-sm font-normal text-[#6B7380] ml-1 tabular-nums">{unit}</span>}
              </div>
              <p className="text-xs text-[#6B7380] font-medium truncate">{detail}</p>
            </div>
          </div>
          {progress !== undefined && (
            <div className="mt-4 space-y-1.5 relative z-10">
              <div className="sc-current-progress"><span style={{ width: `${progress}%` }} /></div>
              <div className="flex justify-between text-[10px] uppercase font-medium text-[#6B7380] tracking-wider">
                <span>Usage</span>
                <span className="text-[#00D4FF]">{progress}%</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap text-[10px]">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 5px ${color}55` }} />
      <span className="text-[#E6EAF0]/45">{label}</span>
      <span className="text-[#E6EAF0] font-semibold tabular-nums">{value}</span>
    </span>
  );
}

export function Current() {
  return (
    <div className="dashboard-current min-h-screen">
      {/*
        Isolated production baseline. Data, auth, routing and actions are fixture/no-op boundaries:
        this extraction intentionally has no API, Electron IPC, telemetry store, analytics,
        network subscription, navigation or persisted global preferences. Exact production
        source imports and unrendered dashboard views are preserved as _source/*.snapshot.
      */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-[#2A313A] bg-[#14181D] px-4 py-5 lg:flex">
        <div className="mb-9 flex items-center gap-3 px-2">
          <div className="flex size-9 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10"><Zap className="size-5 text-cyan-300" /></div>
          <span className="text-base font-semibold tracking-tight">SwitchControl</span>
        </div>
        <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-[#59616d]">Workspace</div>
        <nav className="space-y-1 text-[13px]">
          <div className="sc-sidebar-link active flex items-center gap-3 rounded-lg px-3 py-2.5"><LayoutDashboard className="size-4" />Dashboard</div>
          <div className="sc-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5"><Zap className="size-4" />Tweaks</div>
          <div className="sc-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5"><Activity className="size-4" />History</div>
          <div className="sc-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5"><Brain className="size-4" />AI Advisor</div>
        </nav>
        <div className="mb-2 mt-8 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-[#59616d]">Intelligence</div>
        <nav className="space-y-1 text-[13px]">
          <div className="sc-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5"><Target className="size-4" />Performance Lab</div>
          <div className="sc-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5"><Shield className="size-4" />BIOS Advisor</div>
        </nav>
        <div className="mt-auto rounded-xl border border-[#2A313A] bg-[#1A1F26] p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-[#E6EAF0]"><span className="size-1.5 rounded-full bg-emerald-400" />System protected</div>
          <p className="mt-1.5 text-[10px] text-[#6B7380]">All monitoring services operational</p>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[#7D8692]"><Settings2 className="size-4" />Settings</div>
      </aside>

      <main className="mx-auto max-w-[1600px] px-5 pb-10 pt-5 lg:ml-64 lg:px-8">
        <div className="mb-4 flex items-center justify-end gap-2 text-[11px] text-[#7D8692]">
          <span className="size-1.5 rounded-full bg-emerald-400" />Connected
          <span className="ml-2 rounded-full border border-[#2A313A] px-2 py-1">Live monitoring</span>
        </div>
        <div className="space-y-8">
          {/* Production Home hero structure retained; auth, routing and live status are static mock boundaries. */}
          <div className="relative min-h-[88px] py-2 pb-4" data-tour="dashboard-hero">
            <div className="pointer-events-none absolute -right-8 -top-20 h-56 w-2/3 rounded-full bg-cyan-400/[0.035] blur-3xl" />
            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                  <h1 className="greeting-glow text-3xl font-bold tracking-tight text-[#E6EAF0] leading-tight">Good afternoon,</h1>
                  <span className="username-gradient text-3xl font-bold tracking-tight leading-tight select-none" data-testid="text-dashboard-username">SwitchTech</span>
                </div>
                <div className="relative h-5 mt-1.5 overflow-hidden">
                  <p className="absolute inset-0 text-sm text-muted-foreground flex items-center gap-1.5" data-testid="text-dashboard-tagline">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" style={{ boxShadow: "0 0 5px rgba(52,211,153,0.8)" }} />
                    System active · CPU 41% · RAM 10.7/31.6GB
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button className="hidden sm:flex items-center gap-2 rounded-md border border-[#343b44] px-3 py-2 text-sm text-[#C2C8D0]"><Activity className="size-4" />View Logs</button>
                <button className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-[#E6EAF0]"><Zap className="size-4" />Optimize Now</button>
              </div>
            </div>
          </div>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-[#E6EAF0] flex items-center gap-2"><Activity className="size-5 text-primary" />Activity Monitor</h2>
              <span className="hidden sm:block text-[10px] uppercase tracking-wider text-[#59616d]">Hardware overview</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <HardwareCard title="Memory" value="10.7" unit="GB / 31.6 GB" detail="System memory" icon={MemoryStick} progress={34} tone="border-teal-500/20 shadow-[0_0_20px_-10px_rgba(0,212,190,.18)]" />
              <HardwareCard title="CPU" value="Ryzen 7 9800X3D" detail="8 Cores / 16 Threads" icon={Cpu} progress={41} tone="border-primary/40 shadow-[0_0_20px_-10px_rgba(0,212,255,.2)]" />
              <HardwareCard title="GPU" value="Radeon RX 7800 XT" detail="16 GB VRAM" icon={Activity} tone="border-cyan-500/20 shadow-[0_0_20px_-10px_rgba(0,212,255,.13)]" />
              <HardwareCard title="Disk (C:)" value="447.1" unit="GB / 930.6 GB" detail="NVMe SSD" icon={HardDrive} progress={48} tone="border-amber-500/20 shadow-[0_0_20px_-10px_rgba(245,158,11,.12)]" />
            </div>
          </section>

          {/* Static telemetry fixture; chart presentation follows the production LiveGraph visual system.
              Stub boundary: no WebSocket, Electron IPC, polling or cross-mount telemetry store. */}
          <section className="sc-current-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium text-[#E6EAF0] flex items-center gap-2"><Activity className="size-4 text-primary" />Live System Monitor<span className="flex items-center gap-1"><span className="block w-1.5 h-1.5 rounded-full bg-emerald-400/80" /></span></h3>
              <div className="flex items-center gap-2 text-[10px] text-[#6B7380]"><span className="rounded-md border border-[#2A313A] px-2 py-1">Last 60 seconds</span><span className="hidden sm:inline">● Live</span></div>
            </div>
            <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[#2A313A] px-3 py-2 text-[10px]" style={{ background: "rgba(255,255,255,0.03)" }}>
              <StatMetric label="CPU" value="41%" color="#ef4444" /><StatMetric label="RAM" value="10.7/31.6 GB" color="#06b6d4" />
              <StatMetric label="GPU" value="38%" color="#22c55e" /><StatMetric label="Disk" value="2%" color="#eab308" />
              <StatMetric label="↓" value="2 KB/s" color="#3b82f6" /><StatMetric label="↑" value="2 KB/s" color="#00D4FF" />
            </div>
            <div className="relative h-[192px] overflow-hidden rounded-lg bg-[#1A1F26] p-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monitorData} margin={{ top: 22, right: 18, left: -20, bottom: 4 }}>
                  <defs>
                    <linearGradient id="current-cpu-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.38} /><stop offset="55%" stopColor="#ef4444" stopOpacity={0.12} /><stop offset="100%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                    <linearGradient id="current-ram-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} /><stop offset="55%" stopColor="#06b6d4" stopOpacity={0.09} /><stop offset="100%" stopColor="#06b6d4" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={{ stroke: "#374151" }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={{ stroke: "#374151" }} tickLine={false} domain={[0, 100]} tickFormatter={(value) => `${value}`} />
                  <Area type="monotone" dataKey="cpuLoad" stroke="none" fill="url(#current-cpu-fill)" dot={false} activeDot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="diskActiveTime" stroke="#eab308" strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="ram" stroke="#06b6d4" strokeWidth={2.5} dot={false} activeDot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="gpuLoad" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="cpuLoad" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-[#69727e]"><span><span className="text-red-400">●</span> CPU Load</span><span><span className="text-cyan-400">●</span> Memory</span><span><span className="text-emerald-400">●</span> GPU Load</span><span><span className="text-amber-400">●</span> Disk Active</span></div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-[#E6EAF0] flex items-center gap-2"><Cpu className="size-5 text-primary" />Performance Lab</h2>
              <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /><span className="text-[11px] text-muted-foreground/60">Live intelligence</span></div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <article className="sc-current-card p-5">
                <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-medium"><Shield className="size-4 text-muted-foreground" />System Stability</h3><span className="rounded-full border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">Stable</span></div>
                <div className="mt-5 flex items-center gap-4">
                  <div className="relative flex size-24 items-center justify-center rounded-full border-[8px] border-[#2A313A]"><div className="absolute inset-[-8px] rounded-full border-[8px] border-emerald-400 border-b-transparent border-l-transparent rotate-[35deg]" /><div className="text-center"><div className="text-2xl font-bold text-emerald-400">94</div><div className="text-[9px] text-muted-foreground/50">/ 100</div></div></div>
                  <div className="flex-1 space-y-2 text-[10px]"><div className="flex justify-between"><span className="text-muted-foreground">CPU</span><span className="font-data">41%</span></div><div className="flex justify-between"><span className="text-muted-foreground">RAM</span><span className="font-data">34%</span></div><div className="flex justify-between"><span className="text-muted-foreground">Procs</span><span className="font-data">186</span></div></div>
                </div>
                <div className="mt-4 rounded-lg border border-[#2A313A] bg-[#1A1F26] px-3 py-2 text-[10px] text-[#A0A8B3]"><b className="mr-1 text-emerald-400">Source:</b>Local system telemetry · healthy operating range</div>
              </article>
              <article className="sc-current-card p-5">
                <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-medium"><Activity className="size-4 text-muted-foreground" />Active Problems</h3><span className="rounded-full border border-emerald-500/25 bg-emerald-500/[.06] px-2 py-0.5 text-[10px] font-bold text-emerald-400">All Clear</span></div>
                <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center"><CheckCircle2 className="size-8 text-emerald-400" /><p className="text-xs font-medium text-emerald-400">All systems nominal</p><p className="text-[10px] text-muted-foreground/50">No significant issues detected</p></div>
              </article>
              <article className="sc-current-card p-5">
                <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-medium"><Gauge className="size-4 text-muted-foreground" />System Responsiveness</h3><span className="text-[10px] text-emerald-400">Normal</span></div>
                <div className="mt-5 space-y-4"><div><div className="mb-1 flex justify-between text-[10px]"><span className="text-muted-foreground">CPU load</span><span className="font-data">41%</span></div><div className="sc-current-progress"><span style={{ width: "41%" }} /></div></div><div><div className="mb-1 flex justify-between text-[10px]"><span className="text-muted-foreground">Memory pressure</span><span className="font-data">34%</span></div><div className="sc-current-progress"><span style={{ width: "34%" }} /></div></div><div className="flex items-center justify-between border-t border-[#2A313A] pt-3 text-[10px]"><span className="text-muted-foreground">Background load</span><span className="font-data text-[#E6EAF0]">Low</span></div></div>
              </article>
            </div>
          </section>

          <section className="sc-current-card p-4">
            <div className="mb-3 flex items-center gap-2"><Wifi className="size-4 text-primary" /><span className="text-sm font-medium">System Pipeline</span><span className="ml-auto text-[10px] text-muted-foreground">Live</span></div>
            <div className="grid gap-2 sm:grid-cols-4">
              {[{ label: "CPU", sub: "Processing", value: "41%", icon: Cpu }, { label: "System", sub: "Memory", value: "34%", icon: MemoryStick }, { label: "NIC", sub: "Ethernet", value: "2 KB/s", icon: Network }, { label: "Network", sub: "Upload", value: "2 KB/s", icon: Wifi }].map(({ label, sub, value, icon: Icon }) => (
                <div key={label} className="relative rounded-lg border border-emerald-500/20 bg-emerald-500/[.04] p-3">
                  <div className="flex items-center gap-2"><Icon className="size-3.5 text-emerald-400" /><span className="text-[11px] font-medium">{label}</span><span className="ml-auto size-1.5 rounded-full bg-emerald-400" /></div>
                  <div className="mt-2 text-base font-semibold font-data">{value}</div><div className="mt-0.5 text-[9px] text-muted-foreground">{sub}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight text-[#E6EAF0] flex items-center gap-2"><HardDrive className="size-5 text-primary" />Storage</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <article className="sc-current-card p-4">
                <div className="mb-3 flex items-center gap-2"><div className="flex size-8 items-center justify-center rounded-lg bg-primary/10"><HardDrive className="size-4 text-primary" /></div><span className="text-sm font-medium">C: NVMe SSD</span><span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] uppercase text-emerald-400">Active</span></div>
                <div className="space-y-2"><div className="sc-current-progress"><span style={{ width: "48%" }} /></div><div className="grid grid-cols-3 gap-2 text-[10px]"><div><span className="block text-muted-foreground">Total</span><span className="font-data">930.6 GB</span></div><div><span className="block text-muted-foreground">Used</span><span className="font-data">447.1 GB</span></div><div><span className="block text-muted-foreground">Free</span><span className="font-data text-emerald-400">483.5 GB</span></div></div></div>
              </article>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2"><Activity className="size-4 text-primary" /><h2 className="text-lg font-semibold tracking-tight text-[#E6EAF0]">Telemetry Analytics</h2><span className="ml-auto text-[9px] uppercase tracking-widest text-[#6B7380]/60 font-semibold">Live · Rolling window</span></div>
            <div className="grid gap-4 md:grid-cols-3">
              {[{ title: "Memory Pressure", value: "34%", label: "Stable", color: "#06b6d4", values: miniTrendA, id: "analytics-memory" }, { title: "Storage Activity", value: "2%", label: "Low activity", color: "#eab308", values: miniTrendB, id: "analytics-storage" }, { title: "System Rhythm", value: "41%", label: "Normal load", color: "#22c55e", values: miniTrendC, id: "analytics-rhythm" }].map((chart) => (
                <article key={chart.id} className="sc-current-card overflow-hidden p-4">
                  <div className="flex items-start justify-between"><div><h3 className="text-xs font-medium text-[#A0A8B3]">{chart.title}</h3><div className="mt-1 text-xl font-bold font-data">{chart.value}</div></div><span className="rounded-full bg-white/[.04] px-2 py-1 text-[9px] text-[#7D8692]">{chart.label}</span></div>
                  <div className="mt-3 h-20"><AreaLine values={chart.values} color={chart.color} id={chart.id} height={75} /></div>
                  <div className="mt-2 flex justify-between text-[9px] text-[#6B7380]"><span>60s ago</span><span>30s</span><span>Now</span></div>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <article className="sc-current-card relative overflow-hidden">
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-emerald-500/[.08] blur-3xl" />
              <div className="p-6 pb-4"><h3 className="flex items-center gap-2 text-base font-medium"><Shield className="size-4 text-emerald-400" />System Health</h3></div>
              <div className="space-y-4 px-6 pb-6">
                {[["Tweaks applied", "18 / 42", 43], ["Services disabled", "6", 100], ["Cleaners run", "12", 100], ["Startup apps disabled", "4", 100]].map(([label, value, width]) => (
                  <div key={label} className="space-y-1.5"><div className="flex justify-between text-xs font-medium"><span className="text-muted-foreground">{label}</span><span className="font-data">{value}</span></div><div className="sc-current-progress h-1"><span style={{ width: `${width}%` }} /></div></div>
                ))}
                <div className="flex items-center justify-between border-t border-[#2A313A] pt-3"><span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Last Scan</span><span className="text-[10px] font-data text-emerald-400">Today, 10:32</span></div>
              </div>
            </article>
            <article className="sc-current-card relative overflow-hidden">
              <div className="absolute -right-12 -top-12 size-36 rounded-full bg-primary/[.08] blur-3xl" />
              <div className="p-6 pb-3"><h3 className="flex items-center gap-2 text-base font-medium"><Brain className="size-4 text-primary" />AI Advisor<Sparkles className="ml-auto size-4 text-primary/70" /></h3><p className="mt-1 text-[10px] text-muted-foreground">Your system configuration is looking good.</p></div>
              <div className="space-y-4 px-6 pb-6"><div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-center"><div className="text-2xl font-bold text-emerald-400">92</div><p className="mt-0.5 text-[10px] text-emerald-400">Good Configuration</p></div><p className="text-[10px] leading-snug text-[#A0A8B3]">CPU and memory utilization are within healthy ranges. No urgent action recommended.</p><div className="flex items-center gap-1.5 text-[9px] text-muted-foreground"><span>36/38 rules passed</span><span className="text-border">|</span><span>2 issues</span></div><button className="flex w-full items-center rounded-md border border-primary/20 bg-primary/20 px-3 py-2 text-xs text-primary"><Brain className="mr-1.5 size-3.5" />Open AI Advisor<ArrowRight className="ml-auto size-3" /></button></div>
            </article>
            <article className="sc-current-card relative overflow-hidden">
              <div className="absolute -right-12 -top-12 size-36 rounded-full bg-primary/[.08] blur-3xl" />
              <div className="p-6 pb-3"><h3 className="flex items-center gap-2 text-base font-medium"><Target className="size-4 text-primary" />BIOS Score<Sparkles className="ml-auto size-4 text-primary/70" /></h3><p className="mt-1 text-[10px] text-muted-foreground">Competitive readiness is strong.</p></div>
              <div className="space-y-4 px-6 pb-6"><div className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-center"><div className="text-2xl font-bold text-primary">87</div><p className="mt-0.5 text-[10px] text-muted-foreground">Readiness Estimate</p><span className="mt-1 inline-block rounded border border-emerald-400/20 bg-emerald-400/5 px-1.5 py-0.5 text-[9px] text-emerald-400">Live</span></div><div className="flex justify-between"><span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">Competitive</span><span className="text-[9px] text-muted-foreground">Latency · Frametime · Stability</span></div><button className="flex w-full items-center rounded-md border border-primary/25 bg-primary/15 px-3 py-2 text-xs text-primary"><Target className="mr-1.5 size-3.5" />View BIOS Analysis<ArrowRight className="ml-auto size-3" /></button></div>
            </article>
          </section>
        </div>
      </main>
    </div>
  );
}
