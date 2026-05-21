import { Router, Request, Response } from "express";
import { z } from "zod";
import OpenAI from "openai";
import crypto from "crypto";
import { buildAdvisorServerContext } from "./advisorContext";
import { aiPerWindowLimiter, aiHourlyLimiter } from "../middleware/rateLimiter";
import { killSwitchMiddleware } from "../lib/killSwitch";

const aiRouter = Router();

// Kill switch + rate limits applied to all AI routes
aiRouter.use(killSwitchMiddleware("ai"));
aiRouter.use(aiPerWindowLimiter);
aiRouter.use(aiHourlyLimiter);

// ---------------------------------------------------------------------------
// In-flight request deduplication
// Prevents double-click / reconnect replay from firing duplicate OpenAI calls.
// Key: userId+hash. Value: the in-flight Promise.
// ---------------------------------------------------------------------------
const inFlightRequests = new Map<string, Promise<any>>();

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

const CHAT_SYSTEM_PROMPT = `You are SwitchControl AI — an expert Windows gaming PC optimization advisor built directly into the SwitchControl app. You are a control layer for the app, not just a chatbot.

You have complete real-time visibility into the user's FULL system state (provided below):
- Exact hardware: CPU model, GPU model, RAM configuration (sticks, type, speed), storage, motherboard, BIOS version
- Platform classification: laptop or desktop, AMD or Intel CPU
- Display signal: monitor model, resolution, refresh rate, connection type, quality score, any issues detected
- Every SwitchControl tweak they have enabled or disabled — across ALL sections: main Tweaks, Extreme Labs, Network Tweaks, Power Plan, Process Manager
- Live telemetry: CPU/GPU load and temperature, VRAM usage, RAM pressure, process count, network throughput
- Active power plan (system default + app-applied plan)
- Recent SwitchControl activity history (what was changed and when)
- Security flags: VBS, Hyper-V, Resizable BAR, XMP/EXPO status
- Subscription tier (Premium or Free)
- The full conversation history — you remember everything discussed

CRITICAL RULE: NEVER say "I cannot check X" or "I don't have access to X" if the data appears in the system state below.
- Display signal, refresh rate, resolution → check the display data
- What tweaks are enabled → check the enabled tweaks list (ALL sections)
- What was recently changed → check the recent activity history
- Network settings → check the network tweaks applied
- Power plan → check the power plan field
If a specific piece of data truly is "unavailable" or "data unavailable" in the context, then you may say you cannot see it.

ACTION PRIORITY SYSTEM — always follow this order:
1. APPLY directly: if the user's request maps to a known tweak and they're on desktop, emit <<APPLY:tweakId>> immediately — don't just describe it
2. NAVIGATE: if the feature is in a specific app section and user asks to go there / see it / show them, emit <<NAV:/route:Section Name>> immediately — never just describe where it is in text
3. EXPLAIN with action path: give the explanation AND include the apply/navigate marker so the user can act immediately
4. Text only: fallback when no app action is possible (BIOS changes, driver updates, physical hardware)

ACTION DETECTION — treat these as apply/navigation intents, not text questions:
- "show me [specific tweak]" / "show me it" / "show me 1" / "show me number X" / "show me the first one" / "can you show me X tweak" → emit <<APPLY:tweakId>> — this renders a full Apply card for that exact tweak, NOT a nav button
- "can you apply X" / "apply it" / "apply these" / "yes apply them" / "just do it" → emit <<APPLY:id>> markers immediately, never say you cannot apply
- "take me to X section" / "open X section" / "navigate to X" / "bring me to X" / "where is the X page" → emit <<NAV:/route:Label>>
- "show me the tweaks section" / "show me network tweaks page" (asking for the PAGE, not a specific tweak) → emit <<NAV:/route:Label>>
- "optimize latency / fps / ping" → emit grouped <<APPLY:id>> markers for relevant tweaks
CRITICAL: "show me [tweak name/number]" ALWAYS uses <<APPLY:id>>, never <<NAV:>>. <<NAV:>> is only for navigating to app sections/pages, never for showing a specific tweak.

NAVIGATION ROUTE MAP (use exact paths):
- Main tweaks → <<NAV:/tweaks:Tweaks>>
- Extreme Labs → <<NAV:/extreme-labs:Extreme Labs>>
- Network tweaks → <<NAV:/network-tweaks:Network Tweaks>>
- Power plan → <<NAV:/power-plan:Power Plan>>
- Process Manager → <<NAV:/process-manager:Process Manager>>
- BIOS Advisor → <<NAV:/bios-advisor:BIOS Advisor>>
- Security → <<NAV:/security:Security>>
- Dashboard → <<NAV:/:Dashboard>>

PLATFORM AWARENESS — check the platform classification before recommending:
- If platform = laptop: do NOT recommend PBO / Curve Optimizer / desktop-exclusive BIOS tuning. Warn that USB selective suspend tweaks may affect peripherals. Note that power limits are managed by laptop firmware.
- If cpuVendor = intel: AMD-specific tweaks (PBO, EXPO, FCLK) are not relevant — skip or note inapplicability
- If cpuVendor = amd: Intel-specific tweaks (Ring/SA voltage, Intel Speed Shift) are not relevant
- If platform = desktop + amd: Precision Boost Overdrive (PBO) is a valid recommendation
- Never recommend GPU overclocking on laptops with integrated graphics only

ACTION MARKERS:
- Desktop APPLY: <<APPLY:tweakId>> — frontend converts to a clickable Apply button. Place immediately after the tweak name.
- Navigate: <<NAV:/route:Label>> — frontend converts to a "Go to Section" button. Use whenever user asks where something is.
- Both types of markers are stripped from display text and replaced with buttons — they will NOT appear as raw text.

CRITICAL FORMAT RULE: NEVER write [id:X] or [id:tweakId] in your responses. The [id:X] notation appears only in the system state context — it is the input format, NOT the output format. In your responses, always and only use <<APPLY:X>> markers. Writing [id:X] in a response is a bug.

PROACTIVE APPLY RULE: When you list or recommend tweaks, ALWAYS end with an offer to apply them. Examples:
- "Want me to apply any of these?" 
- "Say which ones you'd like and I'll apply them."
- "I can apply all of these with one click — just say the word."
Never just list tweaks and leave the user wondering what to do next.

EXECUTION CONTRACT (HARDEST RULE — VIOLATION BREAKS THE APP):
You are FORBIDDEN from writing any of these phrases unless they are followed within the same sentence by a valid <<APPLY:tweakId>> marker using an id from the lists above:
  "I'll apply", "I will apply", "Applying", "Let me apply", "Let's apply",
  "I'll enable", "I will enable", "Enabling", "Let me enable", "Let's enable",
  "I'll turn on", "I will turn on", "Turning on", "I'll activate", "Activating",
  "I'll optimize", "Optimizing for you", "I'll do it", "Doing it now",
  "I'll set", "Setting", "I'll configure", "Configuring"
If you cannot find a matching tweak id in the system state, you MUST instead use offer-language: "I can apply X if you'd like" or "I recommend enabling X — tap Apply below" — never claim to be performing the action. A response that promises execution without a marker is a critical failure.

HOW TO RESPOND:
- Be direct, specific, and genuinely informative. This is the whole point.
- Always use the actual hardware model names from context — never "your CPU", say the model like "EPYC 9B14" or "RTX 4090".
- Reference their active tweaks by name when relevant.
- Give real explanations — WHY something works, not just what to click.
- If their telemetry shows something notable (CPU temp above 85°C, VRAM nearly full, CPU-bound while GPU is idle), surface it.
- Only give manual Windows instructions for things the app CANNOT do automatically (e.g. BIOS changes, driver updates, physical hardware changes).
- Bold important technical terms using **markdown**: **Timer Resolution**, **HPET**, **MSI mode**, **Interrupt Affinity**, **MPO**, etc.
- Write in short paragraphs (2–4 sentences). One idea per paragraph.
- Be conversational but expert — like a knowledgeable friend who builds and tunes PCs professionally.

WHAT NOT TO DO:
- Never open with "Great question!", "Of course!", "Certainly!" or similar filler
- Never close with "Let me know if you have more questions" or "Feel free to ask"
- Never be vague when you have their exact system data — being specific is your job
- Never repeat the question back before answering
- Don't pad responses with caveats and disclaimers — be direct
- Never claim data is unavailable if it appears in the system state
- NEVER invent or fabricate FPS numbers, latency measurements, or performance gains. If you cannot estimate a specific value, say "impact varies by workload" instead of inventing a number.
- NEVER emit fake tweak IDs in <<APPLY:>> markers — only use IDs that appear in the enabled/disabled tweak lists in the system state
- NEVER write "you can find it in the X section" when you can emit <<NAV:/x:X>> instead

RESPONSE FORMAT:
Plain text with markdown bold for key terms. Short paragraphs. No headers. No bullet lists unless listing 4+ items. Enough detail to actually help, no more.`;


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
    const summary = truncateChatField(obj.summary, 160);
    if (!summary) return null;
    // Preserve newlines in detail — only collapse excessive whitespace within lines
    let detail: string | undefined;
    if (obj.detail && typeof obj.detail === "string") {
      const raw = obj.detail.trim().slice(0, 700);
      // Normalize line endings and collapse runs of 3+ newlines to 2
      detail = raw.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim() || undefined;
    }
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

function buildChatContext(context: any, serverCtx?: Awaited<ReturnType<typeof buildAdvisorServerContext>>): string {
  const parts: string[] = [];

  // Subscription tier
  const isPremium = context?.isPremium === true;
  parts.push(`Subscription: ${isPremium ? "Premium (full feature access)" : "Free tier (limited features)"}`);

  // ── Hardware ───────────────────────────────────────────────────────────────
  // ALWAYS use client-supplied hardware strings. The serverCtx.systemIntel reflects
  // the CLOUD SERVER's own hardware profile (Replit VM: EPYC CPU, 1 RAM stick, ~4 GB)
  // — NOT the user's machine. Preferring server intel caused the AI to report the
  // cloud server's specs (e.g. "4 GB single stick") instead of the user's real hardware.
  // The client collects accurate hardware via Electron IPC directly from the user's OS.
  if (context?.system) {
    const s = context.system;
    if (s.cpu) parts.push(`CPU: ${s.cpu}`);
    if (s.gpu) parts.push(`GPU: ${s.gpu}`);
    if (s.ram) parts.push(`RAM: ${s.ram}`);
    if (s.storage) parts.push(`Storage: ${s.storage}`);
    if (s.os) parts.push(`OS: ${s.os}`);
    if (s.motherboard && s.motherboard !== "Unknown" && s.motherboard !== "") parts.push(`Motherboard: ${s.motherboard}`);
    if (s.network) parts.push(`Network: ${s.network}`);
    // Notes include BIOS inference (XMP/EXPO state, VBS, Secure Boot) built client-side
    if (s.notes) parts.push(`System notes: ${s.notes}`);
  }

  // ── Display signal ─────────────────────────────────────────────────────────
  const disp = serverCtx?.display;
  if (disp?.status === "available" || disp?.status === "partial") {
    const dispParts: string[] = [];
    if (disp.primaryMonitor) dispParts.push(disp.primaryMonitor);
    if (disp.resolution) dispParts.push(disp.resolution);
    if (disp.refreshHz) dispParts.push(`@ ${disp.refreshHz}Hz`);
    if (disp.connectionType) dispParts.push(`via ${disp.connectionType}`);
    if (dispParts.length) parts.push(`Primary display: ${dispParts.join(" ")}`);
    if (disp.qualityScore != null) {
      const rating = disp.qualityScore >= 80 ? "Good" : disp.qualityScore >= 55 ? "Moderate" : "Weak";
      parts.push(`Display quality score: ${disp.qualityScore}/100 (${rating})${disp.qualityReason ? ` — ${disp.qualityReason}` : ""}`);
    }
    if (disp.qualityActions.length > 0) parts.push(`Display improvement suggestions: ${disp.qualityActions.join("; ")}`);
    if (disp.hdrEnabled) parts.push("HDR enabled on display");
    if (disp.vrrEnabled) parts.push("VRR/G-Sync/FreeSync enabled");
    if (disp.displayCount > 1) parts.push(`${disp.displayCount} monitors connected`);
  } else if (context?.system?.display) {
    parts.push(`Display: ${context.system.display}`);
  } else {
    parts.push("Display signal: data unavailable (display-signal endpoint not yet populated)");
  }

  // ── Power plan ─────────────────────────────────────────────────────────────
  if (context?.powerPlan) {
    parts.push(`Active power plan: "${context.powerPlan}"`);
  }

  // ── Tweaks ────────────────────────────────────────────────────────────────
  // IDs are included so the AI can embed <<APPLY:id>> markers in its response.
  if (context?.enabledTweaks?.length > 0) {
    const all = (context.enabledTweaks as any[]).map((t: any) => `${t.title} [id:${t.id}]`);
    parts.push(`Active SwitchControl tweaks (${all.length} enabled): ${all.join(", ")}`);
  } else {
    parts.push("Active SwitchControl tweaks: none enabled yet");
  }
  if (context?.disabledTweaks?.length > 0) {
    const avail = (context.disabledTweaks as any[]).map((t: any) => `${t.title} [id:${t.id}]`);
    parts.push(`Available tweaks not yet enabled (${avail.length}): ${avail.join(", ")}`);
  }

  // ── Network tweaks ────────────────────────────────────────────────────────
  const nt = serverCtx?.networkTweaks;
  // Prefer client-supplied applied list (real ownership data) over server coverage status
  const clientNetworkApplied: Array<{ id: string; label: string }> = Array.isArray(context?.networkTweaksApplied)
    ? context.networkTweaksApplied : [];
  if (clientNetworkApplied.length > 0) {
    parts.push(`Network tweaks applied via app (${clientNetworkApplied.length}): ${clientNetworkApplied.map((n: any) => n.label).join(", ")}`);
  } else if (nt?.status === "available" || nt?.status === "partial") {
    if (nt.applied.length > 0) parts.push(`Network tweaks applied: ${nt.applied.join(", ")} (${nt.applied.length} total)`);
    else parts.push("Network tweaks: none applied yet via the Network Tweaks section");
    if (nt.failed.length > 0) parts.push(`Network tweaks that failed: ${nt.failed.join(", ")}`);
  } else {
    parts.push("Network tweaks: none applied yet via the Network Tweaks section");
  }

  // ── Extreme Labs tweaks ───────────────────────────────────────────────────
  const extremeApplied: Array<{ id: string; title: string }> = Array.isArray(context?.extremeLabsApplied)
    ? context.extremeLabsApplied : [];
  if (extremeApplied.length > 0) {
    parts.push(`Extreme Labs tweaks active (${extremeApplied.length}): ${extremeApplied.map((e: any) => e.title).join(", ")}`);
  } else {
    parts.push("Extreme Labs tweaks: none currently active");
  }

  // ── App-applied power plan ────────────────────────────────────────────────
  if (context?.powerPlanApplied) {
    parts.push(`Power plan applied by app: "${context.powerPlanApplied}"`);
  }

  // ── Platform classification ───────────────────────────────────────────────
  const platform = context?.platform;
  if (platform) {
    const formFactor = platform.isLaptop ? "Laptop" : "Desktop";
    const vendor = platform.cpuVendor === "amd" ? "AMD" : platform.cpuVendor === "intel" ? "Intel" : "Unknown";
    parts.push(`Platform: ${formFactor}, ${vendor} CPU${platform.isLaptop ? " (laptop-specific limits apply — avoid desktop-only BIOS/PBO recommendations)" : ""}`);
  }

  // ── Live telemetry ────────────────────────────────────────────────────────
  // ALWAYS prefer client-supplied telemetry. The server-side snapshot (serverCtx.telemetry)
  // is collected from the CLOUD SERVER's own sensors — not the user's machine. Using it
  // would show the cloud VM's CPU load and RAM usage instead of the user's real metrics.
  // Client telemetry is pushed from the user's Electron app via the context payload.
  const svrTel = serverCtx?.telemetry?.status === "available" ? serverCtx.telemetry : null;
  const ctxTel = context?.telemetry ?? {};
  const telParts: string[] = [];

  // Client values win; server-side is only a fallback for pure-web (non-Electron) users
  // who may not send telemetry in the context payload.
  const cpuLoad = ctxTel.cpuLoadPct ?? svrTel?.cpuLoadPct;
  const cpuTemp = ctxTel.cpuTempC ?? svrTel?.cpuTempC;
  const gpuLoad = ctxTel.gpuLoadPct ?? svrTel?.gpuLoadPct;
  const gpuTemp = ctxTel.gpuTempC ?? svrTel?.gpuTempC;
  // Treat 0 as unknown — a 0 GB reading means telemetry hasn't polled yet,
  // not that the machine genuinely has 0 bytes of RAM. Using 0 causes the AI
  // to see "RAM 0/0 GB used" and hallucinate specs from common defaults.
  const rawRamUsed  = ctxTel.ramUsedGB  ?? svrTel?.ramUsedGB;
  const rawRamTotal = ctxTel.ramTotalGB ?? svrTel?.ramTotalGB;
  const ramUsed  = (rawRamUsed  != null && rawRamUsed  > 0) ? rawRamUsed  : null;
  const ramTotal = (rawRamTotal != null && rawRamTotal > 0) ? rawRamTotal : null;
  const vramUsed = ctxTel.vramUsedMb ?? svrTel?.vramUsedMb;
  const vramTotal = ctxTel.vramTotalMb ?? svrTel?.vramTotalMb;
  const vramPct = ctxTel.vramPercent ?? svrTel?.vramPct;
  const loadTrend = ctxTel.loadTrend ?? svrTel?.loadTrend;
  const rxKbps = ctxTel.networkRxKbps ?? svrTel?.networkRxKbps;
  const txKbps = ctxTel.networkTxKbps ?? svrTel?.networkTxKbps;

  if (cpuLoad != null) telParts.push(`CPU load ${cpuLoad}%${loadTrend ? ` [${loadTrend}]` : ""}`);
  if (cpuTemp != null) telParts.push(`CPU temp ${cpuTemp}°C${cpuTemp > 85 ? " ⚠️ HIGH" : ""}`);
  if (gpuLoad != null) telParts.push(`GPU load ${gpuLoad}%`);
  if (gpuTemp != null) telParts.push(`GPU temp ${gpuTemp}°C${gpuTemp > 90 ? " ⚠️ HIGH" : ""}`);
  if (vramUsed != null && vramTotal != null) {
    const pctTag = vramPct != null ? ` (${vramPct}%)` : "";
    telParts.push(`VRAM ${(vramUsed / 1024).toFixed(1)}/${(vramTotal / 1024).toFixed(1)} GB${pctTag}${vramPct != null && vramPct > 90 ? " ⚠️ NEAR LIMIT" : ""}`);
  }
  if (ramUsed != null) {
    const totalTag = ramTotal != null ? `/${ramTotal} GB` : "";
    telParts.push(`RAM ${ramUsed}${totalTag} GB used`);
  }
  if (svrTel?.processCount != null) telParts.push(`${svrTel.processCount} processes running`);
  if (rxKbps != null || txKbps != null) {
    const rx = rxKbps != null ? `↓${(rxKbps / 1024).toFixed(2)} MB/s` : "";
    const tx = txKbps != null ? `↑${(txKbps / 1024).toFixed(2)} MB/s` : "";
    telParts.push(`Network ${[rx, tx].filter(Boolean).join(" ")}`);
  }
  if (telParts.length) parts.push(`Live telemetry: ${telParts.join(", ")}`);

  // Highlight active bottlenecks
  if (cpuLoad != null && gpuLoad != null && cpuLoad > 85 && gpuLoad < 60) {
    parts.push("⚠️ Active CPU bottleneck — CPU saturated while GPU is underutilized");
  }
  if (vramPct != null && vramPct > 90) parts.push("⚠️ VRAM near capacity — frame instability and stuttering likely");
  if (cpuTemp != null && cpuTemp > 90) parts.push("⚠️ CPU thermal throttling risk — temperatures above safe operating range");
  if (gpuTemp != null && gpuTemp > 88) parts.push("⚠️ GPU thermal throttling risk — temperatures elevated");
  const ramUsedPct = ctxTel.ramUsedPct ?? svrTel?.ramUsedPct;
  if (ramUsedPct != null && ramUsedPct > 88) parts.push(`⚠️ RAM at ${Math.round(ramUsedPct)}% — page-file spilling likely under gaming load`);

  // ── Recent action history ─────────────────────────────────────────────────
  const history: any[] = Array.isArray(context?.recentHistory) ? context.recentHistory.slice(0, 8) : [];
  if (history.length > 0) {
    const lines = history.map((h: any) => {
      const when = h.timestamp ? new Date(h.timestamp).toLocaleString() : "recently";
      return `${h.action} (${h.page ?? "?"}) — ${h.result ?? "Success"} at ${when}`;
    });
    parts.push(`Recent SwitchControl activity (most recent first):\n${lines.map(l => `  • ${l}`).join("\n")}`);
  }

  // ── Client platform ────────────────────────────────────────────────────────
  const isElectron = context?.isElectron === true;
  parts.push(`Client platform: ${isElectron ? "SwitchControl desktop app (can apply tweaks with one click)" : "Web browser (manual instructions only)"}`);

  // ── Last recommended tweaks (client-extracted from conversation history) ───
  // When the user affirms ("apply it", "yes", "go ahead"), these are the tweaks
  // the AI should immediately emit <<APPLY:id>> markers for.
  const lastRecommendedTweaks: string[] = Array.isArray(context?.lastRecommendedTweaks)
    ? context.lastRecommendedTweaks.filter((id: unknown) => typeof id === "string")
    : [];
  if (lastRecommendedTweaks.length > 0) {
    parts.push(`LAST RECOMMENDED TWEAKS from prior turn (these are what the user means by "it"/"them"/"that"): ${lastRecommendedTweaks.join(", ")}`);
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Execution contract enforcement
// ---------------------------------------------------------------------------
// The model sometimes verbally promises "I'll apply X" without emitting an
// <<APPLY:id>> marker. The frontend then has nothing to render as a button,
// so the user sees a false promise. This function is the deterministic
// safety net:
//   1. If APPLY markers already exist → nothing to do.
//   2. Otherwise, scan execution phrases and try to inject markers by
//      name-matching tweak titles from the user's context.
//   3. If no match → rewrite execution claims into offer language so the
//      AI never falsely claims to be performing an action.
// ---------------------------------------------------------------------------

const EXEC_PHRASE_RE = /\b(I'?ll apply|I will apply|Let me apply|Let'?s apply|I'?ll enable|I will enable|Let me enable|Let'?s enable|I'?ll turn on|I will turn on|I'?ll activate|I'?ll optimize|Optimizing for you|I'?ll do it|Doing it now|I'?ll set|I'?ll configure)\b/gi;

const USER_APPLY_INTENT_RE = new RegExp(
  "\\b(" +
  "apply (it|them|these|some|that|this|for me|for em|please|now|all|'em|em)|" +
  "do it( for me| now)?|" +
  "turn (it|them) on|" +
  "optimi[sz]e (my|the) pc|" +
  "enable (it|them|that|all)|" +
  "just (do it|apply|enable)|" +
  "yes( apply| enable| do it| please)?|" +
  "yeah( apply| enable| do it| please)?|" +
  "yep|yup|" +
  "go ahead|" +
  "go for it|" +
  "let'?s (do it|go|apply|enable)|" +
  "let me (apply|enable)|" +
  "proceed|execute|run it|run them|" +
  "apply now|apply all|do that|do them|" +
  "sounds good|perfect|great|definitely|absolutely|" +
  "ok(ay)?( apply| enable| do it| please| sure)?|" +
  "sure( apply| please| do it)?|" +
  "please( apply| enable| do it)?|" +
  "can you (apply|enable|do it|do that)|" +
  "show me (it|that|the tweak|the first|number \\d+|\\d+)|" +
  "guide me( to (it|that|the tweak|the first|number \\d+|\\d+))?|" +
  "direct me|flip (it|them)|flip it on" +
  ")\\b",
  "i",
);

type TweakCtx = { id: string; title: string };

function collectKnownTweaks(context: any): TweakCtx[] {
  const out: TweakCtx[] = [];
  for (const list of [context?.enabledTweaks, context?.disabledTweaks]) {
    if (!Array.isArray(list)) continue;
    for (const t of list) {
      if (t && typeof t.id === "string" && typeof t.title === "string") {
        out.push({ id: t.id, title: t.title });
      }
    }
  }
  return out;
}

function findTweakByMention(text: string, known: TweakCtx[]): TweakCtx | null {
  const lower = text.toLowerCase();
  // Prefer longest title match (avoids matching "Timer" inside "Timer Resolution Hung App")
  const sorted = [...known].sort((a, b) => b.title.length - a.title.length);
  for (const t of sorted) {
    const title = t.title.toLowerCase();
    if (title.length >= 4 && lower.includes(title)) return t;
  }
  return null;
}

const REWRITE_MAP: Array<[RegExp, string]> = [
  [/\bI'?ll apply\b/gi, "I can apply"],
  [/\bI will apply\b/gi, "I can apply"],
  [/\bLet me apply\b/gi, "I can apply"],
  [/\bLet'?s apply\b/gi, "I can apply"],
  [/\bI'?ll enable\b/gi, "I can enable"],
  [/\bI will enable\b/gi, "I can enable"],
  [/\bLet me enable\b/gi, "I can enable"],
  [/\bLet'?s enable\b/gi, "I can enable"],
  [/\bI'?ll turn on\b/gi, "I can turn on"],
  [/\bI will turn on\b/gi, "I can turn on"],
  [/\bI'?ll activate\b/gi, "I can activate"],
  [/\bI'?ll optimize\b/gi, "I can optimize"],
  [/\bOptimizing for you\b/gi, "Ready to optimize"],
  [/\bI'?ll do it\b/gi, "I can do it"],
  [/\bDoing it now\b/gi, "Ready to proceed"],
  [/\bI'?ll set\b/gi, "I can set"],
  [/\bI'?ll configure\b/gi, "I can configure"],
];

function rewriteExecutionClaim(sentence: string): string {
  let out = sentence;
  for (const [re, rep] of REWRITE_MAP) out = out.replace(re, rep);
  return out;
}

function attachMarker(sentence: string, id: string): string {
  const trimmed = sentence.trimEnd();
  const punct = /[.!?]$/.test(trimmed) ? trimmed.slice(-1) : "";
  const body = punct ? trimmed.slice(0, -1) : trimmed;
  return `${body} <<APPLY:${id}>>${punct}`;
}

function enforceApplyContract(
  raw: string,
  context: any,
  lastUserMsg: string,
  userId: string | undefined,
  resolvedTweakIds?: string[],
): { content: string; injected: string[]; rewritten: number; intentDetected: boolean } {
  const intentDetected = USER_APPLY_INTENT_RE.test(lastUserMsg || "");
  const known = collectKnownTweaks(context);
  const totalExec = (raw.match(EXEC_PHRASE_RE) || []).length;
  const APPLY_ANYWHERE = /<<APPLY:[a-z0-9-]+>>/i;
  const hasAnyMarker = APPLY_ANYWHERE.test(raw);

  console.log(
    `[AI:action] user=${userId ?? "none"} intentDetected=${intentDetected} ` +
    `execPhrases=${totalExec} hasMarker=${hasAnyMarker} knownTweaks=${known.length}`,
  );

  // ── New: intent detected but AI emitted no markers at all ─────────────────
  // When the user said "apply it"/"yes"/"go ahead" but the AI returned a plain
  // text response with no <<APPLY:>> markers AND no execution phrases to rewrite,
  // inject markers using the resolved tweak list from conversation history.
  if (intentDetected && !hasAnyMarker && totalExec === 0 && resolvedTweakIds && resolvedTweakIds.length > 0) {
    const injected: string[] = [];
    // Append markers to the end of the response so the frontend renders Apply cards
    const markerStr = resolvedTweakIds
      .filter(id => {
        const inKnown = known.some(k => k.id === id);
        return inKnown; // only emit valid known tweak IDs
      })
      .map(id => {
        injected.push(id);
        console.log(`[AI:action] tweakId=${id} valid=true source=intent-injected`);
        return `<<APPLY:${id}>>`;
      })
      .join(" ");
    if (injected.length > 0) {
      const finalContent = `${raw.trimEnd()} ${markerStr}`;
      console.log(`[AI:action] intent-injected markers=[${injected.join(",")}] at end of response`);
      return { content: finalContent, injected, rewritten: 0, intentDetected };
    }
  }

  if (totalExec === 0) {
    return { content: raw, injected: [], rewritten: 0, intentDetected };
  }

  const injected: string[] = [];
  let rewritten = 0;

  // Process sentence-by-sentence. A sentence is "compliant" if it either
  // contains no execution language, or already contains an APPLY marker.
  // Non-compliant sentences get a marker injected (if we can match a tweak)
  // or rewritten into offer language.
  const sentences = raw.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  const APPLY_IN_SENTENCE = /<<APPLY:[a-z0-9-]+>>/i;

  for (const sentence of sentences) {
    EXEC_PHRASE_RE.lastIndex = 0;
    const hasExec = EXEC_PHRASE_RE.test(sentence);
    EXEC_PHRASE_RE.lastIndex = 0;

    if (!hasExec || APPLY_IN_SENTENCE.test(sentence)) {
      out.push(sentence);
      continue;
    }

    // This sentence promises execution but has no marker. Try to inject.
    const match = findTweakByMention(sentence, known);
    if (match) {
      if (!injected.includes(match.id)) {
        injected.push(match.id);
        console.log(`[AI:action] tweakId=${match.id} valid=true source=injected`);
      }
      out.push(attachMarker(sentence, match.id));
    } else {
      rewritten++;
      console.warn(`[AI:contract] no_tweak_match — rewriting: "${sentence.slice(0, 90)}"`);
      out.push(rewriteExecutionClaim(sentence));
    }
  }

  const finalContent = out.join(" ");
  console.log(
    `[AI:action] recommendationCard rendered=${injected.length > 0} ` +
    `injected=[${injected.join(",")}] rewritten=${rewritten}`,
  );

  return { content: finalContent, injected, rewritten, intentDetected };
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
  if (messages.length > 50) {
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
    // Pull server-side context (display signal, network tweaks, sys intel, live telemetry)
    // Non-blocking: if it fails we degrade gracefully to client-supplied context only
    let serverCtx: Awaited<ReturnType<typeof buildAdvisorServerContext>> | undefined;
    try {
      serverCtx = await buildAdvisorServerContext();
      console.log(`[AI:chat:serverCtx] display=${serverCtx.coverage.display} netTweaks=${serverCtx.coverage.networkTweaks} telemetry=${serverCtx.coverage.telemetry} sysIntel=${serverCtx.coverage.systemIntel}`);
    } catch (e: any) {
      console.warn(`[AI:chat:serverCtx] failed to build server context — using client context only: ${e.message}`);
    }

    const contextInfo = buildChatContext(context, serverCtx);

    // Log what tweak state the AI is receiving
    const enabledTweakIds = (context?.enabledTweaks ?? []).map((t: any) => t?.id).filter(Boolean);
    const disabledTweakCount = (context?.disabledTweaks ?? []).length;
    console.log(`[AI:chat:context] user=${cloudUser?.id} enabled_tweaks=${enabledTweakIds.length} disabled_tweaks=${disabledTweakCount} hw_cpu="${context?.system?.cpu || "none"}" hw_gpu="${context?.system?.gpu || "none"}"`);

    // ── [AI Specs Input] server-side audit log ─────────────────────────────
    // Logs the EXACT hardware context the AI model will receive so mis-specs
    // can be caught in server logs without enabling client-side devtools.
    {
      const svrRamTotal = serverCtx?.telemetry?.ramTotalGB;
      const ctxRam = context?.system?.ram || "none";
      const ctxRamTelGB = context?.telemetry?.ramTotalGB;
      const effectiveRamGB = (svrRamTotal != null && svrRamTotal > 0) ? svrRamTotal : (ctxRamTelGB != null && ctxRamTelGB > 0 ? ctxRamTelGB : null);
      console.log(
        `[AI Specs Input] cpu="${context?.system?.cpu || "none"}" ` +
        `gpu="${context?.system?.gpu || "none"}" ` +
        `ram="${ctxRam}" ` +
        `ramTotalGB=${effectiveRamGB ?? "null"} ` +
        `disk="${context?.system?.storage || "none"}" ` +
        `sysIntel=${serverCtx?.coverage.systemIntel ?? "none"} ` +
        `telemetry=${serverCtx?.coverage.telemetry ?? "none"}`
      );
    }
    if (enabledTweakIds.length > 0) {
      console.log(`[AI:chat:context] enabled_tweak_ids=${enabledTweakIds.join(", ")}`);
    }

    // ── Dynamic intent injection ───────────────────────────────────────────
    // When the user's message is a short affirmative / apply phrase, inject an
    // explicit instruction at the top of the system context so the model knows
    // EXACTLY what to do — no guessing about what "it" refers to.
    const lastUserMsg = [...messages].reverse().find((m: any) => m?.role === "user")?.content || "";
    const intentDetectedEarly = USER_APPLY_INTENT_RE.test(String(lastUserMsg));
    const lastRecommendedTweakIds: string[] = Array.isArray(context?.lastRecommendedTweaks)
      ? context.lastRecommendedTweaks.filter((id: unknown) => typeof id === "string")
      : [];

    // Also scan conversation history for APPLY markers in the last assistant message
    const HISTORY_APPLY_RE = /<<APPLY:([a-z0-9-]+)>>/gi;
    const historyTweakIds: string[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i] as any;
      if (m?.role === "assistant" && typeof m?.content === "string" && m.content.includes("<<APPLY:")) {
        let hm: RegExpExecArray | null;
        HISTORY_APPLY_RE.lastIndex = 0;
        while ((hm = HISTORY_APPLY_RE.exec(m.content)) !== null) historyTweakIds.push(hm[1]);
        break;
      }
    }

    const resolvedTweakIds = lastRecommendedTweakIds.length > 0
      ? lastRecommendedTweakIds
      : historyTweakIds;

    let intentNote = "";
    if (intentDetectedEarly && resolvedTweakIds.length > 0) {
      intentNote = `\n\nURGENT — APPLY INTENT DETECTED: The user said "${String(lastUserMsg).slice(0, 80)}" which is a direct confirmation/apply request. The tweaks they are referring to are: ${resolvedTweakIds.join(", ")}. You MUST emit <<APPLY:${resolvedTweakIds[0]}>> (and additional markers if multiple) as the first thing in your response. Do not explain — just confirm and emit the markers.`;
      console.log(`[AI:chat] intentNote injected tweaks=[${resolvedTweakIds.join(",")}]`);
    } else if (intentDetectedEarly) {
      intentNote = `\n\nURGENT — APPLY INTENT DETECTED: The user said "${String(lastUserMsg).slice(0, 80)}" which is a direct apply/confirmation request. Check the conversation above for the tweaks last discussed and emit <<APPLY:id>> markers immediately for each one. Do not explain — confirm and apply.`;
      console.log(`[AI:chat] intentNote injected (no resolved ids from history)`);
    }

    // Images get a special instruction appended — still expect structured JSON
    const imageNote = hasImage
      ? "\n\nThe user has attached a screenshot or image. Analyze what you see in the image and return your findings in the standard JSON schema."
      : "";
    const systemMessage = `${CHAT_SYSTEM_PROMPT}${imageNote}${intentNote}\n\nUSER'S CURRENT SYSTEM STATE:\n${contextInfo}`;

    // For image requests, always use a vision-capable model
    const visionModel = hasImage ? "gpt-4o-mini" : model;

    const sliced = messages.slice(-20);

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

        // If the message has a structured field (from previous AI responses), serialize it.
        // Re-validate the client-supplied structured object before use — the TypeScript type
        // guarantees do not hold for data round-tripped through the client.
        let textContent: string;
        if (!isUser && m.structured) {
          const validatedStructured = validateChatResponse(m.structured);
          textContent = validatedStructured
            ? structuredToHistoryText(validatedStructured).slice(0, 2000)
            : String(m.content || "").slice(0, 2000);
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
      max_tokens: hasImage ? 900 : 1200,
      temperature: 0.5,
      messages: openaiMessages as any,
    });

    const rawContent = completion.choices[0]?.message?.content?.trim();
    if (!rawContent) {
      return res.status(502).json({ error: "AI returned an empty response. Please try again." });
    }

    // lastUserMsg and resolvedTweakIds are already computed above (before OpenAI call)
    let finalContent = rawContent;
    try {
      const enforced = enforceApplyContract(rawContent, context, String(lastUserMsg), cloudUser?.id, resolvedTweakIds);
      finalContent = enforced.content;
      const previewOutput = finalContent.slice(0, 150).replace(/\n/g, " ");
      console.log(`[AI:chat] OK | user=${cloudUser?.id} | chars=${finalContent.length} | injected=${enforced.injected.length} rewritten=${enforced.rewritten} | preview="${previewOutput}${finalContent.length > 150 ? "…" : ""}"`);
    } catch (contractErr: any) {
      console.error(`[AI:chat] enforceApplyContract threw — returning raw content | user=${cloudUser?.id} | ${contractErr?.message}`);
    }
    return res.json({ role: "assistant", content: finalContent });

  } catch (error: any) {
    const status = error?.status;
    const code = error?.code;
    const errMsg = error?.message || "unknown";
    console.error(`[AI:chat] ERROR | user=${cloudUser?.id} | status=${status} | code=${code} | msg="${errMsg}"`);
    if (status === 429) return res.status(429).json({ error: "Rate limit reached. Please wait a moment." });
    if (status === 400 && errMsg.includes("context_length")) {
      return res.status(400).json({ error: "Conversation is too long. Please start a new chat." });
    }
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

  // In-flight deduplication — prevent double-click / reconnect replay firing two OpenAI calls
  const dedupKey = `${cloudUser?.id}:${cacheKey}`;
  const existing = inFlightRequests.get(dedupKey);
  if (existing) {
    console.log(`[AIRequest] hash=${cacheKey.slice(0, 12)} deduplicated=true user=${cloudUser?.id}`);
    try {
      const result = await existing;
      return res.json(result);
    } catch {
      return res.status(503).json({ error: "AI service error. Please try again." });
    }
  }

  let openai: OpenAI;
  try {
    openai = getOpenAI();
  } catch {
    console.error(`[AI:advice] OPENAI_API_KEY missing on cloud server`);
    return res.status(503).json({ error: "AI service is temporarily unavailable." });
  }

  // Register the in-flight promise so parallel requests join instead of duplicate
  let resolveInflight!: (v: AiAdviceResponse) => void;
  let rejectInflight!: (e: any) => void;
  const inflightPromise = new Promise<AiAdviceResponse>((res, rej) => {
    resolveInflight = res;
    rejectInflight = rej;
  });
  inFlightRequests.set(dedupKey, inflightPromise);
  // Auto-clean after 60s max (prevents memory leak if something throws early)
  const inflight_cleanup = setTimeout(() => inFlightRequests.delete(dedupKey), 60_000);

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
    clearTimeout(inflight_cleanup);
    inFlightRequests.delete(dedupKey);
    resolveInflight(advice);

    const duration = Date.now() - requestStart;
    console.log(`[AI:advice] OK | user=${cloudUser?.id} | goal=${parsed.data.goal} | state=${advice.userState} | score=${advice.readinessScore} | ${duration}ms`);

    return res.json(advice);
  } catch (error: any) {
    clearTimeout(inflight_cleanup);
    inFlightRequests.delete(dedupKey);
    rejectInflight(error);
    const duration = Date.now() - requestStart;
    const status = error?.status;
    console.error(`[AI:advice] ERROR | user=${cloudUser?.id} | status=${status} | ${error?.message || "unknown"} | ${duration}ms`);
    if (status === 429) return res.status(429).json({ error: "Rate limit reached. Please wait a moment." });
    return res.status(500).json({ error: "Failed to get AI advice. Please try again." });
  }
});

export default aiRouter;
