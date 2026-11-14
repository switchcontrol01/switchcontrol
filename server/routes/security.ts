import express, { Router, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import OpenAI from "openai";
import { createAiClient, sendAiFailure } from "../lib/aiService";
import { requireJwt } from "../middleware/requireCloudAuth";
import { securityHourlyLimiter, securityLimiter } from "../middleware/rateLimiter";
import { AiRequestResultCache, hashAiRequestParts } from "../lib/aiRequestResultCache";
import { generateRecommendations } from "../security/recommendations";
import type {
  SecurityStatus,
  StartupItem,
  ProcessItem,
  SystemAnalysisRequest,
} from "../security/types";

const securityRouter = Router();

// The /image-analysis endpoint accepts base64 image payloads up to ~7 MB of
// base64 text, which equals ~9.3 MB of HTTP body after JSON encoding overhead.
// Express's default body-parser limit is 100 KB — set it explicitly here so
// large images aren't silently rejected with a 413 before reaching the handler.
securityRouter.use(express.json({ limit: "10mb" }));

// ---------------------------------------------------------------------------
// Helper: get OpenAI client
// ---------------------------------------------------------------------------

function getOpenAI(user?: string): OpenAI {
  return createAiClient("security.image", user);
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
  scanCoverage: z.object({ startup: z.boolean(), background: z.boolean() }).optional(),
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
    // Distinguish between: (a) middleware ordering bug — cloudUser is undefined,
    // (b) correct 403 — user is authenticated but not premium.
    if (!cloudUser) {
      console.error(`[Security] FORBIDDEN | cloudUser=undefined — possible middleware ordering bug`);
    } else {
      console.warn(`[Security] FORBIDDEN | user=${cloudUser.id} isPremium=false`);
    }
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

  const { status, startupItems, topProcesses, systemInfo, scanCoverage } = parsed.data;

  const analysisData: SystemAnalysisRequest = {
    status: (status as SecurityStatus | null | undefined) ?? null,
    startupItems: (startupItems as StartupItem[]) ?? [],
    topProcesses: (topProcesses as ProcessItem[]) ?? [],
    systemInfo,
    scanCoverage,
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

type SecurityImageResult = {
  analysisType: string;
  findings: unknown[];
  recommendations: unknown[];
  rawAnalysis: string;
};

class InvalidSecurityImageResponse extends Error {}

const securityImageResultCache = new AiRequestResultCache<SecurityImageResult>(24 * 60 * 60 * 1000, 200);

securityRouter.post(
  "/image-analysis",
  requireJwt,
  requirePremium,
  securityLimiter,
  securityHourlyLimiter,
  async (req: Request, res: Response) => {
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
  const fingerprint = hashAiRequestParts("security-image-v1", analysisType, imageType, imageData);
  const cacheKey = hashAiRequestParts("security-image-cache-v1", cloudUser!.id, fingerprint);

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
    const { value: result, source } = await securityImageResultCache.run(
      cacheKey,
      fingerprint,
      async () => {
        const openai = getOpenAI(cloudUser?.id);
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

        const rawContent = completion.choices[0]?.message?.content;
        if (!rawContent) {
          const reason = completion.choices[0]?.message == null ? "null message object" : "empty content";
          throw new InvalidSecurityImageResponse(`AI returned no content (${reason}).`);
        }

        let aiResult: any;
        try {
          aiResult = JSON.parse(rawContent);
        } catch {
          throw new InvalidSecurityImageResponse("AI returned invalid format.");
        }

        const MAX_STRING = 500;
        const truncate = (s: unknown) => typeof s === "string" ? s.slice(0, MAX_STRING) : s;
        const sanitizeFinding = (f: any) =>
          typeof f === "object" && f !== null
            ? { ...f, title: truncate(f.title), description: truncate(f.description) }
            : f;

        return {
          analysisType,
          findings: Array.isArray(aiResult.findings)
            ? aiResult.findings.slice(0, 20).map(sanitizeFinding)
            : [],
          recommendations: Array.isArray(aiResult.recommendations)
            ? aiResult.recommendations.slice(0, 20).map((r: unknown) => truncate(r))
            : [],
          rawAnalysis: typeof aiResult.summary === "string"
            ? aiResult.summary.slice(0, 2000)
            : rawContent.slice(0, 2000),
        };
      },
    );

    if (source === "fresh") {
      console.log(`[Security:image] OK | user=${cloudUser?.id} | findings=${result.findings.length}`);
    } else {
      console.info(`[Security:image] ${source === "cache" ? "CACHE_HIT" : "IN_FLIGHT_JOIN"} | user=${cloudUser?.id} | hash=${fingerprint.slice(0, 12)}`);
    }
    return res.json(result);
  } catch (error: any) {
    if (error instanceof InvalidSecurityImageResponse) {
      console.warn(`[Security:image] ${error.message} | user=${cloudUser?.id}`);
      return res.status(502).json({ error: `${error.message} Please try again.` });
    }
    return sendAiFailure(res, error);
  }
});

export default securityRouter;
