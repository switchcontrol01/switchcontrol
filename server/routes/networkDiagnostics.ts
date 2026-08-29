import { Router } from "express";
import * as net from "net";
import { performance } from "perf_hooks";

const router = Router();

function diagnosticLog(event: string, fields: Record<string, unknown> = {}) {
  console.info("[NetworkDiagnostics]", JSON.stringify({ event, ts: new Date().toISOString(), ...fields }));
}

// Strict per-IP rate limit for ping-sample: 1 call / 30 s.
const pingSampleLastCall = new Map<string, number>();
const PING_SAMPLE_COOLDOWN_MS = 30_000;

function pingRateLimit(req: any, res: any, next: any) {
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ?? req.ip ?? "unknown";
  const now = Date.now();
  const last = pingSampleLastCall.get(ip) ?? 0;
  if (now - last < PING_SAMPLE_COOLDOWN_MS) {
    const retryAfter = Math.ceil((PING_SAMPLE_COOLDOWN_MS - (now - last)) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    diagnosticLog("ping_cooldown", { retryAfter });
    return res.status(429).json({ error: "Rate limit: 1 ping per 30 s.", retryAfter });
  }
  pingSampleLastCall.set(ip, now);
  next();
}

// Rate limit for DNS benchmark: 1 call / 10 s per IP
const dnsBenchmarkLastCall = new Map<string, number>();
const DNS_BENCHMARK_COOLDOWN_MS = 10_000;

function dnsBenchmarkRateLimit(req: any, res: any, next: any) {
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ?? req.ip ?? "unknown";
  const now = Date.now();
  const last = dnsBenchmarkLastCall.get(ip) ?? 0;
  if (now - last < DNS_BENCHMARK_COOLDOWN_MS) {
    const retryAfter = Math.ceil((DNS_BENCHMARK_COOLDOWN_MS - (now - last)) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "Rate limit: 1 DNS benchmark per 10 s.", retryAfter });
  }
  dnsBenchmarkLastCall.set(ip, now);
  next();
}

interface PingTarget { host: string; port: number; label: string; }

const TARGETS: PingTarget[] = [
  { host: "1.1.1.1", port: 80, label: "Cloudflare" },
  { host: "8.8.8.8", port: 53, label: "Google" },
  { host: "208.67.222.222", port: 53, label: "OpenDNS" },
];

const DNS_PROVIDERS = [
  { id: "cloudflare", label: "Cloudflare", ip: "1.1.1.1", port: 53 },
  { id: "google",     label: "Google",     ip: "8.8.8.8",        port: 53 },
  { id: "quad9",      label: "Quad9",      ip: "9.9.9.9",        port: 53 },
  { id: "opendns",    label: "OpenDNS",    ip: "208.67.222.222", port: 53 },
  { id: "adguard",    label: "AdGuard",    ip: "94.140.14.14",   port: 53 },
] as const;

const DNS_PROBE_COUNT = 5;
const DNS_PROBE_TIMEOUT_MS = 1500;
const DNS_PROBE_STAGGER_MS = 90;
const DNS_BENCHMARK_CACHE_MS = 5_000;
let dnsBenchmarkCache: { results: Awaited<ReturnType<typeof benchmarkProvider>>[]; ts: number } | null = null;

function tcpPing(host: string, port: number, timeoutMs = 2000): Promise<number | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (ms: number | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ms);
    };

    const wall = setTimeout(() => finish(null), timeoutMs);

    socket.connect(port, host, () => {
      clearTimeout(wall);
      finish(parseFloat((performance.now() - start).toFixed(2)));
    });
    socket.on("error",   () => { clearTimeout(wall); finish(null); });
    socket.on("timeout", () => { clearTimeout(wall); finish(null); });
  });
}

async function collectSamples(count: number): Promise<{
  avg: number; min: number; max: number; jitter: number; loss: number; samples: number[];
}> {
  const raw: Array<number | null> = [];
  for (let i = 0; i < count; i++) {
    const target = TARGETS[i % TARGETS.length];
    raw.push(await tcpPing(target.host, target.port));
    if (i < count - 1) await new Promise(r => setTimeout(r, 200));
  }
  const valid = raw.filter((v): v is number => v !== null);
  if (valid.length === 0) return { avg: 0, min: 0, max: 0, jitter: 0, loss: 100, samples: [] };

  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const jitter = valid.length > 1
    ? valid.reduce((s, v) => s + Math.abs(v - avg), 0) / valid.length : 0;
  const loss = ((raw.length - valid.length) / raw.length) * 100;

  return {
    avg: parseFloat(avg.toFixed(1)),
    min: parseFloat(min.toFixed(1)),
    max: parseFloat(max.toFixed(1)),
    jitter: parseFloat(jitter.toFixed(1)),
    loss: parseFloat(loss.toFixed(0)),
    samples: valid.map(v => parseFloat(v.toFixed(1))),
  };
}

// Benchmark a single provider using TCP connect latency to its DNS port.
// This is deliberately not a DNS query benchmark: it measures reachability and
// transport latency, while resolver/cache/query performance is not measured.
async function benchmarkProvider(provider: typeof DNS_PROVIDERS[number]) {
  const raw: Array<number | null> = [];
  for (let i = 0; i < DNS_PROBE_COUNT; i++) {
    raw.push(await tcpPing(provider.ip, provider.port, DNS_PROBE_TIMEOUT_MS));
    if (i < DNS_PROBE_COUNT - 1) await new Promise(r => setTimeout(r, DNS_PROBE_STAGGER_MS));
  }

  const valid = raw.filter((v): v is number => v !== null);
  const loss = Math.round(((raw.length - valid.length) / raw.length) * 100);

  if (valid.length === 0) {
    return {
      id: provider.id, label: provider.label, ip: provider.ip,
      avg: 9999, median: 9999, min: 9999, max: 9999,
      jitter: 9999, loss: 100, stabilityScore: 0,
    };
  }

  // Trim outliers when ≥4 samples
  const sorted = [...valid].sort((a, b) => a - b);
  const trimmed = valid.length >= 4 ? sorted.slice(1, -1) : sorted;

  const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  const mid = Math.floor(trimmed.length / 2);
  const median = trimmed.length % 2 === 0
    ? (trimmed[mid - 1] + trimmed[mid]) / 2
    : trimmed[mid];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const jitter = trimmed.length > 1
    ? trimmed.reduce((s, v) => s + Math.abs(v - avg), 0) / trimmed.length
    : 0;

  // Stability score: jitter ratio and packet loss both penalise
  const jitterRatio = avg > 0 ? jitter / avg : 0;
  const stabilityScore = Math.max(0, Math.min(100, Math.round(100 - jitterRatio * 60 - loss * 1.5)));

  return {
    id: provider.id, label: provider.label, ip: provider.ip,
    avg:    parseFloat(avg.toFixed(1)),
    median: parseFloat(median.toFixed(1)),
    min:    parseFloat(min.toFixed(1)),
    max:    parseFloat(max.toFixed(1)),
    jitter: parseFloat(jitter.toFixed(1)),
    loss,
    stabilityScore,
  };
}

type BenchmarkBaselineEntry = {
  avg: number; min: number; max: number; jitter: number; loss: number; ts: number;
};
const benchmarkBaselineMap = new Map<string, BenchmarkBaselineEntry>();

function getClientUserKey(req: any): string {
  return req.cloudUser?.id ?? "unknown-user";
}

router.get("/ping-sample", pingRateLimit, async (_req, res) => {
  diagnosticLog("ping_started");
  try {
    const result = await collectSamples(3);
    diagnosticLog("ping_completed", { loss: result.loss, partial: result.loss > 0 });
    res.json({ ...result, ts: Date.now() });
  } catch (err) {
    diagnosticLog("ping_failed", { error: err instanceof Error ? err.message : "Sampling failed" });
    res.status(500).json({ error: "Sampling failed" });
  }
});

router.post("/benchmark/baseline", async (req, res) => {
  const userKey = getClientUserKey(req);
  try {
    diagnosticLog("benchmark_started", { phase: "baseline" });
    const result = await collectSamples(8);
    const entry: BenchmarkBaselineEntry = { ...result, ts: Date.now() };
    benchmarkBaselineMap.set(userKey, entry);
    diagnosticLog("benchmark_completed", { phase: "baseline", loss: result.loss, partial: result.loss > 0 });
    res.json(entry);
  } catch (err) {
    diagnosticLog("benchmark_failed", { phase: "baseline", error: err instanceof Error ? err.message : "Baseline sampling failed" });
    res.status(500).json({ error: "Baseline sampling failed" });
  }
});

router.get("/benchmark/compare", async (req, res) => {
  const userKey = getClientUserKey(req);
  const baseline = benchmarkBaselineMap.get(userKey);
  if (!baseline) return res.status(400).json({ error: "No baseline recorded" });
  try {
    diagnosticLog("benchmark_started", { phase: "comparison" });
    const after = await collectSamples(8);
    const before = baseline;
    const deltaLabel = (b: number, a: number, threshold = 1): "improved" | "unchanged" | "worse" => {
      const diff = a - b;
      if (Math.abs(diff) < threshold) return "unchanged";
      return diff < 0 ? "improved" : "worse";
    };
    const response = {
      before: { avg: before.avg, min: before.min, max: before.max, jitter: before.jitter, loss: before.loss },
      after: { avg: after.avg, min: after.min, max: after.max, jitter: after.jitter, loss: after.loss },
      verdict: {
        latency: deltaLabel(before.avg, after.avg, 1),
        jitter: deltaLabel(before.jitter, after.jitter, 0.5),
        loss: deltaLabel(before.loss, after.loss, 0.5),
      },
      ts: Date.now(),
    };
    diagnosticLog("benchmark_completed", { phase: "comparison", partial: after.loss > 0 });
    res.json(response);
  } catch (err) {
    diagnosticLog("benchmark_failed", { phase: "comparison", error: err instanceof Error ? err.message : "Comparison failed" });
    res.status(500).json({ error: "Comparison failed" });
  }
});

router.get("/pc-vs-internet", async (_req, res) => {
  diagnosticLog("pc_vs_internet_started");
  try {
    const [r1a, r1b, r2a, r2b] = await Promise.all([
      tcpPing("1.1.1.1", 80),
      tcpPing("1.1.1.1", 80),
      tcpPing("8.8.8.8", 53),
      tcpPing("8.8.8.8", 53),
    ]);

    const cf = [r1a, r1b].filter((v): v is number => v !== null);
    const goog = [r2a, r2b].filter((v): v is number => v !== null);

    if (cf.length === 0 && goog.length === 0) {
      const response = {
        cloudflare: null, google: null, providerVariance: 0,
        verdict: "offline", explanation: "No external hosts reachable. Check your network connection.", confidence: "high", ts: Date.now(),
      };
      diagnosticLog("pc_vs_internet_completed", { verdict: response.verdict, partial: true });
      return res.json(response);
    }

    const cfAvg = cf.length ? parseFloat((cf.reduce((a, b) => a + b, 0) / cf.length).toFixed(1)) : null;
    const googAvg = goog.length ? parseFloat((goog.reduce((a, b) => a + b, 0) / goog.length).toFixed(1)) : null;
    const cfJitter = cf.length === 2 ? parseFloat(Math.abs(cf[0] - cf[1]).toFixed(1)) : 0;
    const googJitter = goog.length === 2 ? parseFloat(Math.abs(goog[0] - goog[1]).toFixed(1)) : 0;
    const providerVariance = cfAvg && googAvg ? parseFloat(Math.abs(cfAvg - googAvg).toFixed(1)) : 0;
    const avgJitter = parseFloat(((cfJitter + googJitter) / 2).toFixed(1));

    let verdict: "stable" | "local_issue" | "internet_issue" | "mixed" | "offline";
    let explanation: string;
    let confidence: "low" | "medium" | "high";

    if (cfAvg && googAvg) {
      if (cfAvg < 40 && googAvg < 40 && providerVariance < 15 && avgJitter < 10) {
        verdict = "stable"; confidence = "high";
        explanation = "Both independent providers respond quickly and consistently. Your network path appears healthy from this measurement.";
      } else if (providerVariance > 35) {
        verdict = "internet_issue"; confidence = "medium";
        explanation = "Large variance between Cloudflare and Google points to external routing inconsistency — likely ISP-side or upstream congestion between you and these providers.";
      } else if (avgJitter > 20 && providerVariance < 20) {
        verdict = "local_issue"; confidence = "medium";
        explanation = "High intra-provider jitter with low cross-provider variance suggests local instability — possibly WiFi interference, NIC driver issues, or OS scheduling delays affecting the network stack.";
      } else if ((cfAvg + googAvg) / 2 > 100) {
        verdict = "mixed"; confidence = "low";
        explanation = "Both providers show elevated latency. Physical distance to servers, ISP congestion, or high system load could each be a contributing factor. No single clear cause from this data.";
      } else {
        verdict = "stable"; confidence = "medium";
        explanation = "Latency and consistency are within normal range. No obvious instability detected from this measurement vantage.";
      }
    } else {
      verdict = "mixed"; confidence = "low";
      explanation = "Partial connectivity — one provider was unreachable. Not enough data to draw a reliable conclusion.";
    }

    diagnosticLog("pc_vs_internet_completed", { verdict, partial: !cfAvg || !googAvg });
    res.json({ cloudflare: cfAvg, google: googAvg, providerVariance, verdict, explanation, confidence, ts: Date.now() });
  } catch (err) {
    diagnosticLog("pc_vs_internet_failed", { error: err instanceof Error ? err.message : "Diagnostic failed" });
    res.status(500).json({ error: "Diagnostic failed" });
  }
});

// ─── DNS Optimizer: 5-provider intelligent benchmark ─────────────────────────

router.get("/dns-benchmark", dnsBenchmarkRateLimit, async (_req, res) => {
  diagnosticLog("dns_benchmark_started");
  try {
    // All 5 providers run in parallel; share a very short result cache so
    // concurrent dashboard requests do not multiply the network probes.
    let results: Awaited<ReturnType<typeof benchmarkProvider>>[];
    if (dnsBenchmarkCache && Date.now() - dnsBenchmarkCache.ts < DNS_BENCHMARK_CACHE_MS) {
      results = dnsBenchmarkCache.results;
    } else {
      results = await Promise.all(DNS_PROVIDERS.map(p => benchmarkProvider(p)));
      dnsBenchmarkCache = { results, ts: Date.now() };
    }

    const alive = results.filter(p => p.loss < 100);

    // Rank by average latency (ascending)
    const ranked = [...results].sort((a, b) => a.avg - b.avg);

    // Composite score for recommendation
    const scored = alive.map(p => {
      const latencyScore  = Math.max(0, 100 - p.avg * 0.8);
      const jitterScore   = Math.max(0, 100 - p.jitter * 6);
      const lossScore     = Math.max(0, 100 - p.loss * 8);
      const stabilityBonus = p.stabilityScore;
      const composite = latencyScore * 0.40 + jitterScore * 0.30 + lossScore * 0.20 + stabilityBonus * 0.10;
      return { ...p, composite };
    }).sort((a, b) => b.composite - a.composite);

    const recommended = scored[0]?.id ?? null;
    const rec = results.find(p => p.id === recommended);

    // Build reasons for recommendation
    const recommendedReasons: string[] = [];
    if (rec && alive.length > 0) {
      const byAvg    = [...alive].sort((a, b) => a.avg - b.avg);
      const byJitter = [...alive].sort((a, b) => a.jitter - b.jitter);
      const byStab   = [...alive].sort((a, b) => b.stabilityScore - a.stabilityScore);
      if (byAvg[0]?.id === recommended)    recommendedReasons.push("Lowest average latency");
      if (byJitter[0]?.id === recommended) recommendedReasons.push("Lowest jitter");
      if (byStab[0]?.id === recommended)   recommendedReasons.push("Highest stability score");
      if (rec.loss === 0)                  recommendedReasons.push("Zero packet loss");
      if (rec.median < byAvg[0].avg * 0.95) recommendedReasons.push("Best median response time");
    }
    if (recommendedReasons.length === 0) {
      recommendedReasons.push(alive.length ? "Best overall composite score" : "No DNS provider was reachable");
    }

    // Category winners
    const byAvg    = alive.length ? [...alive].sort((a, b) => a.avg    - b.avg)   : results;
    const byJitter = alive.length ? [...alive].sort((a, b) => a.jitter - b.jitter) : results;
    const byStab   = alive.length ? [...alive].sort((a, b) => b.stabilityScore - a.stabilityScore) : results;
    const byGaming = alive.length
      ? [...alive].sort((a, b) => (a.avg * 0.55 + a.jitter * 0.45) - (b.avg * 0.55 + b.jitter * 0.45))
      : results;

    const categoryWinners = {
      bestOverall:    scored[0]?.id ?? "",
      lowestLatency:  byAvg[0]?.id ?? "",
      lowestJitter:   byJitter[0]?.id ?? "",
      mostStable:     byStab[0]?.id ?? "",
      bestGaming:     byGaming[0]?.id ?? "",
    };

    // Confidence derived from probe consistency
    const avgLoss = alive.length > 0 ? alive.reduce((s, p) => s + p.loss, 0) / alive.length : 100;
    const allAlive = alive.length === DNS_PROVIDERS.length;
    const topJitter = scored[0]?.jitter ?? 999;

    let confidence: "very_high" | "high" | "medium" | "low";
    if (allAlive && avgLoss === 0 && topJitter < 5)       confidence = "very_high";
    else if (alive.length >= 4 && avgLoss < 20)           confidence = "high";
    else if (alive.length >= 3)                            confidence = "medium";
    else                                                   confidence = "low";

    const providers = ranked.map((p, i) => ({ ...p, rank: i + 1 }));

    const response = {
      providers,
      recommended,
      recommendedReasons,
      confidence,
      categoryWinners,
      // Explicitly document the measurement so callers do not present TCP
      // connect time as DNS lookup latency.
      measurement: "tcp-connect-to-dns-port",
      inconclusive: alive.length === 0,
      ts: Date.now(),
    };
    diagnosticLog("dns_benchmark_completed", { providers: providers.length, partial: alive.length < DNS_PROVIDERS.length });
    res.json(response);
  } catch (err) {
    diagnosticLog("dns_benchmark_failed", { error: err instanceof Error ? err.message : "DNS benchmark failed" });
    res.status(500).json({ error: "DNS benchmark failed" });
  }
});

export default router;
