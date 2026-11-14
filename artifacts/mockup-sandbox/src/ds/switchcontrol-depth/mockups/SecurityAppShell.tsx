import type { PropsWithChildren } from "react";
import {
  Activity,
  Cpu,
  Gauge,
  LockKeyhole,
  Monitor,
  Network,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import "./SecurityAppShell.css";

const navItems = [
  { label: "Dashboard", Icon: Gauge },
  { label: "Tweaks", Icon: SlidersHorizontal },
  { label: "Network Tweaks", Icon: Network },
  { label: "Power Plan", Icon: Zap },
  { label: "Cleaner", Icon: Trash2 },
  { label: "Debloat", Icon: Sparkles },
  { label: "Startup", Icon: Monitor },
  { label: "AI Advisor", Icon: Activity },
  { label: "BIOS Advisor", Icon: Cpu },
  { label: "Security", Icon: ShieldCheck },
  { label: "Driver Intel", Icon: Cpu },
  { label: "Latency Analyzer", Icon: Activity },
  { label: "Settings", Icon: Settings2 },
];

export function SecurityAppShell({ children }: PropsWithChildren) {
  return (
    <div className="scd-root scd-security-shell">
      <aside className="scd-security-sidebar" aria-label="SwitchControl navigation">
        <div className="scd-security-brand">
          <span className="scd-security-brand__mark" aria-hidden="true">
            <ShieldCheck size={19} />
          </span>
          <span className="scd-security-brand__name">SwitchControl</span>
        </div>

        <nav className="scd-security-nav" aria-label="Primary navigation">
          {navItems.map(({ label, Icon }) => (
            <span
              key={label}
              className={`scd-security-nav__item${label === "Security" ? " is-active" : ""}`}
              aria-current={label === "Security" ? "page" : undefined}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{label}</span>
              {label === "Security" && <span className="scd-security-nav__marker" aria-hidden="true" />}
            </span>
          ))}
        </nav>

        <div className="scd-security-account">
          <span className="scd-security-account__avatar" aria-hidden="true">ST</span>
          <span className="scd-security-account__copy">
            <strong>SwitchTech</strong>
            <span>PREMIUM</span>
          </span>
          <LockKeyhole size={13} aria-hidden="true" />
        </div>
      </aside>

      <div className="scd-security-mobile-brand">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>SwitchControl</span>
        <span className="scd-security-mobile-brand__section">/ Security</span>
      </div>

      <main id="security-content" className="scd-security-main">
        {children}
      </main>
    </div>
  );
}

export default SecurityAppShell;
