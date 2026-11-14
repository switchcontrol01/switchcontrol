import OpenAI from "openai";
import type { Response } from "express";

export type AiFailureCategory = "quota" | "configuration" | "rate_limit" | "invalid_request" | "temporary" | "unknown";
export interface AiFailure {
  category: AiFailureCategory;
  code: string;
  status: number;
  retryable: boolean;
  retryAfterSeconds: number;
  error: string;
}

export function classifyAiFailure(value: any): AiFailure {
  if (value?.aiFailure) return value.aiFailure;
  if (value?.cause?.aiFailure) return value.cause.aiFailure;
  const status = Number(value?.status ?? value?.statusCode);
  const code = String(value?.code ?? value?.error?.code ?? "");
  const type = String(value?.type ?? value?.error?.type ?? "");
  const quota = /insufficient_quota|billing_hard_limit|billing_not_active|usage_limit_reached/.test(`${code} ${type}`);
  const category: AiFailureCategory = quota ? "quota"
    : value?._cloudConfigError || status === 401 || status === 403 || status === 404 || /invalid_api_key|model_not_found/.test(code) ? "configuration"
    : status === 429 ? "rate_limit"
    : status === 400 || status === 413 || status === 422 ? "invalid_request"
    : status >= 500 || status === 408 || /APIConnection|Timeout|Abort/.test(value?.name ?? "") ||
      /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/.test(String(value?.cause?.code ?? value?.code ?? "")) ||
      (value?.name === "TypeError" && /fetch|network/i.test(value?.message ?? "")) ? "temporary"
    : "unknown";
  const messages = {
    quota: "AI is unavailable because the service's provider credits or quota are exhausted. No automatic retry was made. Rules-based recommendations remain available.",
    configuration: "AI is unavailable because of a service configuration problem. No automatic retry was made. Rules-based recommendations remain available.",
    rate_limit: "AI is temporarily busy. Please wait a minute before trying again.",
    invalid_request: "This AI request could not be processed. Try a shorter conversation or a smaller image.",
    temporary: "AI is temporarily unavailable. Please try again later. Rules-based recommendations remain available.",
    unknown: "AI could not complete this request. Rules-based recommendations remain available.",
  };
  return {
    category, code: `AI_${category.toUpperCase()}`,
    status: category === "rate_limit" ? 429 : category === "invalid_request" ? 422 : category === "temporary" || category === "unknown" ? 502 : 503,
    retryable: category === "rate_limit" || category === "temporary",
    retryAfterSeconds: category === "quota" || category === "configuration" ? 300 : 60,
    error: messages[category],
  };
}

export class AiServiceError extends Error {
  constructor(public aiFailure: AiFailure) {
    super(aiFailure.error);
    this.name = "AiServiceError";
  }
}

// Per server process, shared across all features using this provider key.
// No prompts, images, credentials, or raw provider error messages are retained.
let providerOutage: { failure: AiFailure; until: number } | undefined;

export function sendAiFailure(res: Response, error: unknown) {
  const failure = classifyAiFailure(error);
  res.setHeader("Retry-After", String(failure.retryAfterSeconds));
  return res.status(failure.status).json(failure);
}

export function boundedOutputTokens(value: string | undefined, ceiling: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(ceiling, Math.floor(parsed)) : ceiling;
}

/** Injectable transport for deterministic tests with no paid provider requests. */
export function instrumentAiFetch(feature: string, user: string | undefined, transport: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const started = Date.now();
    let model = "unknown";
    let logged = false;
    const tokens = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
    const record = (outcome: string, usage?: any, failure?: AiFailure) => {
      logged = true;
      console.info(JSON.stringify({
        event: "ai_provider_request", feature, user: user ?? null, model,
        outcome, failureCategory: failure?.category ?? null,
        durationMs: Date.now() - started,
        inputTokens: tokens(usage?.prompt_tokens),
        outputTokens: tokens(usage?.completion_tokens),
        cachedInputTokens: tokens(usage?.prompt_tokens_details?.cached_tokens),
        totalTokens: tokens(usage?.total_tokens),
      }));
    };
    try {
      if (typeof init?.body === "string") {
        const payload = JSON.parse(init.body);
        model = String(payload.model ?? "unknown");
        // Reject oversized text rather than silently dropping hardware/safety instructions.
        const textChars = (payload.messages ?? []).reduce((sum: number, message: any) => sum + (
          typeof message.content === "string" ? message.content.length
            : Array.isArray(message.content) ? message.content.reduce((n: number, part: any) => n + (part.type === "text" ? String(part.text).length : 0), 0) : 0
        ), 0);
        if (textChars > 60_000) throw new AiServiceError(classifyAiFailure({ status: 413 }));
      }
      if (providerOutage && Date.now() < providerOutage.until) {
        const failure = { ...providerOutage.failure, retryAfterSeconds: Math.max(1, Math.ceil((providerOutage.until - Date.now()) / 1000)) };
        record("cooldown", undefined, failure);
        throw new AiServiceError(failure);
      }
      const response = await transport(input, init);
      const body = await response.clone().json().catch(() => null) as any;
      if (response.ok) {
        record("success", body?.usage);
      } else {
        const failure = classifyAiFailure({ status: response.status, ...body?.error });
        if (failure.category === "quota" || failure.category === "configuration") {
          providerOutage = { failure, until: Date.now() + failure.retryAfterSeconds * 1000 };
        }
        record("failure", body?.usage, failure);
      }
      return response;
    } catch (error) {
      if (!logged) record("failure", undefined, classifyAiFailure(error));
      throw error;
    }
  };
}

export function createAiClient(feature: string, user?: string): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const failure = classifyAiFailure({ _cloudConfigError: true });
    console.info(JSON.stringify({ event: "ai_provider_request", feature, user: user ?? null, model: process.env.AI_MODEL || "gpt-4o-mini", outcome: "not_configured", failureCategory: failure.category, inputTokens: null, outputTokens: null, totalTokens: null }));
    throw new AiServiceError(failure);
  }
  return new OpenAI({
    apiKey,
    maxRetries: 0,
    timeout: 25_000,
    fetch: instrumentAiFetch(feature, user),
  });
}

export function compactChatHistory<T>(messages: T[]): T[] {
  return messages.slice(-8);
}

/** Keep client hardware and tweak identities; bound verbose optional diagnostics. */
export function compactAdvisorContext(value: any, depth = 0, field = ""): any {
  if (typeof value === "string") return value.slice(0, 500);
  if (value == null || typeof value !== "object") return value;
  if (depth > 7) return null;
  if (Array.isArray(value)) {
    const limit = /^(enabledTweaks|disabledTweaks|lastRecommendedTweaks)$/.test(field) ? 250 : 20;
    return value.slice(0, limit).map(entry => compactAdvisorContext(entry, depth + 1, field));
  }
  return Object.fromEntries(Object.entries(value).slice(0, 80).map(([key, entry]) => [
    key, compactAdvisorContext(entry, depth + 1, key),
  ]));
}

/** Bounded negative cache, storing only safe failure metadata, not request content. */
export class AiFailureCooldown {
  private entries = new Map<string, { failure: AiFailure; until: number }>();
  get(key: string): AiFailure | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.until <= Date.now()) { this.entries.delete(key); return undefined; }
    return { ...entry.failure, retryAfterSeconds: Math.max(1, Math.ceil((entry.until - Date.now()) / 1000)) };
  }
  set(key: string, error: unknown): void {
    const failure = classifyAiFailure(error);
    this.entries.delete(key);
    this.entries.set(key, { failure, until: Date.now() + failure.retryAfterSeconds * 1000 });
    while (this.entries.size > 100) this.entries.delete(this.entries.keys().next().value!);
  }
}
