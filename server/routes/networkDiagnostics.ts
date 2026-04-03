import { Router } from "express";
import * as net from "net";
import { performance } from "perf_hooks";

const router = Router();

interface PingTarget { host: string; port: number; label: string; }

const TARGETS: PingTarget[] = [
  { host: "1.1.1.1", port: 80, label: "Cloudflare" },
  { host: "8.8.8.8", port: 53, label: "Google" },
  { host: "208.67.222.222", port: 53, label: "OpenDNS" },
];

function tcpPing(host: string, port: number, timeoutMs = 1500): Promise<number | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.connect(port, host, () => {
      const ms = parseFloat((performance.now() - start).toFixed(2));
      socket.destroy();
      resolve(ms);
    });
    socket.on("timeout", () => { socket.destroy(); resolve(null); });
    socket.on("error", () => { socket.destroy(); resolve(null); });
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

let benchmarkBaseline: {
  avg: number; min: number; max: number; jitter: number; loss: number; ts: number;
} | null = null;

router.get("/ping-sample", async (_req, res) => {
  try {
    const result = await collectSamples(3);
    res.json({ ...result, ts: Date.now() });
  } catch {
    res.status(500).json({ error: "Sampling failed" });
  }
});

router.post("/benchmark/baseline", async (_req, res) => {
  try {
    const result = await collectSamples(8);
    benchmarkBaseline = { ...result, ts: Date.now() };
    res.json(benchmarkBaseline);
  } catch {
    res.status(500).json({ error: "Baseline sampling failed" });
  }
});

router.get("/benchmark/compare", async (_req, res) => {
  if (!benchmarkBaseline) return res.status(400).json({ error: "No baseline recorded" });
  try {
    const after = await collectSamples(8);
    const before = benchmarkBaseline;
    const deltaLabel = (b: number, a: number, threshold = 1): "improved" | "unchanged" | "worse" => {
      const diff = a - b;
      if (Math.abs(diff) < threshold) return "unchanged";
      return diff < 0 ? "improved" : "worse";
    };
    res.json({
      before: { avg: before.avg, min: before.min, max: before.max, jitter: before.jitter, loss: before.loss },
      after: { avg: after.avg, min: after.min, max: after.max, jitter: after.jitter, loss: after.loss },
      verdict: {
        latency: deltaLabel(before.avg, after.avg, 1),
        jitter: deltaLabel(before.jitter, after.jitter, 0.5),
        loss: deltaLabel(before.loss, after.loss, 0.5),
      },
      ts: Date.now(),
    });
  } catch {
    res.status(500).json({ error: "Comparison failed" });
  }
});

router.get("/pc-vs-internet", async (_req, res) => {
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
      return res.json({
        cloudflare: null, google: null, providerVariance: 0,
        verdict: "offline", explanation: "No external hosts reachable. Check your network connection.", confidence: "high", ts: Date.now(),
      });
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
        verdict = "stable";
        explanation = "Both independent providers respond quickly and consistently. Your network path appears healthy from this measurement.";
        confidence = "high";
      } else if (providerVariance > 35) {
        verdict = "internet_issue";
        explanation = "Large variance between Cloudflare and Google points to external routing inconsistency — likely ISP-side or upstream congestion between you and these providers.";
        confidence = "medium";
      } else if (avgJitter > 20 && providerVariance < 20) {
        verdict = "local_issue";
        explanation = "High intra-provider jitter with low cross-provider variance suggests local instability — possibly WiFi interference, NIC driver issues, or OS scheduling delays affecting the network stack.";
        confidence = "medium";
      } else if ((cfAvg + googAvg) / 2 > 100) {
        verdict = "mixed";
        explanation = "Both providers show elevated latency. Physical distance to servers, ISP congestion, or high system load could each be a contributing factor. No single clear cause from this data.";
        confidence = "low";
      } else {
        verdict = "stable";
        explanation = "Latency and consistency are within normal range. No obvious instability detected from this measurement vantage.";
        confidence = "medium";
      }
    } else {
      verdict = "mixed";
      explanation = "Partial connectivity — one provider was unreachable. Not enough data to draw a reliable conclusion.";
      confidence = "low";
    }

    res.json({ cloudflare: cfAvg, google: googAvg, providerVariance, verdict, explanation, confidence, ts: Date.now() });
  } catch {
    res.status(500).json({ error: "Diagnostic failed" });
  }
});

export default router;
