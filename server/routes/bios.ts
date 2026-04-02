import { Router, Request, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import crypto from "crypto";

const biosRouter = Router();

// ---------------------------------------------------------------------------
// Rate limiter — keyed by authenticated cloudUser.id from JWT middleware
// ---------------------------------------------------------------------------

const biosLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req: Request) => {
    if ((req as any).cloudUser?.id) return `bios:cloud:${(req as any).cloudUser.id}`;
    return req.ip || req.socket?.remoteAddress || "fallback";
  },
  message: { error: "Too many BIOS scan requests. Please wait a few minutes." },
});

biosRouter.use(biosLimiter);

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
// Schemas
// ---------------------------------------------------------------------------

const photoScanSchema = z.object({
  imageBase64: z.string().min(100).max(10_000_000, "Image too large. Please use an image under 7MB."),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});

const BIOS_PHOTO_PROMPT = `You are a BIOS firmware settings analyzer for competitive gaming PC optimization. The user has uploaded a photo of their BIOS screen.

Extract any visible BIOS settings from the image. Focus specifically on these settings if visible:
- PBO (Precision Boost Overdrive) — status and any values
- XMP / EXPO — status and memory speed
- SMT / Hyper-Threading — enabled or disabled
- C-States (Global C-State, Package C-State, DF C-States) — status
- FCLK / Infinity Fabric Clock — value if shown
- Curve Optimizer — any values
- Load Line Calibration (LLC) — level
- Memory Frequency — value
- Memory Timings — primary timings (CL, tRCD, tRP, tRAS)
- Resizable BAR / Above 4G Decoding — status
- Spread Spectrum — status
- Core Parking settings
- VRM settings (switching frequency, phase control)

For each setting you can identify, return a JSON object with:
- settingId: the setting identifier (use these exact IDs: smt, xmp-expo, pbo, curve-optimizer, global-cstate, package-cstate, df-cstates, fclk, memory-frequency, llc, rebar, spread-spectrum, core-parking, hpet, x2apic, fclk-uclk-ratio, memory-gear-mode, command-rate, trfc-tfaw, cppc, cppc-preferred-cores, thermal-throttling, power-phase-control, vrm-switching-frequency, cpu-current-capability, power-supply-idle, tsc-stability, bclk, pcie-spread-spectrum, usb-power-mgmt)
- value: the detected value as shown in the BIOS (e.g. "Enabled", "Disabled", "Auto", the numeric value)
- confidence: your confidence 0.0-1.0 in the reading
- reason: brief explanation of what you see in the image
- isOptimalForGaming: true if this detected value is the recommended setting for competitive gaming performance, false if it is suboptimal or hurts performance. Examples: XMP "Enabled" = true, XMP "Disabled" = false, C-States "Disabled" = true (good for latency), C-States "Enabled" = false (bad for latency), PBO "Enabled" = true, Spread Spectrum "Enabled" = false (adds jitter).

Return ONLY a JSON array. If you cannot read any settings, return an empty array [].
Do not guess settings that are not visible. Only report what you can actually see in the image.
Be honest: if a setting visible in the image is NOT at the recommended gaming value, set isOptimalForGaming to false — this is critical for accurate scoring.`;

// ---------------------------------------------------------------------------
// POST /bios/photo-scan
// ---------------------------------------------------------------------------

const ALLOWED_SETTING_IDS = new Set([
  "smt", "xmp-expo", "pbo", "curve-optimizer", "global-cstate", "package-cstate",
  "df-cstates", "fclk", "memory-frequency", "llc", "spread-spectrum", "core-parking",
  "hpet", "x2apic", "memory-gear-mode", "command-rate", "trfc-tfaw", "cppc",
  "cppc-preferred-cores", "thermal-throttling", "power-phase-control",
  "vrm-switching-frequency", "cpu-current-capability", "power-supply-idle",
  "tsc-stability", "pcie-spread-spectrum", "rebar",
]);

const MIN_PHOTO_CONFIDENCE = 0.55;

biosRouter.post("/photo-scan", async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const cloudUser = (req as any).cloudUser as { id: string; isPremium: boolean } | undefined;

  // Proof log — shows full chain in server logs
  console.log(`[BIOS:photo-scan:${requestId}] ${new Date().toISOString()} | user=${cloudUser?.id ?? "none"} premium=${cloudUser?.isPremium ?? false} | bearer=${!!req.headers.authorization}`);

  if (!cloudUser?.isPremium) {
    console.warn(`[BIOS:photo-scan:${requestId}] FORBIDDEN | user=${cloudUser?.id ?? "none"} premium=false`);
    return res.status(403).json({ error: "Premium required." });
  }

  let openai: OpenAI;
  try {
    openai = getOpenAI();
  } catch {
    console.error(`[BIOS:photo-scan:${requestId}] OPENAI_API_KEY missing on cloud server`);
    return res.status(503).json({ error: "AI service is temporarily unavailable." });
  }

  try {
    const parsed = photoScanSchema.safeParse(req.body);
    if (!parsed.success) {
      const sizeIssue = parsed.error.issues.find(i => i.path.includes("imageBase64") && i.code === "too_big");
      if (sizeIssue) return res.status(413).json({ error: "Image too large. Please use an image under 7MB." });
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    }

    const { imageBase64, mimeType } = parsed.data;
    console.log(`[BIOS:photo-scan:${requestId}] Calling OpenAI | user=${cloudUser?.id} | image=${Math.round(imageBase64.length / 1024)}KB | type=${mimeType}`);

    const startTime = Date.now();

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: BIOS_PHOTO_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    });

    const duration = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || "[]";
    console.log(`[BIOS:photo-scan:${requestId}] OpenAI OK | user=${cloudUser?.id} | ${duration}ms`);

    let rawSettings: any[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) rawSettings = JSON.parse(jsonMatch[0]);
    } catch {
      console.error(`[BIOS:photo-scan:${requestId}] Failed to parse response`);
      return res.status(500).json({ error: "Failed to parse BIOS photo analysis. Please try again." });
    }

    // Validate, whitelist, deduplicate (keep highest confidence per settingId)
    const seenIds = new Map<string, any>();
    let droppedCount = 0;

    for (const s of rawSettings) {
      const settingId = String(s.settingId || "").trim();
      if (!settingId || typeof s.value !== "string") { droppedCount++; continue; }
      if (!ALLOWED_SETTING_IDS.has(settingId)) {
        console.warn(`[BIOS:photo-scan:${requestId}] Rejected unknown settingId: ${settingId}`);
        droppedCount++;
        continue;
      }
      const confidence = typeof s.confidence === "number" ? Math.max(0, Math.min(1, s.confidence)) : 0.7;
      if (confidence < MIN_PHOTO_CONFIDENCE) {
        console.log(`[BIOS:photo-scan:${requestId}] Dropped low-confidence entry: ${settingId} (${Math.round(confidence * 100)}%)`);
        droppedCount++;
        continue;
      }
      const existing = seenIds.get(settingId);
      if (!existing || confidence > existing.confidence) {
        seenIds.set(settingId, { ...s, confidence });
      }
    }

    if (droppedCount > 0) {
      console.log(`[BIOS:photo-scan:${requestId}] Dropped ${droppedCount} entries (invalid id, unknown, or low confidence)`);
    }

    const detections = Array.from(seenIds.values()).map((s: any) => {
      // Honest status: Photo Verified for high-confidence, Photo Suspected for medium
      const status = s.confidence >= 0.8 ? "Photo Verified" : "Photo Suspected";
      const entry: Record<string, unknown> = {
        settingId: String(s.settingId),
        status,
        confidence: s.confidence,
        reason: `Derived from BIOS photo analysis: ${String(s.reason || s.value)}`,
        detectedValue: String(s.value),
      };
      // Pass through isOptimalForGaming from AI response when present
      if (typeof s.isOptimalForGaming === "boolean") {
        entry.isOptimal = s.isOptimalForGaming;
      }
      return entry;
    });

    console.log(`[BIOS:photo-scan:${requestId}] OK | user=${cloudUser?.id} | detections=${detections.length} dropped=${droppedCount}`);
    return res.json({ detections, settingsFound: detections.length, analysisTimeMs: duration });

  } catch (err: any) {
    const status = err?.status;
    console.error(`[BIOS:photo-scan:${requestId}] ERROR | user=${cloudUser?.id} | status=${status} | ${err?.message || "unknown"}`);
    if (status === 429) return res.status(429).json({ error: "Rate limit reached. Please wait a moment." });
    return res.status(500).json({ error: "Photo analysis failed. Please try again." });
  }
});

// ---------------------------------------------------------------------------
// POST /bios/explain
// ---------------------------------------------------------------------------

const explainSchema = z.object({
  cpuModel: z.string().min(1),
  gpuModel: z.string().min(1),
  ramTotalGB: z.number(),
  detections: z.array(z.object({
    settingId: z.string(),
    status: z.string(),
    confidence: z.number(),
    reason: z.string(),
    detectedValue: z.string().nullable(),
  })),
  scores: z.object({
    latency: z.number(),
    frametime: z.number(),
    stability: z.number(),
    competitiveReadiness: z.number(),
  }),
});

const EXPLAIN_PROMPT = `You are a firmware analysis expert for competitive gaming PCs. Given the user's hardware and detected firmware settings, provide a concise analysis.

RULES:
- Reference the user's actual CPU and GPU by model name
- Explain what each detected setting means for their specific hardware
- Focus on latency impact and frametime stability
- Be honest about what is detected vs inferred
- Keep each setting explanation to 1-2 sentences
- End with 2-3 prioritized recommendations specific to their hardware
- Never suggest specific BIOS navigation paths
- Never suggest specific voltage values or overclock numbers

FORMAT:
Return a JSON object with:
- overview: 2-3 sentence summary of their firmware state
- settingExplanations: array of { settingId, explanation, impact } where impact is "positive" | "neutral" | "negative" | "uncertain"
- recommendations: array of strings (2-3 items)
- confidenceNote: 1 sentence about overall detection confidence`;

biosRouter.post("/explain", async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const cloudUser = (req as any).cloudUser as { id: string; isPremium: boolean } | undefined;

  // Proof log
  console.log(`[BIOS:explain:${requestId}] ${new Date().toISOString()} | user=${cloudUser?.id ?? "none"} premium=${cloudUser?.isPremium ?? false} | bearer=${!!req.headers.authorization}`);

  if (!cloudUser?.isPremium) {
    console.warn(`[BIOS:explain:${requestId}] FORBIDDEN | user=${cloudUser?.id ?? "none"} premium=false`);
    return res.status(403).json({ error: "Premium required." });
  }

  let openai: OpenAI;
  try {
    openai = getOpenAI();
  } catch {
    console.error(`[BIOS:explain:${requestId}] OPENAI_API_KEY missing on cloud server`);
    return res.status(503).json({ error: "AI service is temporarily unavailable." });
  }

  try {
    const parsed = explainSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const { cpuModel, gpuModel, ramTotalGB, detections, scores } = parsed.data;

    console.log(`[BIOS:explain:${requestId}] Calling OpenAI | user=${cloudUser?.id} | cpu=${cpuModel} gpu=${gpuModel} detections=${detections.length}`);

    const startTime = Date.now();

    const userMessage = `Hardware: ${cpuModel}, ${gpuModel}, ${ramTotalGB}GB RAM
Firmware Scores: Latency ${scores.latency}/100, Frametime ${scores.frametime}/100, Stability ${scores.stability}/100, Readiness ${scores.competitiveReadiness}/100

Detected Settings:
${detections.map(d => `- ${d.settingId}: ${d.detectedValue || "unknown"} (${d.status}, ${Math.round(d.confidence * 100)}% confidence) — ${d.reason}`).join("\n")}`;

    const response = await openai.chat.completions.create({
      model: process.env.AI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: EXPLAIN_PROMPT },
        { role: "user", content: userMessage },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    });

    const duration = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || "{}";
    console.log(`[BIOS:explain:${requestId}] OpenAI OK | user=${cloudUser?.id} | ${duration}ms`);

    let explanation: any = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) explanation = JSON.parse(jsonMatch[0]);
    } catch {
      explanation = { overview: content, settingExplanations: [], recommendations: [], confidenceNote: "" };
    }

    return res.json({
      overview: String(explanation.overview || ""),
      settingExplanations: Array.isArray(explanation.settingExplanations)
        ? explanation.settingExplanations.map((e: any) => ({
            settingId: String(e?.settingId || ""),
            explanation: String(e?.explanation || ""),
            impact: ["positive", "neutral", "negative", "uncertain"].includes(e?.impact) ? e.impact : "neutral",
          }))
        : [],
      recommendations: Array.isArray(explanation.recommendations)
        ? explanation.recommendations.map((r: any) => String(r))
        : [],
      confidenceNote: String(explanation.confidenceNote || ""),
      analysisTimeMs: duration,
    });

  } catch (err: any) {
    const status = err?.status;
    console.error(`[BIOS:explain:${requestId}] ERROR | user=${cloudUser?.id} | status=${status} | ${err?.message || "unknown"}`);
    if (status === 429) return res.status(429).json({ error: "Rate limit reached. Please wait a moment." });
    return res.status(500).json({ error: "Firmware explanation failed. Please try again." });
  }
});

export default biosRouter;
