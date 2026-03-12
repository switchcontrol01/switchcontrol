import { Router, Request, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import crypto from "crypto";

const biosRouter = Router();

const biosLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many BIOS scan requests. Please wait a few minutes." },
});

biosRouter.use(biosLimiter);

const photoScanSchema = z.object({
  imageBase64: z.string().min(100).max(10_000_000),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});

const BIOS_PHOTO_PROMPT = `You are a BIOS firmware settings analyzer. The user has uploaded a photo of their BIOS screen.

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
- value: the detected value as shown in the BIOS
- confidence: your confidence 0.0-1.0 in the reading
- reason: brief explanation of what you see

Return ONLY a JSON array. If you cannot read any settings, return an empty array [].
Do not guess settings that are not visible. Only report what you can actually see in the image.`;

biosRouter.post("/photo-scan", async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    const parsed = photoScanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "AI service not configured" });
    }

    const openai = new OpenAI({ apiKey });
    const { imageBase64, mimeType } = parsed.data;

    console.log(`[BIOS:${requestId}] Photo scan request received, image size: ${Math.round(imageBase64.length / 1024)}KB`);

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

    console.log(`[BIOS:${requestId}] Photo scan completed in ${duration}ms`);

    let settings: any[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        settings = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error(`[BIOS:${requestId}] Failed to parse photo scan response`);
      return res.status(500).json({ error: "Failed to parse BIOS photo analysis" });
    }

    const detections = settings
      .filter((s: any) => s.settingId && typeof s.value === "string")
      .map((s: any) => ({
        settingId: String(s.settingId),
        status: "User Confirmed" as const,
        confidence: typeof s.confidence === "number" ? Math.max(0, Math.min(1, s.confidence)) : 0.85,
        reason: `BIOS photo: ${String(s.reason || s.value)}`,
        detectedValue: String(s.value),
      }));

    return res.json({
      detections,
      settingsFound: detections.length,
      analysisTimeMs: duration,
    });
  } catch (err: any) {
    console.error(`[BIOS:${requestId}] Photo scan error:`, err.message);
    return res.status(500).json({ error: "Photo analysis failed. Please try again." });
  }
});

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

  try {
    const parsed = explainSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "AI service not configured" });
    }

    const openai = new OpenAI({ apiKey });
    const { cpuModel, gpuModel, ramTotalGB, detections, scores } = parsed.data;

    console.log(`[BIOS:${requestId}] Explanation request for ${cpuModel} / ${gpuModel}`);

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

    console.log(`[BIOS:${requestId}] Explanation completed in ${duration}ms`);

    let explanation: any = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        explanation = JSON.parse(jsonMatch[0]);
      }
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
    console.error(`[BIOS:${requestId}] Explanation error:`, err.message);
    return res.status(500).json({ error: "Firmware explanation failed. Please try again." });
  }
});

export default biosRouter;
