export type NetworkCategory = "SMB" | "TCP/IP" | "UDP" | "Security" | "DNS";
export type SafetyLevel = "Safe" | "Moderate" | "Risky";
export type TweakLevel = "Recommended" | "Advanced" | "Experimental";
export type ImpactLevel = "None" | "Low" | "Medium" | "High";

export interface NetworkTweakExpected {
  network?: ImpactLevel;
  latency?: ImpactLevel;
  stabilityRisk?: ImpactLevel;
}

export interface NetworkTweak {
  id: string;
  name: string;
  category: NetworkCategory;
  summary: string;
  description: string;
  impact: string[];
  safety: SafetyLevel;
  level: TweakLevel;
  expected: NetworkTweakExpected;
  warning?: string;
}

export const NETWORK_TWEAKS: NetworkTweak[] = [
  // SMB Category
  {
    id: "smb-non-best-effort",
    name: "Enable Non-Best Effort",
    category: "SMB",
    summary: "Prioritizes time-sensitive traffic policies.",
    description: "Enables non-best-effort bandwidth behavior so certain traffic classes are not treated as lowest priority.",
    impact: [
      "Can reduce jitter for prioritized traffic",
      "May not change ping in most home setups"
    ],
    safety: "Safe",
    level: "Advanced",
    expected: { network: "Low", latency: "Low", stabilityRisk: "Low" }
  },
  {
    id: "smb-v2v3",
    name: "Enable SMBv2 and SMBv3",
    category: "SMB",
    summary: "Uses modern SMB for faster, safer file sharing.",
    description: "Ensures SMBv2/3 are enabled to avoid legacy SMB1 behavior and improve file transfer performance/security.",
    impact: [
      "Better file transfer efficiency on LAN",
      "Improved security vs SMB1"
    ],
    safety: "Safe",
    level: "Recommended",
    expected: { network: "Low", latency: "None", stabilityRisk: "Low" }
  },
  {
    id: "smb-live-migration",
    name: "Improve Live Migration",
    category: "SMB",
    summary: "Optimizes SMB parameters used for migration workloads.",
    description: "Tunes SMB for bulk transfer reliability and concurrency, mainly useful for virtualization/live migration scenarios.",
    impact: [
      "Higher throughput for large transfers",
      "Little to no effect for gaming"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Low", latency: "None", stabilityRisk: "Medium" }
  },
  {
    id: "smb-congruent-ops",
    name: "Increase Congruent Network Operations",
    category: "SMB",
    summary: "Increases parallel SMB operations.",
    description: "Raises concurrency limits so SMB can handle more simultaneous operations.",
    impact: [
      "Faster LAN file operations under load",
      "Potentially higher CPU during transfers"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Medium", latency: "None", stabilityRisk: "Medium" }
  },
  {
    id: "smb-max-requests",
    name: "Increase Maximum Outstanding Network Requests",
    category: "SMB",
    summary: "Allows more pending SMB requests.",
    description: "Increases the number of requests SMB can queue before waiting.",
    impact: [
      "Smoother high-throughput transfers",
      "Can increase memory usage slightly"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Medium", latency: "None", stabilityRisk: "Medium" }
  },
  {
    id: "smb-irp-stack",
    name: "Increase IRP Stack Size",
    category: "SMB",
    summary: "Improves reliability for heavy network/file workloads.",
    description: "Increases IRP stack size which can help prevent errors in complex filter-driver chains.",
    impact: [
      "Can reduce rare network redirector errors",
      "No gaming benefit in most cases"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Low", latency: "None", stabilityRisk: "Medium" }
  },
  {
    id: "smb-incoming-requests",
    name: "Increase Maximum Incoming Network Requests",
    category: "SMB",
    summary: "Raises server-side request handling capacity.",
    description: "Allows the system to accept more incoming SMB requests concurrently.",
    impact: [
      "Better hosting/file share performance",
      "More resource use when serving many clients"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Medium", latency: "None", stabilityRisk: "Medium" }
  },
  {
    id: "smb-pipe-data",
    name: "Increase Pipe Data Size",
    category: "SMB",
    summary: "Increases named pipe buffer capacity.",
    description: "Raises buffer size for named pipes to improve throughput for IPC-heavy scenarios.",
    impact: [
      "Can improve some LAN/IPC throughput",
      "Minimal effect for gaming"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Low", latency: "None", stabilityRisk: "Medium" }
  },
  {
    id: "smb-request-buffer",
    name: "Increase Request Buffer Size",
    category: "SMB",
    summary: "Improves buffering for network redirector.",
    description: "Increases request buffer sizes for SMB redirector operations.",
    impact: [
      "More efficient large transfers",
      "Slightly higher memory use"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Low", latency: "None", stabilityRisk: "Medium" }
  },
  {
    id: "smb-preallocate",
    name: "Preallocate Connection Objects",
    category: "SMB",
    summary: "Reduces overhead creating connections under load.",
    description: "Preallocates connection objects to reduce allocations during bursts.",
    impact: [
      "Better stability under heavy connection churn",
      "Little effect for typical home users"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Low", latency: "None", stabilityRisk: "Medium" }
  },

  // TCP/IP Category
  {
    id: "tcp-wait-time",
    name: "Decrease Wait-Time State",
    category: "TCP/IP",
    summary: "Reduces time sockets linger after close.",
    description: "Lowers how long connections remain in certain wait states to free ports faster.",
    impact: [
      "Helps apps that open/close many connections",
      "Can increase risk of edge-case connection reuse issues"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Low", latency: "None", stabilityRisk: "Medium" }
  },
  {
    id: "tcp-bufferlist",
    name: "Disable Bufferlist Tracking",
    category: "TCP/IP",
    summary: "Reduces overhead in certain TCP paths.",
    description: "Disables tracking that can add overhead, primarily affecting diagnostics/legacy behavior.",
    impact: [
      "Small CPU overhead reduction (rare)",
      "Little/no ping change"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "None", latency: "Low", stabilityRisk: "Medium" }
  },
  {
    id: "tcp-nagle",
    name: "Disable Nagle's Algorithm",
    category: "TCP/IP",
    summary: "Sends small packets sooner.",
    description: "Disables Nagle so small TCP packets are not delayed waiting for aggregation.",
    impact: [
      "Lower latency for TCP-based real-time apps",
      "Slightly higher packet count"
    ],
    safety: "Safe",
    level: "Recommended",
    expected: { network: "Low", latency: "Medium", stabilityRisk: "Low" }
  },
  {
    id: "tcp-non-sack-rto",
    name: "Disable Non-Sack RTO",
    category: "TCP/IP",
    summary: "Improves recovery behavior on loss.",
    description: "Tunes retransmission timeout behavior when selective acks are not used.",
    impact: [
      "Can reduce stalls on lossy links",
      "No benefit on clean connections"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Low", latency: "Low", stabilityRisk: "Medium" }
  },
  {
    id: "tcp-task-offload",
    name: "Disable Task Offload",
    category: "TCP/IP",
    summary: "Moves some NIC work back to CPU.",
    description: "Disables certain offloads that can add latency or cause driver quirks.",
    impact: [
      "Can improve consistency on some NIC/drivers",
      "Can increase CPU usage"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Low", latency: "Low", stabilityRisk: "Medium" }
  },
  {
    id: "tcp-timestamps",
    name: "Disable TCP Timestamps",
    category: "TCP/IP",
    summary: "Reduces per-packet overhead.",
    description: "Disables TCP timestamps which add bytes to packets and can affect some paths.",
    impact: [
      "Slight overhead reduction",
      "Can reduce compatibility with some measurement features"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "None", latency: "Low", stabilityRisk: "Medium" }
  },
  {
    id: "tcp-window-heuristics",
    name: "Disable Window Scaling Heuristics",
    category: "TCP/IP",
    summary: "Prevents Windows from auto-limiting scaling.",
    description: "Disables heuristics that may reduce receive window scaling in some cases.",
    impact: [
      "Can improve throughput on high-latency links",
      "Rarely affects gaming ping"
    ],
    safety: "Safe",
    level: "Advanced",
    expected: { network: "Low", latency: "None", stabilityRisk: "Low" }
  },
  {
    id: "tcp-dca",
    name: "Enable Direct Cache Access (DCA)",
    category: "TCP/IP",
    summary: "Optimizes memory writes from NIC (where supported).",
    description: "Enables DCA-like behavior if supported to reduce CPU cache pollution.",
    impact: [
      "Small efficiency gain on supported systems",
      "No change on unsupported hardware"
    ],
    safety: "Moderate",
    level: "Experimental",
    expected: { network: "None", latency: "Low", stabilityRisk: "Medium" }
  },
  {
    id: "tcp-throttling-index",
    name: "Enable Network Throttling Index",
    category: "TCP/IP",
    summary: "Disables throttling for multimedia/network tasks.",
    description: "Sets throttling index to prevent Windows from limiting network processing for multimedia workloads.",
    impact: [
      "Can improve consistency for real-time traffic",
      "Can increase CPU usage slightly"
    ],
    safety: "Moderate",
    level: "Recommended",
    expected: { network: "Low", latency: "Low", stabilityRisk: "Medium" }
  },
  {
    id: "tcp-pmtu",
    name: "Enable Path MTU and Black Hole Detection",
    category: "TCP/IP",
    summary: "Improves handling of MTU issues.",
    description: "Enables PMTU and black hole detection to avoid fragmentation-related stalls.",
    impact: [
      "Can reduce rare connection stalls",
      "Usually no difference on normal networks"
    ],
    safety: "Safe",
    level: "Advanced",
    expected: { network: "Low", latency: "None", stabilityRisk: "Low" }
  },
  {
    id: "tcp-rss",
    name: "Enable RSS",
    category: "TCP/IP",
    summary: "Spreads network processing across CPU cores.",
    description: "Enables Receive Side Scaling to improve throughput and reduce single-core bottlenecks.",
    impact: [
      "Better throughput and stability under load",
      "No direct ping reduction"
    ],
    safety: "Safe",
    level: "Recommended",
    expected: { network: "Medium", latency: "Low", stabilityRisk: "Low" }
  },
  {
    id: "tcp-chimney",
    name: "Enable TCP Chimney Offload",
    category: "TCP/IP",
    summary: "Offloads TCP processing to NIC (legacy).",
    description: "Enables chimney offload where supported, but can be buggy on modern drivers.",
    impact: [
      "Can help throughput on specific NICs",
      "Can cause instability on others"
    ],
    safety: "Risky",
    level: "Experimental",
    expected: { network: "Low", latency: "None", stabilityRisk: "High" }
  },
  {
    id: "tcp-sack",
    name: "Enable TCP Selective Acks (SACK)",
    category: "TCP/IP",
    summary: "Recovers faster from packet loss.",
    description: "Enables SACK so TCP can retransmit only missing segments.",
    impact: [
      "Better performance on lossy links",
      "No downside for most users"
    ],
    safety: "Safe",
    level: "Recommended",
    expected: { network: "Low", latency: "Low", stabilityRisk: "Low" }
  },
  {
    id: "tcp-weak-host",
    name: "Enable Weak-Host Transmission",
    category: "TCP/IP",
    summary: "Allows sending from non-primary interfaces.",
    description: "Enables weak-host model which can break certain VPN routing assumptions.",
    impact: [
      "Can help multi-NIC routing edge cases",
      "Can break VPNs and tunnel routing"
    ],
    safety: "Risky",
    level: "Experimental",
    expected: { network: "None", latency: "None", stabilityRisk: "High" },
    warning: "May break VPNs (WireGuard) or cause routing issues."
  },
  {
    id: "tcp-winhttp",
    name: "Enable WinHTTP Autotuning",
    category: "TCP/IP",
    summary: "Improves HTTP throughput behavior.",
    description: "Enables WinHTTP autotuning for better performance in some HTTP scenarios.",
    impact: [
      "Better downloads in some environments",
      "No gaming ping benefit"
    ],
    safety: "Safe",
    level: "Advanced",
    expected: { network: "Low", latency: "None", stabilityRisk: "Low" }
  },
  {
    id: "tcp-rto-increase",
    name: "Increase TCP Retransmission Timeout",
    category: "TCP/IP",
    summary: "Waits longer before retransmitting.",
    description: "Increases RTO which can reduce aggressive retransmits on unstable links but may add delay on loss.",
    impact: [
      "Potentially fewer retransmit storms",
      "Can increase delay during packet loss"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "None", latency: "Low", stabilityRisk: "Medium" }
  },
  {
    id: "tcp-connection-timeout",
    name: "Lower TCP Connection Timeout",
    category: "TCP/IP",
    summary: "Fails faster on dead connections.",
    description: "Lowers how long TCP waits before declaring a connection attempt dead.",
    impact: [
      "Faster fallback when servers are unreachable",
      "Can cause issues on high-latency networks"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "None", latency: "None", stabilityRisk: "Medium" }
  },
  {
    id: "tcp-congestion",
    name: "Optimize Network Congestion Provider",
    category: "TCP/IP",
    summary: "Selects a congestion algorithm.",
    description: "Adjusts congestion control provider to improve throughput/latency balance.",
    impact: [
      "Can change throughput and jitter characteristics",
      "Best choice depends on ISP/path"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Medium", latency: "Low", stabilityRisk: "Medium" }
  },
  {
    id: "tcp-ttl",
    name: "Reduce Time-to-Live (TTL)",
    category: "TCP/IP",
    summary: "Reduces hop limit for packets.",
    description: "Lowers TTL; mostly irrelevant for gaming and can break some routing paths.",
    impact: [
      "No latency benefit in normal use",
      "Can cause connectivity issues to distant hosts"
    ],
    safety: "Risky",
    level: "Experimental",
    expected: { network: "None", latency: "None", stabilityRisk: "High" }
  },
  {
    id: "tcp-connection-limit",
    name: "Remove TCP Connection Limit",
    category: "TCP/IP",
    summary: "Allows more concurrent connections.",
    description: "Raises/adjusts certain limits to allow more concurrent outbound connections.",
    impact: [
      "Helpful for heavy downloaders/servers",
      "No ping benefit"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Low", latency: "None", stabilityRisk: "Medium" }
  },
  {
    id: "tcp-port-range",
    name: "Set Dynamic Port Range to Max",
    category: "TCP/IP",
    summary: "Expands ephemeral port range.",
    description: "Expands available ephemeral ports to reduce port exhaustion.",
    impact: [
      "Improves reliability for connection-heavy workloads",
      "No gaming ping benefit"
    ],
    safety: "Safe",
    level: "Advanced",
    expected: { network: "None", latency: "None", stabilityRisk: "Low" }
  },

  // UDP Category
  {
    id: "udp-offloads",
    name: "Disable UDP Offloads",
    category: "UDP",
    summary: "Reduces offload-related jitter on some NICs.",
    description: "Disables UDP offloads that can cause latency spikes on certain drivers.",
    impact: [
      "More consistent UDP behavior in some cases",
      "Higher CPU usage possible"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Low", latency: "Low", stabilityRisk: "Medium" }
  },
  {
    id: "udp-fast-send",
    name: "Enable Fast Datagram Sending for UDP Traffic",
    category: "UDP",
    summary: "Prioritizes faster UDP send path.",
    description: "Tunes UDP send behavior to reduce delays in some applications.",
    impact: [
      "Can reduce UDP jitter slightly",
      "Depends heavily on driver/stack"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Low", latency: "Low", stabilityRisk: "Medium" }
  },

  // Security Category
  {
    id: "sec-llmnr",
    name: "Disable LLMNR",
    category: "Security",
    summary: "Reduces legacy name resolution.",
    description: "Disables LLMNR to reduce unwanted local name resolution broadcasts.",
    impact: [
      "Slight reduction in background broadcast traffic",
      "Can break some LAN discovery cases"
    ],
    safety: "Safe",
    level: "Recommended",
    expected: { network: "Low", latency: "None", stabilityRisk: "Low" }
  },
  {
    id: "sec-mpp",
    name: "Disable MPP",
    category: "Security",
    summary: "Reduces legacy resolver/port usage.",
    description: "Disables a legacy component to reduce background resolution paths.",
    impact: [
      "Reduced background chatter",
      "Potential LAN compatibility changes"
    ],
    safety: "Moderate",
    level: "Advanced",
    expected: { network: "Low", latency: "None", stabilityRisk: "Medium" }
  },
  {
    id: "sec-netbios",
    name: "Disable NetBIOS",
    category: "Security",
    summary: "Turns off NetBIOS over TCP/IP.",
    description: "Disables NetBIOS to reduce legacy broadcasts and potential exposure.",
    impact: [
      "Less broadcast traffic on LAN",
      "May break old SMB name discovery"
    ],
    safety: "Moderate",
    level: "Recommended",
    expected: { network: "Low", latency: "None", stabilityRisk: "Medium" }
  },

  // DNS Category
  {
    id: "dns-doh",
    name: "Enable DNS over HTTPS",
    category: "DNS",
    summary: "Encrypts DNS lookups.",
    description: "Enables DoH for privacy and sometimes better reliability depending on provider.",
    impact: [
      "Encrypted DNS queries",
      "DNS performance depends on chosen resolver"
    ],
    safety: "Safe",
    level: "Recommended",
    expected: { network: "Low", latency: "None", stabilityRisk: "Low" }
  },
  {
    id: "dns-optimize",
    name: "Optimize DNS",
    category: "DNS",
    summary: "Applies safe DNS client optimizations.",
    description: "Tunes DNS client behavior for faster cache usage and fewer delays.",
    impact: [
      "Faster name resolution in some cases",
      "No direct ping change once connected"
    ],
    safety: "Safe",
    level: "Recommended",
    expected: { network: "Low", latency: "None", stabilityRisk: "Low" }
  }
];

export const NETWORK_CATEGORIES: NetworkCategory[] = ["SMB", "TCP/IP", "UDP", "Security", "DNS"];
