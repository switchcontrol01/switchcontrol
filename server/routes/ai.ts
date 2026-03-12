import { Router, Request, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";

const aiRouter = Router();

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.AI_RATE_LIMIT_PER_MIN || "10", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI requests. Please wait a minute and try again." },
});

aiRouter.use(aiLimiter);

const goalEnum = z.enum(["lowest_latency", "max_fps", "stability", "network_ping"]);

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

const adviceRequestSchema = z.object({
  goal: goalEnum,
  game: z.string().min(1).max(100),
  system: systemSchema,
  telemetry: telemetrySchema.default({}),
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
}

export interface AiAdviceResponse {
  summary: string;
  topFindings: AiFinding[];
  actions: AiAction[];
  warnings: string[];
  followUps: string[];
}

const SYSTEM_PROMPT = `You are SwitchControl AI Advisor — an expert Windows gaming PC optimization consultant.

RULES:
1. You MUST reference the user's ACTUAL hardware (CPU model, GPU model, RAM amount) at least 3 times in your response.
2. Every recommendation must be specific to their hardware and goal — NO generic "update your drivers" unless evidence suggests it.
3. Output ONLY valid JSON matching this exact schema (no markdown, no code fences, no extra text):
{
  "summary": "2-3 sentence executive summary referencing their specific hardware and goal",
  "topFindings": [
    { "title": "short title", "evidence": "what data led to this finding", "severity": "low|med|high" }
  ],
  "actions": [
    {
      "title": "specific action name",
      "why": "why this helps their specific setup",
      "steps": ["step 1", "step 2"],
      "risk": "low|med|high",
      "reversible": true/false
    }
  ],
  "warnings": ["any cautions specific to their hardware"],
  "followUps": ["suggested next investigations"]
}
4. Provide 3-6 findings and 3-8 actions, ordered by impact.
5. For each action, steps must be concrete Windows instructions (Settings paths, registry keys, or PowerShell commands).
6. Do NOT output registry modification scripts unless the action explicitly says so. Prefer Windows Settings UI paths.
7. Risk assessment must be honest — if something could cause instability, say "high".
8. If telemetry shows thermal issues (CPU >85°C or GPU >90°C), prioritize thermal advice.
9. Tailor advice to the game specified — different games need different optimizations.`;

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

${telemetryLines.length > 0 ? `LIVE TELEMETRY:\n${telemetryLines.map(l => `- ${l}`).join("\n")}` : "NO TELEMETRY DATA AVAILABLE"}

Analyze this system and provide optimization advice as JSON.`;
}

aiRouter.post("/advice", async (req: Request, res: Response) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "AI Advisor is not configured. Missing API key." });
  }

  const parsed = adviceRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request data",
      details: parsed.error.issues.map(i => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const model = process.env.AI_MODEL || "gpt-4o-mini";
    const maxTokens = parseInt(process.env.AI_MAX_TOKENS || "1200", 10);

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

    const advice: AiAdviceResponse = {
      summary: String(rawAdvice.summary || ""),
      topFindings: (Array.isArray(rawAdvice.topFindings) ? rawAdvice.topFindings : []).map((f: any) => ({
        title: String(f?.title || "Finding"),
        evidence: String(f?.evidence || ""),
        severity: isSeverity(f?.severity) ? f.severity : "med",
      })),
      actions: (Array.isArray(rawAdvice.actions) ? rawAdvice.actions : []).map((a: any) => ({
        title: String(a?.title || "Action"),
        why: String(a?.why || ""),
        steps: Array.isArray(a?.steps) ? a.steps.map((s: any) => String(s)) : [],
        risk: isSeverity(a?.risk) ? a.risk : "med",
        reversible: typeof a?.reversible === "boolean" ? a.reversible : true,
      })),
      warnings: Array.isArray(rawAdvice.warnings) ? rawAdvice.warnings.map((w: any) => String(w)) : [],
      followUps: Array.isArray(rawAdvice.followUps) ? rawAdvice.followUps.map((f: any) => String(f)) : [],
    };

    console.log(`[AI] Advice generated for ${parsed.data.system.cpu} / ${parsed.data.system.gpu} — goal: ${parsed.data.goal}`);

    return res.json(advice);
  } catch (error: any) {
    if (error?.status === 429) {
      return res.status(429).json({ error: "AI rate limit reached. Please wait a moment." });
    }
    if (error?.status === 401) {
      return res.status(503).json({ error: "AI API key is invalid or expired." });
    }
    console.error("[AI] OpenAI error:", error?.message || error);
    return res.status(500).json({ error: "Failed to get AI advice. Please try again." });
  }
});

export default aiRouter;
