import { Router, Request, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import crypto from "crypto";

const aiRouter = Router();

const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req: Request) => {
    const userId = (req as any).session?.userId;
    if (userId) return `user:${userId}`;
    const raw = req.headers["x-device-id"] as string | undefined;
    if (raw && raw.length >= 16 && raw.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(raw)) return `device:${raw}`;
    return req.ip || "unknown";
  },
  message: { error: "Too many AI requests. Please wait a few minutes.", retryAfterSeconds: 300 },
});

const aiHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req: Request) => {
    const userId = (req as any).session?.userId;
    if (userId) return `hourly:${userId}`;
    const raw = req.headers["x-device-id"] as string | undefined;
    if (raw && raw.length >= 16 && raw.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(raw)) return `hourly:device:${raw}`;
    return `hourly:${req.ip || "unknown"}`;
  },
  message: { error: "Hourly AI request limit reached. Please try again later.", retryAfterSeconds: 3600 },
});

aiRouter.use(aiLimiter);
aiRouter.use(aiHourlyLimiter);

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
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: AiAdviceResponse): void {
  const CACHE_TTL = 10 * 60 * 1000;
  responseCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
  if (responseCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of responseCache) {
      if (now > v.expiresAt) responseCache.delete(k);
    }
  }
}

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
  cpuLoadPct: z.number().nullable().default(null),
  gpuLoadPct: z.number().nullable().default(null),
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

export type AdviceRequest = z.infer<typeof adviceRequestSchema>;

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
  "summary": "2-3 sentence summary referencing hardware, goal, and current optimization state",
  "userState": "new|partial|over_tweaked|goal_focused|advanced",
  "readinessScore": 0-100,
  "topFindings": [
    { "title": "short title", "evidence": "what data led to this finding", "severity": "low|med|high" }
  ],
  "actions": [
    {
      "title": "specific action name",
      "why": "why this helps their specific setup",
      "currentIssue": "what is currently wrong or missing on their system",
      "steps": ["step 1", "step 2"],
      "risk": "low|med|high",
      "reversible": true,
      "expectedGain": "e.g. lower latency spikes, +5% FPS",
      "confidence": "low|med|high",
      "autoApplyPossible": true,
      "tweakId": "matching_tweak_id_if_applicable"
    }
  ],
  "warnings": ["any cautions specific to their hardware or tweak conflicts"],
  "followUps": ["suggested next investigations"]
}
9. Provide 3-6 findings and 3-8 actions, ordered by impact (highest first).
10. For actions that correspond to SwitchControl tweaks, set autoApplyPossible=true and include the tweakId.
11. For BIOS changes, dangerous registry edits, or motherboard-specific tweaks, set autoApplyPossible=false.
12. Steps must be concrete Windows instructions (Settings paths, registry keys, or PowerShell commands).
13. Risk assessment must be honest — if something could cause instability, say "high".
14. readinessScore: 0 = completely unoptimized, 100 = fully optimized for their goal.
15. If telemetry shows thermal issues (CPU >85°C or GPU >90°C), prioritize thermal advice.
16. Tailor advice to the game specified — different games need different optimizations.
17. Do NOT recommend tweaks that are already enabled unless they should be disabled.
18. Never recommend specific overclock values, voltage adjustments, or frequency numbers — these are hardware-specific and dangerous to guess.`;

function buildUserPrompt(data: AdviceRequest): string {
  const t = data.telemetry;
  const telemetryLines = [
    t.cpuTempC !== null ? `CPU Temp: ${t.cpuTempC}°C` : null,
    t.gpuTempC !== null ? `GPU Temp: ${t.gpuTempC}°C` : null,
    t.ramUsedGB !== null ? `RAM Used: ${t.ramUsedGB} GB` : null,
    t.cpuLoadPct !== null ? `CPU Load: ${t.cpuLoadPct}%` : null,
    t.gpuLoadPct !== null ? `GPU Load: ${t.gpuLoadPct}%` : null,
    t.avgFps !== null ? `Avg FPS: ${t.avgFps}` : null,
    t.pingMs !== null ? `Ping: ${t.pingMs} ms` : null,
  ].filter(Boolean);

  const enabledList = data.enabledTweaks.length > 0
    ? data.enabledTweaks.map(t => `- [ENABLED] ${t.title} (${t.category}, risk: ${t.risk}, id: ${t.id})`).join("\n")
    : "No tweaks currently enabled.";

  const disabledHighImpact = data.disabledTweaks.slice(0, 20);
  const disabledList = disabledHighImpact.length > 0
    ? disabledHighImpact.map(t => `- [DISABLED] ${t.title} (${t.category}, risk: ${t.risk}, id: ${t.id})`).join("\n")
    : "All available tweaks are enabled.";

  return `OPTIMIZATION GOAL: ${data.goal}
TARGET GAME: ${data.game}

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

${telemetryLines.length > 0 ? `LIVE TELEMETRY:\n${telemetryLines.map(l => `- ${l}`).join("\n")}` : "NO TELEMETRY DATA AVAILABLE"}

Analyze this system configuration and current tweak state. Provide state-aware optimization advice as JSON.`;
}

function getValidDeviceId(req: Request): string | null {
  const raw = req.headers["x-device-id"] as string | undefined;
  if (!raw || raw.length < 16 || raw.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(raw)) return null;
  return raw;
}

function getRequestIdentifier(req: Request): string {
  const userId = (req as any).session?.userId;
  if (userId) return `user:${userId}`;
  const deviceId = getValidDeviceId(req);
  if (deviceId) return `device:${deviceId}`;
  return `ip:${req.ip || "unknown"}`;
}

aiRouter.post("/advice", async (req: Request, res: Response) => {
  const requestStart = Date.now();
  const requestId = getRequestIdentifier(req);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "AI Advisor is not configured. Missing API key." });
  }

  const parsed = adviceRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    console.log(`[AI] ${new Date().toISOString()} | ${requestId} | INVALID_REQUEST | ${Date.now() - requestStart}ms`);
    return res.status(400).json({
      error: "Invalid request data",
      details: parsed.error.issues.map(i => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }

  const cacheKey = getCacheKey(parsed.data);
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[AI] ${new Date().toISOString()} | ${requestId} | CACHE_HIT | goal=${parsed.data.goal} game=${parsed.data.game} | ${Date.now() - requestStart}ms`);
    return res.json(cached);
  }

  try {
    const openai = new OpenAI({ apiKey });
    const model = process.env.AI_MODEL || "gpt-4o-mini";
    const maxTokens = parseInt(process.env.AI_MAX_TOKENS || "1800", 10);

    const completion = await openai.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(parsed.data) },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return res.status(502).json({ error: "AI returned an empty response. Please try again." });
    }

    let rawAdvice: any;
    try {
      rawAdvice = JSON.parse(raw);
    } catch {
      console.error("[AI] Failed to parse AI response as JSON");
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
      const confA = confOrder[a.confidence] || 0;
      const confB = confOrder[b.confidence] || 0;
      if (confB !== confA) return confB - confA;
      const riskA = riskOrder[a.risk] || 0;
      const riskB = riskOrder[b.risk] || 0;
      if (riskA !== riskB) return riskA - riskB;
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
    console.log(`[AI] ${new Date().toISOString()} | ${requestId} | OK | goal=${parsed.data.goal} game=${parsed.data.game} state=${advice.userState} score=${advice.readinessScore} | ${duration}ms`);

    return res.json(advice);
  } catch (error: any) {
    const duration = Date.now() - requestStart;
    if (error?.status === 429) {
      console.log(`[AI] ${new Date().toISOString()} | ${requestId} | OPENAI_RATE_LIMIT | goal=${parsed.data.goal} game=${parsed.data.game} | ${duration}ms`);
      return res.status(429).json({ error: "AI rate limit reached. Please wait a moment." });
    }
    if (error?.status === 401) {
      console.error(`[AI] ${new Date().toISOString()} | ${requestId} | API_KEY_INVALID | ${duration}ms`);
      return res.status(503).json({ error: "AI API key is invalid or expired." });
    }
    console.error(`[AI] ${new Date().toISOString()} | ${requestId} | ERROR | goal=${parsed.data.goal} game=${parsed.data.game} | ${duration}ms | ${error?.message || "unknown"}`);
    return res.status(500).json({ error: "Failed to get AI advice. Please try again." });
  }
});

export default aiRouter;
