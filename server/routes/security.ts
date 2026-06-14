import { Router, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import { requireJwt } from "../middleware/requireCloudAuth";
import { generateRecommendations } from "../security/recommendations";
import type {
  SecurityStatus,
  StartupItem,
  ProcessItem,
  SystemAnalysisRequest,
} from "../security/types";

const securityRouter = Router();

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

const securityLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req: Request) => {
    if ((req as any).cloudUser?.id) return `sec:cloud:${(req as any).cloudUser.id}`;
    const raw = req.headers["x-device-id"] as string | undefined;
    if (raw && raw.length >= 16 && raw.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(raw)) return `sec:device:${raw}`;
    return req.ip || req.socket?.remoteAddress || "fallback";
  },
  message: { error: "Too many security requests. Please wait a few minutes." },
});

securityRouter.use(securityLimiter);

// ---------------------------------------------------------------------------
// Helper: get OpenAI client
// ---------------------------------------------------------------------------

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error("AI service unavailable"), { _cloudConfigError: true });
  return new OpenAI({ apiKey });
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const securityStatusSchema = z.object({
  realtimeProtection: z.boolean().nullable().optional(),
  tamperProtection: z.boolean().nullable().optional(),
  firewallEnabled: z.boolean().nullable().optional(),
  defenderAvailable: z.boolean().nullable().optional(),
  antispywareEnabled: z.boolean().nullable().optional(),
  engineVersion: z.string().nullable().optional(),
  signatureVersion: z.string().nullable().optional(),
  lastQuickScan: z.string().nullable().optional(),
  lastFullScan: z.string().nullable().optional(),
  source: z.enum(["electron", "partial", "unavailable"]).optional(),
}).nullable().optional();

const startupItemSchema = z.object({
  name: z.string().max(200),
  command: z.string().max(1000),
  location: z.string().max(500),
  publisher: z.string().nullable().optional(),
  category: z.string().optional(),
  impact: z.enum(["low", "medium", "high"]).optional(),
  recommendation: z.enum(["keep", "review", "disable"]).optional(),
});

const processItemSchema = z.object({
  name: z.string().max(200),
  pid: z.number().int().min(0),
  cpuSec: z.number().nullable().optional(),
  memMb: z.number().nullable().optional(),
  category: z.string().optional(),
  impact: z.enum(["low", "medium", "high"]).optional(),
});

const analyzeRequestSchema = z.object({
  status: securityStatusSchema,
  startupItems: z.array(startupItemSchema).max(100).default([]),
  topProcesses: z.array(processItemSchema).max(50).default([]),
  systemInfo: z.object({
    cpu: z.string().max(200).optional(),
    ram: z.string().max(100).optional(),
    gpu: z.string().max(200).optional(),
  }).optional(),
});

const imageAnalysisSchema = z.object({
  imageData: z.string().min(100).max(7_000_000),
  imageType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  analysisType: z.enum(["windows-security", "task-manager", "startup-apps", "bios", "generic"]).default("generic"),
});

// ---------------------------------------------------------------------------
// GET /capabilities
// ---------------------------------------------------------------------------

securityRouter.get("/capabilities", (req: Request, res: Response) => {
  const hasOpenAi = !!process.env.OPENAI_API_KEY;
  return res.json({
    defenderStatusAvailable: false,
    firewallStatusAvailable: false,
    startupAnalysisAvailable: false,
    processAnalysisAvailable: false,
    aiRecommendationsAvailable: hasOpenAi,
    imageAnalysisAvailable: hasOpenAi,
    historyAvailable: false,
    notes: "Defender/startup/process data collected on-device via Electron IPC. Server provides AI recommendations and image analysis.",
  });
});

// ---------------------------------------------------------------------------
// Shared premium guard — applied after requireJwt populates req.cloudUser.
// Both secured routes use [requireJwt, requirePremium] so the isPremium
// check is defined once and can never be forgotten on a future route.
// ---------------------------------------------------------------------------

const requirePremium: RequestHandler = (req, res, next) => {
  const cloudUser = (req as any).cloudUser as { id: string; isPremium: boolean } | undefined;
  if (!cloudUser?.isPremium) {
    console.warn(`[Security] FORBIDDEN | user=${cloudUser?.id ?? "none"}`);
    return res.status(403).json({ error: "Premium required." });
  }
  next();
};

// ---------------------------------------------------------------------------
// POST /analyze  (premium)
// ---------------------------------------------------------------------------

securityRouter.post("/analyze", requireJwt, requirePremium, async (req: Request, res: Response) => {
  const cloudUser = (req as any).cloudUser as { id: string; isPremium: boolean } | undefined;

  console.log(`[Security:analyze] user=${cloudUser?.id ?? "none"} premium=${cloudUser?.isPremium ?? false}`);

  const parsed = analyzeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request data",
      details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })),
    });
  }

  const { status, startupItems, topProcesses, systemInfo } = parsed.data;

  const analysisData: SystemAnalysisRequest = {
    status: (status as SecurityStatus | null | undefined) ?? null,
    startupItems: (startupItems as StartupItem[]) ?? [],
    topProcesses: (topProcesses as ProcessItem[]) ?? [],
    systemInfo,
  };

  try {
    const result = generateRecommendations(analysisData);
    console.log(`[Security:analyze] OK | user=${cloudUser?.id} | recs=${result.recommendations.length} | state=${result.summary.systemState} | score=${result.summary.healthScore}`);
    return res.json(result);
  } catch (err: any) {
    console.error(`[Security:analyze] ERROR | user=${cloudUser?.id} | ${err?.message}`);
    return res.status(500).json({ error: "Failed to analyze security data." });
  }
});

// ---------------------------------------------------------------------------
// POST /image-analysis  (premium)
// ---------------------------------------------------------------------------

const SECURITY_IMAGE_PROMPTS: Record<string, string> = {
  "windows-security": "The user has uploaded a screenshot of Windows Security or Windows Defender. Analyze what you see: note the protection status, any alerts or warnings, signature update status, scan history, and security settings shown. Flag any issues and provide specific recommendations.",
  "task-manager": "The user has uploaded a Task Manager screenshot. Analyze the processes, CPU/memory usage, startup impact, and identify any processes that look suspicious, unusually resource-intensive, or unnecessary for gaming performance. Provide specific recommendations.",
  "startup-apps": "The user has uploaded a screenshot showing startup applications (Task Manager startup tab or similar). List what you can see, identify launcher/overlay/updater apps, flag unnecessary items, and recommend which to disable for better performance.",
  "bios": "The user has uploaded a BIOS screenshot. Analyze any security-related settings visible (Secure Boot, TPM, virtualization, boot order) and any performance-relevant settings. Identify what could be optimized.",
  "generic": "The user has uploaded a Windows system screenshot. Look carefully at everything visible: application names, process names, status indicators, warning icons, resource usage numbers, firewall status, network connections, enabled/disabled toggles, version numbers, or any text shown. Describe every notable element you can see. Identify security risks, misconfigured settings, performance issues, suspicious processes, high resource usage, or anything that looks unusual. Be very specific about what is actually visible in the image.",
};

securityRouter.post("/image-analysis", requireJwt, requirePremium, async (req: Request, res: Response) => {
  const cloudUser = (req as any).cloudUser as { id: string; isPremium: boolean } | undefined;
  // Always use a vision-capable model for image analysis
  const model = "gpt-4o-mini";
  const ts = new Date().toISOString();

  console.log(`[Security:image] ${ts} | user=${cloudUser?.id ?? "none"} premium=${cloudUser?.isPremium ?? false} | model=${model}`);

  const parsed = imageAnalysisSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request",
      details: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })),
    });
  }

  const { imageData, imageType, analysisType } = parsed.data;

  let openai: OpenAI;
  try {
    openai = getOpenAI();
  } catch {
    console.error(`[Security:image] OPENAI_API_KEY missing`);
    return res.status(503).json({ error: "AI service is temporarily unavailable." });
  }

  const systemPrompt = `You are SwitchControl System Integrity Analyzer — an expert in Windows security posture, gaming performance optimization, and system configuration. You analyze screenshots to identify security issues, performance problems, and actionable improvements.

RULES:
1. Be precise and specific about what you see in the image.
2. Do not make assumptions about what is not visible.
3. Format your response as JSON with this exact structure:
{
  "findings": [{ "title": "...", "severity": "info|low|medium|high", "description": "..." }],
  "recommendations": ["specific action 1", "specific action 2"],
  "summary": "2-3 sentence summary of what was found"
}
4. Findings should be concrete observations from the screenshot.
5. Recommendations should be actionable steps.
6. Do not invent issues that are not visible in the image.`;

  const userPrompt = SECURITY_IMAGE_PROMPTS[analysisType] || SECURITY_IMAGE_PROMPTS["generic"];

  try {
    const completion = await openai.chat.completions.create({
      model,
      max_tokens: 1000,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: `data:${imageType};base64,${imageData}`, detail: "auto" } },
          ] as any,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return res.status(502).json({ error: "AI returned an empty response. Please try again." });

    let parsed_ai: any;
    try {
      parsed_ai = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: "AI returned invalid format. Please try again." });
    }

    const result = {
      analysisType,
      findings: Array.isArray(parsed_ai.findings) ? parsed_ai.findings : [],
      recommendations: Array.isArray(parsed_ai.recommendations) ? parsed_ai.recommendations : [],
      rawAnalysis: parsed_ai.summary || raw,
    };

    console.log(`[Security:image] OK | user=${cloudUser?.id} | findings=${result.findings.length}`);
    return res.json(result);
  } catch (error: any) {
    const status = error?.status;
    console.error(`[Security:image] ERROR | user=${cloudUser?.id} | status=${status} | ${error?.message}`);
    if (status === 429) return res.status(429).json({ error: "Rate limit reached. Please wait a moment." });
    return res.status(500).json({ error: "Failed to analyze image. Please try again." });
  }
});

export default securityRouter;
