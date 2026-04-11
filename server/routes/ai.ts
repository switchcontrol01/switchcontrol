import { Router, Request, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import crypto from "crypto";

const aiRouter = Router();

// ---------------------------------------------------------------------------
// Rate limiters — keyed by authenticated cloudUser.id from JWT middleware
// ---------------------------------------------------------------------------

const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req: Request) => {
    if ((req as any).cloudUser?.id) return `cloud:${(req as any).cloudUser.id}`;
    const raw = req.headers["x-device-id"] as string | undefined;
    if (raw && raw.length >= 16 && raw.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(raw)) return `device:${raw}`;
    return req.ip || req.socket?.remoteAddress || "fallback";
  },
  message: { error: "Too many AI requests. Please wait a few minutes.", retryAfterSeconds: 300 },
});

const aiHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req: Request) => {
    if ((req as any).cloudUser?.id) return `hourly:cloud:${(req as any).cloudUser.id}`;
    const raw = req.headers["x-device-id"] as string | undefined;
    if (raw && raw.length >= 16 && raw.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(raw)) return `hourly:device:${raw}`;
    return `hourly:${req.ip || req.socket?.remoteAddress || "fallback"}`;
  },
  message: { error: "Hourly AI request limit reached. Please try again later.", retryAfterSeconds: 3600 },
});

aiRouter.use(aiLimiter);
aiRouter.use(aiHourlyLimiter);

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const responseCache = new Map<string, { data: AiAdviceResponse; expiresAt: number }>();

function getCacheKey(body: any): string {
  const normalized = JSON.stringify({
    goal: body.goal,
    game: body.game,
    system: body.system,
    telemetry: body.telemetry,
    enabledTweaks: body.enabledTweaks || [],
    disabledTweaks: body.disabledTweaks || [],
  });
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function getCached(key: string): AiAdviceResponse | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { responseCache.delete(key); return null; }
  return entry.data;
}

function setCache(key: string, data: AiAdviceResponse): void {
  const CACHE_TTL = 10 * 60 * 1000;
  responseCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
  if (responseCache.size > 200) {
    const now = Date.now();
    Array.from(responseCache.entries()).forEach(([k, v]) => { if (now > v.expiresAt) responseCache.delete(k); });
  }
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const goalEnum = z.enum(["lowest_latency", "max_fps", "stability", "network_ping", "balanced"]);

const systemSchema = z.object({
  cpu: z.string().min(1).max(200),
  gpu: z.string().min(1).max(200),
  motherboard: z.string().max(200).default("Unknown"),
  ram: z.string().min(1).max(200),
  storage: z.string().max(200).default("Unknown"),
  os: z.string().max(200).default("Windows"),
  display: z.string().max(200).default("Unknown"),
  network: z.string().max(200).default("Unknown"),
  notes: z.string().max(500).default(""),
});

const telemetrySchema = z.object({
  cpuTempC: z.number().nullable().default(null),
  gpuTempC: z.number().nullable().default(null),
  ramUsedGB: z.number().nullable().default(null),
  ramTotalGB: z.number().nullable().default(null),
  cpuLoadPct: z.number().nullable().default(null),
  gpuLoadPct: z.number().nullable().default(null),
  vramUsedMb: z.number().nullable().default(null),
  vramTotalMb: z.number().nullable().default(null),
  vramPercent: z.number().nullable().default(null),
  networkRxKbps: z.number().nullable().default(null),
  networkTxKbps: z.number().nullable().default(null),
  loadTrend: z.enum(["rising", "falling", "stable"]).nullable().default(null),
  avgFps: z.number().nullable().default(null),
  pingMs: z.number().nullable().default(null),
});

const tweakItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  risk: z.string(),
});

const adviceRequestSchema = z.object({
  goal: goalEnum,
  game: z.string().min(1).max(100),
  system: systemSchema,
  telemetry: telemetrySchema.default({}),
  enabledTweaks: z.array(tweakItemSchema).default([]),
  disabledTweaks: z.array(tweakItemSchema).default([]),
});

export type AdviceRequest = z.infer<typeof adviceRequestSchema> & {
  userPlan?: string;
  trialEndsAt?: string | null;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiFinding {
  title: string;
  evidence: string;
  severity: "low" | "med" | "high";
}

export interface AiAction {
  title: string;
  why: string;
  steps: string[];
  risk: "low" | "med" | "high";
  reversible: boolean;
  expectedGain: string;
  confidence: "low" | "med" | "high";
  autoApplyPossible: boolean;
  tweakId?: string;
  currentIssue?: string;
}

export type UserState = "new" | "partial" | "over_tweaked" | "goal_focused" | "advanced";

export interface AiAdviceResponse {
  summary: string;
  userState: UserState;
  readinessScore: number;
  topFindings: AiFinding[];
  actions: AiAction[];
  warnings: string[];
  followUps: string[];
}

// ---------------------------------------------------------------------------
// Chat structured response types (enforced at backend — NOT freeform text)
// ---------------------------------------------------------------------------

export interface DiagnosticFinding {
  problem: string;
  cause: string;
  impact: string;
  fix: string;
  confidence: "high" | "medium" | "low";
  tweakId?: string;
}

export type ChatStructuredResponse =
  | { type: "diagnostic"; findings: DiagnosticFinding[] }
  | { type: "answer"; summary: string; detail?: string };

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are SwitchControl AI Advisor — an expert Windows gaming PC optimization consultant.

You are analyzing a user's CURRENT SwitchControl configuration state. You know which tweaks they have enabled and which are still disabled. Use this to give state-aware advice.

USER STATE CLASSIFICATION (you must pick one):
- "new": Few or no tweaks enabled, needs full guidance
- "partial": Some tweaks enabled but major gaps remain
- "over_tweaked": Too many conflicting tweaks enabled, some may hurt performance
- "goal_focused": User optimizing for specific game/goal, mostly aligned
- "advanced": Most tweaks already optimized, fine-tuning only

RULES:
1. You MUST reference the user's ACTUAL hardware (CPU model, GPU model, RAM amount) at least 3 times. Never say "your CPU" — say the actual model name.
2. Every recommendation must be evidence-based and specific to their hardware, goal, AND current tweak state. No generic filler like "keep your drivers updated" or "close background apps."
3. If the user has tweaks disabled that would help their goal, recommend enabling them.
4. If the user has conflicting tweaks enabled, warn about conflicts.
5. Prefer reversible actions over irreversible ones. Always mark risk honestly.
6. Do NOT guess BIOS menu names or paths — different motherboards use different naming. Say "check your BIOS for [feature]" rather than inventing menu paths.
7. Rank all actions by expected performance impact (highest impact first).
8. Output ONLY valid JSON matching this exact schema (no markdown, no code fences):
{
  "summary": "1-2 sentences max — state the user's current optimization status concisely",
  "userState": "new|partial|over_tweaked|goal_focused|advanced",
  "readinessScore": 0-100,
  "topFindings": [
    { "title": "short title, max 60 chars", "evidence": "one sentence max, max 100 chars", "severity": "low|med|high" }
  ],
  "actions": [
    {
      "title": "specific action name, max 60 chars",
      "why": "one sentence max, max 100 chars",
      "currentIssue": "one sentence max, max 100 chars",
      "steps": ["step 1 — max 100 chars", "step 2 — max 100 chars"],
      "risk": "low|med|high",
      "reversible": true,
      "expectedGain": "short label only, max 50 chars, e.g. lower latency, +5% FPS",
      "confidence": "low|med|high",
      "autoApplyPossible": true,
      "tweakId": "matching_tweak_id_if_applicable"
    }
  ],
  "warnings": ["one sentence per warning, max 100 chars"],
  "followUps": ["one sentence per followUp, max 80 chars"]
}
9. Provide EXACTLY 1-3 findings and 1-3 actions (no more). Surface only the highest-impact issues. Quality over quantity.
10. For actions that correspond to SwitchControl tweaks, set autoApplyPossible=true and include the tweakId.
11. For BIOS changes, dangerous registry edits, or motherboard-specific tweaks, set autoApplyPossible=false.
12. Steps must be concrete Windows instructions. Maximum 2 steps per action.
13. Risk assessment must be honest — if something could cause instability, say "high".
14. readinessScore: 0 = completely unoptimized, 100 = fully optimized for their goal.
15. If telemetry shows thermal issues (CPU >85°C or GPU >90°C), prioritize thermal advice first.
16. Tailor advice to the game specified — different games need different optimizations.
17. Do NOT recommend tweaks that are already enabled unless they should be disabled.
18. Never recommend specific overclock values, voltage adjustments, or frequency numbers.
19. Every string field must be a SINGLE sentence. No bullet lists inside fields. No paragraphs.`;

function buildUserPrompt(data: AdviceRequest): string {
  const t = data.telemetry;

  // Build a rich telemetry block with all available data
  const telemetryLines: string[] = [];
  if (t.cpuLoadPct !== null) {
    const trendTag = t.loadTrend ? ` [${t.loadTrend}]` : "";
    telemetryLines.push(`CPU Load: ${t.cpuLoadPct}%${trendTag}`);
  }
  if (t.cpuTempC !== null) telemetryLines.push(`CPU Temp: ${t.cpuTempC}°C${t.cpuTempC > 85 ? " ⚠️ HIGH" : t.cpuTempC > 75 ? " warm" : ""}`);
  if (t.gpuLoadPct !== null) telemetryLines.push(`GPU Load: ${t.gpuLoadPct}%`);
  if (t.gpuTempC !== null) telemetryLines.push(`GPU Temp: ${t.gpuTempC}°C${t.gpuTempC > 90 ? " ⚠️ HIGH" : t.gpuTempC > 80 ? " warm" : ""}`);
  if (t.vramUsedMb !== null && t.vramTotalMb !== null) {
    const pct = t.vramPercent != null ? ` (${t.vramPercent}%)` : "";
    telemetryLines.push(`VRAM: ${(t.vramUsedMb / 1024).toFixed(1)} / ${(t.vramTotalMb / 1024).toFixed(1)} GB${pct}${t.vramPercent != null && t.vramPercent > 90 ? " ⚠️ NEAR LIMIT" : ""}`);
  }
  if (t.ramUsedGB !== null) {
    const ramTotal = t.ramTotalGB != null ? ` / ${t.ramTotalGB} GB` : "";
    telemetryLines.push(`RAM Used: ${t.ramUsedGB} GB${ramTotal}`);
  }
  if (t.networkRxKbps !== null || t.networkTxKbps !== null) {
    const rx = t.networkRxKbps != null ? `↓${(t.networkRxKbps / 1024).toFixed(1)} MB/s` : "";
    const tx = t.networkTxKbps != null ? `↑${(t.networkTxKbps / 1024).toFixed(1)} MB/s` : "";
    telemetryLines.push(`Network: ${[rx, tx].filter(Boolean).join(" ")}`);
  }
  if (t.avgFps !== null) telemetryLines.push(`Avg FPS: ${t.avgFps}`);
  if (t.pingMs !== null) telemetryLines.push(`Ping: ${t.pingMs} ms`);

  // Derived bottleneck hints from telemetry
  const bottleneckHints: string[] = [];
  if (t.cpuLoadPct != null && t.gpuLoadPct != null) {
    if (t.cpuLoadPct > 85 && t.gpuLoadPct < 60) bottleneckHints.push("CPU-bound: CPU saturated while GPU underutilized — classic CPU bottleneck");
    if (t.gpuLoadPct > 95 && t.cpuLoadPct < 60) bottleneckHints.push("GPU-bound: GPU at capacity — upgrades or settings reduction needed");
  }
  if (t.vramPercent != null && t.vramPercent > 90) bottleneckHints.push("VRAM pressure: near limit, possible texture thrashing and frame pacing issues");
  if (t.cpuTempC != null && t.cpuTempC > 85) bottleneckHints.push("CPU thermal throttling likely — cooling or power plan change recommended");
  if (t.gpuTempC != null && t.gpuTempC > 90) bottleneckHints.push("GPU thermal throttling risk — check airflow and GPU fan curve");

  const enabledList = data.enabledTweaks.length > 0
    ? data.enabledTweaks.map(t => `- [ENABLED] ${t.title} (${t.category}, risk: ${t.risk}, id: ${t.id})`).join("\n")
    : "No tweaks currently enabled.";

  const disabledHighImpact = data.disabledTweaks.slice(0, 20);
  const disabledList = disabledHighImpact.length > 0
    ? disabledHighImpact.map(t => `- [DISABLED] ${t.title} (${t.category}, risk: ${t.risk}, id: ${t.id})`).join("\n")
    : "All available tweaks are enabled.";

  const planLine = data.userPlan
    ? `USER ACCOUNT: ${data.userPlan === "trial" && data.trialEndsAt
        ? `Trial (expires ${new Date(data.trialEndsAt).toLocaleString()})`
        : data.userPlan.charAt(0).toUpperCase() + data.userPlan.slice(1)}`
    : null;

  return `OPTIMIZATION GOAL: ${data.goal}
TARGET GAME: ${data.game}
${planLine ? planLine + "\n" : ""}
SYSTEM SPECS:
- CPU: ${data.system.cpu}
- GPU: ${data.system.gpu}
- Motherboard: ${data.system.motherboard}
- RAM: ${data.system.ram}
- Storage: ${data.system.storage}
- OS: ${data.system.os}
- Display: ${data.system.display}
- Network: ${data.system.network}
${data.system.notes ? `- Notes: ${data.system.notes}` : ""}

SWITCHCONTROL TWEAK STATE (${data.enabledTweaks.length} enabled, ${data.disabledTweaks.length} available but disabled):

ENABLED TWEAKS:
${enabledList}

KEY DISABLED TWEAKS:
${disabledList}

${telemetryLines.length > 0
  ? `LIVE TELEMETRY (real-time snapshot):\n${telemetryLines.map(l => `- ${l}`).join("\n")}`
  : "NO TELEMETRY DATA AVAILABLE"}

${bottleneckHints.length > 0
  ? `DETECTED BOTTLENECKS / ANOMALIES:\n${bottleneckHints.map(h => `- ${h}`).join("\n")}\n`
  : ""}
Analyze this system configuration and current tweak state. Provide state-aware optimization advice as JSON.`;
}

const CHAT_SYSTEM_PROMPT = `You are SwitchControl AI Advisor — a Windows gaming PC diagnosis engine.

You are NOT a chatbot. You do NOT write paragraphs. You do NOT explain at length. You diagnose, and you state findings precisely.

You MUST return a JSON object matching EXACTLY one of these two schemas. No other format is accepted. No markdown. No code fences. No preamble.

SCHEMA A — Diagnostic (use for: FPS, latency, stutters, bottlenecks, tweaks, BIOS, network, system performance):
{
  "type": "diagnostic",
  "findings": [
    {
      "problem": "<single sentence, max 95 chars — what is currently wrong>",
      "cause": "<single sentence, max 95 chars — root cause>",
      "impact": "<single sentence, max 95 chars — how this affects gaming>",
      "fix": "<single sentence, max 95 chars — specific corrective action>",
      "confidence": "high" | "medium" | "low",
      "tweakId": "<omit if not applicable — SwitchControl tweak ID if fix maps to one>"
    }
  ]
}
Return 1 to 3 findings. Highest-impact finding first. Never more than 3.

SCHEMA B — Answer (use for: definitions, explanations, general knowledge, "what is X" questions):
{
  "type": "answer",
  "summary": "<one sentence, max 140 chars>",
  "detail": "<optional, max 2 sentences, max 240 chars total>"
}

STRICT RULES:
1. Every string field is one sentence only. No embedded newlines. No bullet points inside fields.
2. Be assertive: say "CPU scheduling is causing frame drops" not "CPU scheduling may be affecting your frames."
3. Use actual hardware model names from the user's system — not "your CPU" but the real model.
4. Confidence is factual: if you have clear evidence say "high", if inferred say "medium", if uncertain say "low."
5. Do not explain your reasoning inside field text. State the finding, not how you found it.
6. Do not hedge with "you may want to" or "it might be worth" — be direct.
7. Return ONLY the JSON object. Nothing before it. Nothing after it.`;

// ---------------------------------------------------------------------------
// Chat response validation + field truncation
// ---------------------------------------------------------------------------

function truncateChatField(s: unknown, max: number): string {
  if (!s || typeof s !== "string") return "";
  const clean = s.trim().replace(/[\n\r]+/g, " ").replace(/\s{2,}/g, " ");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSentence = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  return lastSentence > max * 0.55 ? cut.slice(0, lastSentence + 1) : cut.trimEnd() + "…";
}

function validateChatResponse(raw: unknown): ChatStructuredResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (obj.type === "diagnostic") {
    if (!Array.isArray(obj.findings) || obj.findings.length === 0) return null;
    const conf = ["high", "medium", "low"] as const;
    const findings: DiagnosticFinding[] = (obj.findings as unknown[])
      .slice(0, 3)
      .map((f: unknown) => {
        if (!f || typeof f !== "object") return null;
        const fi = f as Record<string, unknown>;
        const problem = truncateChatField(fi.problem, 95);
        const cause = truncateChatField(fi.cause, 95);
        const impact = truncateChatField(fi.impact, 95);
        const fix = truncateChatField(fi.fix, 95);
        if (!problem || !cause || !impact || !fix) return null;
        const confidence = conf.includes(fi.confidence as typeof conf[number])
          ? (fi.confidence as "high" | "medium" | "low")
          : "medium";
        const result: DiagnosticFinding = { problem, cause, impact, fix, confidence };
        if (typeof fi.tweakId === "string" && fi.tweakId.trim()) {
          result.tweakId = fi.tweakId.trim();
        }
        return result;
      })
      .filter((f): f is DiagnosticFinding => f !== null);
    if (findings.length === 0) return null;
    return { type: "diagnostic", findings };
  }

  if (obj.type === "answer") {
    const summary = truncateChatField(obj.summary, 140);
    if (!summary) return null;
    const detail = obj.detail ? truncateChatField(obj.detail, 240) : undefined;
    return { type: "answer", summary, ...(detail ? { detail } : {}) };
  }

  return null;
}

// Serialize a structured chat response back to plain text for history context
function structuredToHistoryText(s: ChatStructuredResponse): string {
  if (s.type === "answer") {
    return s.detail ? `${s.summary} ${s.detail}` : s.summary;
  }
  return s.findings
    .map((f, i) => `Finding ${i + 1}: ${f.problem} Cause: ${f.cause} Impact: ${f.impact} Fix: ${f.fix}`)
    .join(" | ");
}

function buildChatContext(context: any): string {
  const parts: string[] = [];
  if (context?.system) {
    const s = context.system;
    const specs = [s.cpu, s.gpu, s.ram, s.storage, s.os].filter(Boolean).join(" | ");
    if (specs) parts.push(`System: ${specs}`);
  }
  if (context?.enabledTweaks?.length > 0) {
    parts.push(`Enabled tweaks (${context.enabledTweaks.length}): ${context.enabledTweaks.slice(0, 10).map((t: any) => t.title).join(", ")}`);
  }
  if (context?.disabledTweaks?.length > 0) {
    parts.push(`Available but disabled (${context.disabledTweaks.length}): ${context.disabledTweaks.slice(0, 8).map((t: any) => t.title).join(", ")}`);
  }
  if (context?.telemetry) {
    const t = context.telemetry;
    const telParts: string[] = [];
    if (t.cpuLoadPct != null) {
      const trend = t.loadTrend ? ` [${t.loadTrend}]` : "";
      telParts.push(`CPU ${t.cpuLoadPct}%${trend}`);
    }
    if (t.cpuTempC != null) telParts.push(`CPU ${t.cpuTempC}°C${t.cpuTempC > 85 ? " ⚠️" : ""}`);
    if (t.gpuLoadPct != null) telParts.push(`GPU ${t.gpuLoadPct}%`);
    if (t.gpuTempC != null) telParts.push(`GPU ${t.gpuTempC}°C${t.gpuTempC > 90 ? " ⚠️" : ""}`);
    if (t.vramUsedMb != null && t.vramTotalMb != null) {
      const pct = t.vramPercent != null ? ` (${t.vramPercent}%)` : "";
      telParts.push(`VRAM ${(t.vramUsedMb / 1024).toFixed(1)}/${(t.vramTotalMb / 1024).toFixed(1)}GB${pct}${t.vramPercent != null && t.vramPercent > 90 ? " ⚠️" : ""}`);
    }
    if (t.ramUsedGB != null) {
      const total = t.ramTotalGB != null ? `/${t.ramTotalGB}GB` : "";
      telParts.push(`RAM ${t.ramUsedGB}${total}GB`);
    }
    if (t.networkRxKbps != null || t.networkTxKbps != null) {
      const rx = t.networkRxKbps != null ? `↓${(t.networkRxKbps / 1024).toFixed(1)}MB/s` : "";
      const tx = t.networkTxKbps != null ? `↑${(t.networkTxKbps / 1024).toFixed(1)}MB/s` : "";
      telParts.push(`Net ${[rx, tx].filter(Boolean).join(" ")}`);
    }
    if (telParts.length) parts.push(`Live telemetry: ${telParts.join(", ")}`);

    // Bottleneck detection for chat context
    if (t.cpuLoadPct != null && t.gpuLoadPct != null && t.cpuLoadPct > 85 && t.gpuLoadPct < 60) {
      parts.push("Active bottleneck: CPU-saturated, GPU underutilized");
    }
    if (t.vramPercent != null && t.vramPercent > 90) {
      parts.push("VRAM near limit — frame instability likely");
    }
  }
  return parts.length ? parts.join("\n") : "No system information available.";
}

// ---------------------------------------------------------------------------
// Helper: get OpenAI client (OPENAI_API_KEY lives on cloud server only)
// ---------------------------------------------------------------------------

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("AI service unavailable"), { _cloudConfigError: true });
  }
  return new OpenAI({ apiKey });
}

// ---------------------------------------------------------------------------
// POST /ai/chat
// ---------------------------------------------------------------------------

aiRouter.post("/chat", async (req: Request, res: Response) => {
  const cloudUser = (req as any).cloudUser as { id: string; isPremium: boolean } | undefined;
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  const ts = new Date().toISOString();

  console.log(`[AI:chat] ${ts} | user=${cloudUser?.id ?? "none"} premium=${cloudUser?.isPremium ?? false} | model=${model} | bearer=${!!req.headers.authorization}`);

  if (!cloudUser?.isPremium) {
    console.warn(`[AI:chat] FORBIDDEN | user=${cloudUser?.id ?? "none"} premium=false`);
    return res.status(403).json({ error: "Premium required." });
  }

  const { messages, context, imageData, imageType } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Messages are required." });
  }
  if (messages.length > 20) {
    return res.status(400).json({ error: "Conversation too long. Please start a new chat." });
  }

  // Validate optional image payload — must be non-empty base64 string
  const hasImage = typeof imageData === "string" && imageData.length > 10;
  console.log(`[AI:chat] hasImage=${hasImage} imageType=${imageType ?? "none"} imageLen=${typeof imageData === "string" ? imageData.length : 0}`);
  if (hasImage) {
    if (imageData.length > 7_000_000) {
      return res.status(400).json({ error: "Image too large. Maximum size is 5 MB." });
    }
    const supportedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!imageType || !supportedTypes.includes(String(imageType))) {
      return res.status(400).json({ error: "Unsupported image format. Use JPEG, PNG, GIF, or WebP." });
    }
  }

  let openai: OpenAI;
  try {
    openai = getOpenAI();
  } catch {
    console.error(`[AI:chat] OPENAI_API_KEY missing on cloud server`);
    return res.status(503).json({ error: "AI service is temporarily unavailable." });
  }

  try {
    const contextInfo = buildChatContext(context);

    // Images get a special instruction appended — still expect structured JSON
    const imageNote = hasImage
      ? "\n\nThe user has attached a screenshot or image. Analyze what you see in the image and return your findings in the standard JSON schema."
      : "";
    const systemMessage = `${CHAT_SYSTEM_PROMPT}${imageNote}\n\nUSER'S CURRENT SYSTEM STATE:\n${contextInfo}`;

    // For image requests, always use a vision-capable model
    const visionModel = hasImage ? "gpt-4o-mini" : model;

    const sliced = messages.slice(-10);

    // Build OpenAI messages — serialize any structured assistant messages back to text for context
    type OaiMsg =
      | { role: "system"; content: string }
      | { role: "user"; content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "auto" } }> }
      | { role: "assistant"; content: string };

    const openaiMessages: OaiMsg[] = [
      { role: "system", content: systemMessage },
      ...sliced.map((m: any, i: number): OaiMsg => {
        const isLast = i === sliced.length - 1;
        const isUser = m.role === "user";

        // If the message has a structured field (from previous AI responses), serialize it
        let textContent: string;
        if (!isUser && m.structured) {
          textContent = structuredToHistoryText(m.structured).slice(0, 2000);
        } else {
          textContent = String(m.content || "").slice(0, 2000);
        }

        if (isLast && isUser && hasImage) {
          return {
            role: "user",
            content: [
              { type: "text", text: textContent },
              { type: "image_url", image_url: { url: `data:${imageType};base64,${imageData}`, detail: "auto" } },
            ],
          };
        }
        return {
          role: isUser ? "user" : "assistant",
          content: textContent,
        };
      }),
    ];

    console.log(`[AI:chat] Calling OpenAI | user=${cloudUser?.id} | messages=${openaiMessages.length} | hasImage=${hasImage} | model=${visionModel}`);

    const completion = await openai.chat.completions.create({
      model: visionModel,
      max_tokens: hasImage ? 600 : 500,
      temperature: 0.3,
      messages: openaiMessages as any,
      // Images don't support json_object format — parse manually
      ...(hasImage ? {} : { response_format: { type: "json_object" } }),
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      return res.status(502).json({ error: "AI returned an empty response. Please try again." });
    }

    // Parse and validate the structured response
    let parsed: unknown;
    try {
      // Strip code fences if model added them despite instructions
      const cleaned = rawContent.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
      parsed = JSON.parse(cleaned);
    } catch {
      console.warn(`[AI:chat] JSON parse failed | user=${cloudUser?.id} | raw=${rawContent.slice(0, 200)}`);
      // Graceful fallback: wrap the raw text as an answer-type response
      const fallback: ChatStructuredResponse = {
        type: "answer",
        summary: rawContent.trim().slice(0, 140),
      };
      return res.json({ role: "assistant", structured: fallback });
    }

    const structured = validateChatResponse(parsed);
    if (!structured) {
      console.warn(`[AI:chat] Validation failed | user=${cloudUser?.id} | type=${(parsed as any)?.type}`);
      // Fallback: try to extract something useful
      const fallback: ChatStructuredResponse = {
        type: "answer",
        summary: "Diagnosis unavailable — please try a more specific question.",
      };
      return res.json({ role: "assistant", structured: fallback });
    }

    console.log(`[AI:chat] OK | user=${cloudUser?.id} | type=${structured.type} | findings=${structured.type === "diagnostic" ? structured.findings.length : 0}`);
    return res.json({ role: "assistant", structured });

  } catch (error: any) {
    const status = error?.status;
    console.error(`[AI:chat] ERROR | user=${cloudUser?.id} | status=${status} | ${error?.message || "unknown"}`);
    if (status === 429) return res.status(429).json({ error: "Rate limit reached. Please wait a moment." });
    return res.status(500).json({ error: "Failed to get AI response. Please try again." });
  }
});

// ---------------------------------------------------------------------------
// POST /ai/advice
// ---------------------------------------------------------------------------

aiRouter.post("/advice", async (req: Request, res: Response) => {
  const requestStart = Date.now();
  const cloudUser = (req as any).cloudUser as {
    id: string; isPremium: boolean; plan?: string; trialEndsAt?: Date | null;
  } | undefined;
  const model = process.env.AI_MODEL || "gpt-4o-mini";

  console.log(`[AI:advice] ${new Date().toISOString()} | user=${cloudUser?.id ?? "none"} premium=${cloudUser?.isPremium ?? false} | model=${model}`);

  if (!cloudUser?.isPremium) {
    console.warn(`[AI:advice] FORBIDDEN | user=${cloudUser?.id ?? "none"} premium=false`);
    return res.status(403).json({ error: "Premium required." });
  }

  const parsed = adviceRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request data",
      details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })),
    });
  }

  const adviceData: AdviceRequest = {
    ...parsed.data,
    userPlan: cloudUser?.plan ?? undefined,
    trialEndsAt: cloudUser?.trialEndsAt?.toISOString() ?? null,
  };

  const cacheKey = getCacheKey(parsed.data);
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[AI:advice] CACHE_HIT | user=${cloudUser?.id} | goal=${parsed.data.goal} | ${Date.now() - requestStart}ms`);
    return res.json(cached);
  }

  let openai: OpenAI;
  try {
    openai = getOpenAI();
  } catch {
    console.error(`[AI:advice] OPENAI_API_KEY missing on cloud server`);
    return res.status(503).json({ error: "AI service is temporarily unavailable." });
  }

  try {
    const maxTokens = parseInt(process.env.AI_MAX_TOKENS || "1100", 10);

    console.log(`[AI:advice] Calling OpenAI | user=${cloudUser?.id} | goal=${parsed.data.goal} | game=${parsed.data.game}`);

    const completion = await openai.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(adviceData) },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return res.status(502).json({ error: "AI returned an empty response. Please try again." });

    let rawAdvice: any;
    try {
      rawAdvice = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: "AI returned invalid format. Please try again." });
    }

    if (!rawAdvice.summary || !Array.isArray(rawAdvice.topFindings) || !Array.isArray(rawAdvice.actions)) {
      return res.status(502).json({ error: "AI response missing required fields. Please try again." });
    }

    const severityValues = ["low", "med", "high"] as const;
    const isSeverity = (v: any): v is "low" | "med" | "high" => severityValues.includes(v);
    const userStates: UserState[] = ["new", "partial", "over_tweaked", "goal_focused", "advanced"];
    const isUserState = (v: any): v is UserState => userStates.includes(v);
    const riskOrder: Record<string, number> = { high: 3, med: 2, low: 1 };
    const confOrder: Record<string, number> = { high: 3, med: 2, low: 1 };

    const unsortedActions: AiAction[] = (Array.isArray(rawAdvice.actions) ? rawAdvice.actions : []).map((a: any) => ({
      title: String(a?.title || "Action"),
      why: String(a?.why || ""),
      steps: Array.isArray(a?.steps) ? a.steps.map((s: any) => String(s)) : [],
      risk: isSeverity(a?.risk) ? a.risk : "med",
      reversible: typeof a?.reversible === "boolean" ? a.reversible : true,
      expectedGain: String(a?.expectedGain || ""),
      confidence: isSeverity(a?.confidence) ? a.confidence : "med",
      autoApplyPossible: typeof a?.autoApplyPossible === "boolean" ? a.autoApplyPossible : false,
      ...(typeof a?.tweakId === "string" && a.tweakId ? { tweakId: a.tweakId } : {}),
      ...(typeof a?.currentIssue === "string" && a.currentIssue ? { currentIssue: a.currentIssue } : {}),
    }));

    const sortedActions = unsortedActions.sort((a, b) => {
      const confDiff = (confOrder[b.confidence] || 0) - (confOrder[a.confidence] || 0);
      if (confDiff !== 0) return confDiff;
      const riskDiff = (riskOrder[a.risk] || 0) - (riskOrder[b.risk] || 0);
      if (riskDiff !== 0) return riskDiff;
      return (b.autoApplyPossible ? 1 : 0) - (a.autoApplyPossible ? 1 : 0);
    });

    const advice: AiAdviceResponse = {
      summary: String(rawAdvice.summary || ""),
      userState: isUserState(rawAdvice.userState) ? rawAdvice.userState : "partial",
      readinessScore: typeof rawAdvice.readinessScore === "number"
        ? Math.max(0, Math.min(100, Math.round(rawAdvice.readinessScore)))
        : 50,
      topFindings: (Array.isArray(rawAdvice.topFindings) ? rawAdvice.topFindings : []).map((f: any) => ({
        title: String(f?.title || "Finding"),
        evidence: String(f?.evidence || ""),
        severity: isSeverity(f?.severity) ? f.severity : "med",
      })),
      actions: sortedActions,
      warnings: Array.isArray(rawAdvice.warnings) ? rawAdvice.warnings.map((w: any) => String(w)) : [],
      followUps: Array.isArray(rawAdvice.followUps) ? rawAdvice.followUps.map((f: any) => String(f)) : [],
    };

    setCache(cacheKey, advice);

    const duration = Date.now() - requestStart;
    console.log(`[AI:advice] OK | user=${cloudUser?.id} | goal=${parsed.data.goal} | state=${advice.userState} | score=${advice.readinessScore} | ${duration}ms`);

    return res.json(advice);
  } catch (error: any) {
    const duration = Date.now() - requestStart;
    const status = error?.status;
    console.error(`[AI:advice] ERROR | user=${cloudUser?.id} | status=${status} | ${error?.message || "unknown"} | ${duration}ms`);
    if (status === 429) return res.status(429).json({ error: "Rate limit reached. Please wait a moment." });
    return res.status(500).json({ error: "Failed to get AI advice. Please try again." });
  }
});

export default aiRouter;
