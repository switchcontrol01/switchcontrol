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
// In-flight dedup — prevents duplicate concurrent requests per user
// ---------------------------------------------------------------------------

const inFlightScans = new Map<string, Promise<any>>();

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

const imageItemSchema = z.object({
  imageBase64: z.string().min(100).max(10_000_000, "Single image too large (max ~7MB)."),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});

// Accepts either legacy single-image OR new multi-image array
const photoScanSchema = z.union([
  // Legacy single-image format (backward compat)
  z.object({
    imageBase64: z.string().min(100).max(10_000_000, "Image too large. Please use an image under 7MB."),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    images: z.undefined().optional(),
  }),
  // New multi-image format
  z.object({
    images: z.array(imageItemSchema).min(1).max(5, "Maximum 5 images per scan."),
    imageBase64: z.undefined().optional(),
    mimeType: z.undefined().optional(),
  }),
]);

// Total base64 limit ~53MB (covers 40MB actual data with base64 overhead)
const MAX_TOTAL_BASE64_CHARS = 53_000_000;

const BIOS_PHOTO_PROMPT = `You are a BIOS firmware settings analyzer for competitive gaming PC optimization. The user has uploaded one or more photos of their BIOS screen.

Extract any visible BIOS settings from ALL images provided. If the same setting appears in multiple images, use the clearest/most readable value. Focus specifically on these settings if visible:
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
- imageIndex: which image (0-based) this was detected from
- isOptimalForGaming: true if this detected value is the recommended setting for competitive gaming performance, false if it is suboptimal or hurts performance. Examples: XMP "Enabled" = true, XMP "Disabled" = false, C-States "Disabled" = true (good for latency), C-States "Enabled" = false (bad for latency), PBO "Enabled" = true, Spread Spectrum "Enabled" = false (adds jitter).

Return ONLY a JSON array. If you cannot read any settings, return an empty array [].
Do not guess settings that are not visible. Only report what you can actually see in the images.
Be honest: if a setting visible in the image is NOT at the recommended gaming value, set isOptimalForGaming to false — this is critical for accurate scoring.`;

// ---------------------------------------------------------------------------
// POST /bios/photo-scan
// Accepts single image (legacy) OR array of up to 5 images (new multi format)
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

  console.log(`[BIOS:photo-scan:${requestId}] ${new Date().toISOString()} | user=${cloudUser?.id ?? "none"} premium=${cloudUser?.isPremium ?? false} | bearer=${!!req.headers.authorization}`);

  if (!cloudUser?.isPremium) {
    console.warn(`[BIOS:photo-scan:${requestId}] FORBIDDEN | user=${cloudUser?.id ?? "none"} premium=false`);
    return res.status(403).json({ error: "Premium required." });
  }

  // Spam protection — reject if this user already has a scan in flight
  const userId = cloudUser.id;
  if (inFlightScans.has(userId)) {
    console.warn(`[BIOS:photo-scan:${requestId}] DUPLICATE in-flight for user=${userId}`);
    return res.status(429).json({ error: "A scan is already in progress. Please wait for it to complete." });
  }

  let openai: OpenAI;
  try {
    openai = getOpenAI();
  } catch {
    console.error(`[BIOS:photo-scan:${requestId}] OPENAI_API_KEY missing on cloud server`);
    return res.status(503).json({ error: "AI service is temporarily unavailable." });
  }

  const scanPromise = (async () => {
    try {
      const parsed = photoScanSchema.safeParse(req.body);
      if (!parsed.success) {
        const sizeIssue = parsed.error.issues.find(i => i.path.includes("imageBase64") && i.code === "too_big");
        if (sizeIssue) return res.status(413).json({ error: "Image too large. Please use an image under 7MB." });
        return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
      }

      // Normalize to array regardless of input format
      let images: Array<{ imageBase64: string; mimeType: string }>;
      if ("images" in parsed.data && parsed.data.images) {
        images = parsed.data.images;
      } else {
        images = [{ imageBase64: (parsed.data as any).imageBase64, mimeType: (parsed.data as any).mimeType }];
      }

      // Total size guard
      const totalChars = images.reduce((sum, img) => sum + img.imageBase64.length, 0);
      if (totalChars > MAX_TOTAL_BASE64_CHARS) {
        return res.status(413).json({ error: "Total upload size too large. Keep total images under 40MB." });
      }

      const imageSizesKb = images.map(img => Math.round(img.imageBase64.length / 1024));
      console.log(`[BIOSUpload] ${JSON.stringify({ count: images.length, sizes: imageSizesKb, requestId })}`);

      // Build OpenAI message content — all images in one call
      const imageBlocks: any[] = images.map(img => ({
        type: "image_url",
        image_url: {
          url: `data:${img.mimeType};base64,${img.imageBase64}`,
          detail: "high",
        },
      }));

      console.log(`[BIOS:photo-scan:${requestId}] Calling OpenAI | user=${cloudUser?.id} | images=${images.length} totalKB=${Math.round(totalChars / 1024)}`);

      const startTime = Date.now();

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: BIOS_PHOTO_PROMPT },
              ...imageBlocks,
            ],
          },
        ],
        max_tokens: Math.min(4000, 1500 + images.length * 500),
        temperature: 0.1,
      });

      const duration = Date.now() - startTime;
      const content = response.choices[0]?.message?.content || "[]";
      console.log(`[BIOS:photo-scan:${requestId}] OpenAI OK | user=${cloudUser?.id} | ${duration}ms | images=${images.length}`);

      let rawSettings: any[] = [];
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) rawSettings = JSON.parse(jsonMatch[0]);
      } catch {
        console.error(`[BIOS:photo-scan:${requestId}] Failed to parse response`);
        return res.status(500).json({ error: "Failed to parse BIOS photo analysis. Please try again." });
      }

      // Validate, whitelist, deduplicate (keep highest confidence per settingId across all images)
      const seenIds = new Map<string, any>();
      let droppedCount = 0;
      let ocrSuccessCount = 0;

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
        ocrSuccessCount++;
        // Keep highest confidence per settingId (merges across images)
        const existing = seenIds.get(settingId);
        if (!existing || confidence > existing.confidence) {
          seenIds.set(settingId, { ...s, confidence });
        }
      }

      const duplicatesRemoved = ocrSuccessCount - seenIds.size;

      console.log(`[BIOSAnalysis] ${JSON.stringify({ imagesProcessed: images.length, ocrSuccess: ocrSuccessCount, combinedSettings: seenIds.size, dropped: droppedCount, duplicatesRemoved, requestId })}`);

      if (droppedCount > 0) {
        console.log(`[BIOS:photo-scan:${requestId}] Dropped ${droppedCount} entries (invalid id, unknown, or low confidence)`);
      }

      const detections = Array.from(seenIds.values()).map((s: any) => {
        const status = s.confidence >= 0.8 ? "Photo Verified" : "Photo Suspected";
        const entry: Record<string, unknown> = {
          settingId: String(s.settingId),
          status,
          confidence: s.confidence,
          reason: `Derived from BIOS photo analysis: ${String(s.reason || s.value)}`,
          detectedValue: String(s.value),
        };
        if (typeof s.isOptimalForGaming === "boolean") {
          entry.isOptimal = s.isOptimalForGaming;
        }
        return entry;
      });

      console.log(`[BIOS:photo-scan:${requestId}] OK | user=${cloudUser?.id} | detections=${detections.length} dropped=${droppedCount}`);
      return res.json({ detections, settingsFound: detections.length, analysisTimeMs: duration, imagesProcessed: images.length });

    } catch (err: any) {
      const status = err?.status;
      console.error(`[BIOS:photo-scan:${requestId}] ERROR | user=${cloudUser?.id} | status=${status} | ${err?.message || "unknown"}`);
      if (status === 429) return res.status(429).json({ error: "Rate limit reached. Please wait a moment." });
      return res.status(500).json({ error: "Photo analysis failed. Please try again." });
    }
  })();

  inFlightScans.set(userId, scanPromise);
  try {
    await scanPromise;
  } finally {
    inFlightScans.delete(userId);
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
  motherboard: z.string().max(200).optional(),
  biosVersion: z.string().max(100).optional(),
  biosDate: z.string().max(50).optional(),
  ramLayout: z.string().max(200).optional(),
  expoXmpState: z.enum(["confirmed", "likely", "unknown"]).optional(),
  secureBoot: z.boolean().nullable().optional(),
  vbsEnabled: z.boolean().nullable().optional(),
  hardwareDetails: z.object({
    platform: z.object({
      tpmPresent: z.boolean().nullable().optional(),
      tpmVersion: z.string().nullable().optional(),
      uefiBoot: z.boolean().nullable().optional(),
      virtualizationEnabled: z.boolean().nullable().optional(),
      hypervisorPresent: z.boolean().nullable().optional(),
    }).optional(),
    cpu: z.object({
      physicalCores: z.number().nullable().optional(),
      logicalCores: z.number().nullable().optional(),
    }).optional(),
    memory: z.object({
      totalMb: z.number().nullable().optional(),
      inferredDualChannel: z.boolean().nullable().optional(),
      sticks: z.array(z.object({
        slot: z.string().nullable().optional(),
        bank: z.string().nullable().optional(),
        sizeMb: z.number().nullable().optional(),
        type: z.string().nullable().optional(),
        clockMhz: z.number().nullable().optional(),
        configuredClockMhz: z.number().nullable().optional(),
        manufacturer: z.string().nullable().optional(),
        partNum: z.string().nullable().optional(),
      })).max(16).optional(),
    }).optional(),
    gpus: z.array(z.object({
      name: z.string().nullable().optional(),
      vendor: z.string().nullable().optional(),
      subVendor: z.string().nullable().optional(),
      vramMb: z.number().nullable().optional(),
      vramDynamic: z.boolean().nullable().optional(),
      bus: z.string().nullable().optional(),
      external: z.boolean().nullable().optional(),
    })).max(8).optional(),
    storage: z.array(z.object({
      name: z.string().nullable().optional(),
      type: z.string().nullable().optional(),
      interfaceType: z.string().nullable().optional(),
      sizeGb: z.number().nullable().optional(),
    })).max(16).optional(),
    displays: z.array(z.object({
      model: z.string().nullable().optional(),
      main: z.boolean().nullable().optional(),
      connection: z.string().nullable().optional(),
      resolutionX: z.number().nullable().optional(),
      resolutionY: z.number().nullable().optional(),
      refreshRate: z.number().nullable().optional(),
    })).max(12).optional(),
    deviceCounts: z.object({
      gpuControllers: z.number().optional(),
      displays: z.number().optional(),
      storageDevices: z.number().optional(),
      networkInterfaces: z.number().optional(),
      audioDevices: z.number().optional(),
    }).optional(),
  }).optional(),
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

    const { cpuModel, gpuModel, ramTotalGB, detections, scores,
            motherboard, biosVersion, biosDate, ramLayout,
            expoXmpState, secureBoot, vbsEnabled, hardwareDetails } = parsed.data;

    console.log(`[BIOS:explain:${requestId}] Calling OpenAI | user=${cloudUser?.id} | cpu=${cpuModel} gpu=${gpuModel} detections=${detections.length} | MB=${motherboard ?? "?"} BIOS=${biosVersion ?? "?"}`);

    const startTime = Date.now();

    const hwLines: string[] = [`Hardware: ${cpuModel}, ${gpuModel}, ${ramTotalGB}GB RAM`];
    if (motherboard) hwLines.push(`Motherboard: ${motherboard}`);
    if (biosVersion) hwLines.push(`BIOS: ${biosVersion}${biosDate ? ` (${biosDate})` : ""}`);
    if (ramLayout) hwLines.push(`RAM Layout: ${ramLayout}`);
    if (expoXmpState) hwLines.push(`EXPO/XMP: ${expoXmpState === "confirmed" ? "Confirmed Active" : expoXmpState === "likely" ? "Likely Active" : "Not Detected"}`);
    if (secureBoot !== null && secureBoot !== undefined) hwLines.push(`Secure Boot: ${secureBoot ? "Enabled" : "Disabled"}`);
    if (vbsEnabled !== null && vbsEnabled !== undefined) hwLines.push(`VBS/Memory Integrity: ${vbsEnabled ? "Enabled (may reduce GPU performance)" : "Disabled"}`);
    if (hardwareDetails) {
      const bool = (v: boolean | null | undefined): string => v === null || v === undefined ? "not exposed" : v ? "enabled" : "disabled";
      const platform = hardwareDetails.platform;
      const cpu = hardwareDetails.cpu;
      const memory = hardwareDetails.memory;
      const counts = hardwareDetails.deviceCounts;
      if (platform) {
        hwLines.push(`TPM: ${bool(platform.tpmPresent)}${platform.tpmVersion ? ` (${platform.tpmVersion})` : ""}`);
        hwLines.push(`Boot mode: ${platform.uefiBoot === null || platform.uefiBoot === undefined ? "not exposed" : platform.uefiBoot ? "UEFI" : "Legacy BIOS"}`);
        hwLines.push(`Virtualization: ${bool(platform.virtualizationEnabled)}; Hypervisor: ${bool(platform.hypervisorPresent)}`);
      }
      if (cpu) hwLines.push(`CPU topology: ${cpu.physicalCores ?? "not exposed"} physical cores, ${cpu.logicalCores ?? "not exposed"} logical cores`);
      if (memory) hwLines.push(`Memory channels: ${memory.inferredDualChannel === null || memory.inferredDualChannel === undefined ? "not exposed" : memory.inferredDualChannel ? "dual-channel inferred" : "single-channel inferred"}`);
      if (hardwareDetails.gpus?.length) hwLines.push(`GPU controllers: ${hardwareDetails.gpus.map(g => `${g.name ?? "unknown"}${g.vramMb ? ` ${Math.round(g.vramMb / 1024)}GB VRAM` : ""}`).join("; ")}`);
      if (hardwareDetails.storage?.length) hwLines.push(`Storage layout: ${hardwareDetails.storage.map(d => `${d.name ?? "unknown"}${d.sizeGb ? ` ${d.sizeGb}GB` : ""}${d.type ? ` ${d.type}` : ""}`).join("; ")}`);
      if (hardwareDetails.displays?.length) hwLines.push(`Displays: ${hardwareDetails.displays.map(d => `${d.model ?? "unknown"}${d.resolutionX && d.resolutionY ? ` ${d.resolutionX}x${d.resolutionY}` : ""}${d.refreshRate ? ` @ ${d.refreshRate}Hz` : ""}`).join("; ")}`);
      if (counts) hwLines.push(`Device counts: ${counts.gpuControllers ?? 0} GPUs, ${counts.displays ?? 0} displays, ${counts.storageDevices ?? 0} storage, ${counts.networkInterfaces ?? 0} network, ${counts.audioDevices ?? 0} audio`);
    }

    const userMessage = `${hwLines.join("\n")}
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
