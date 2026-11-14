import crypto from "crypto";

export type AiRequestResultSource = "fresh" | "cache" | "in-flight";

export class AiIdempotencyConflictError extends Error {
  constructor() {
    super("This request ID was already used with different input.");
    this.name = "AiIdempotencyConflictError";
  }
}

interface CacheEntry<T> {
  fingerprint: string;
  value: T;
  expiresAt: number;
}

interface InFlightEntry<T> {
  fingerprint: string;
  promise: Promise<T>;
}

/**
 * Process-local cache for successful AI responses. Keys and fingerprints should
 * be hashes; raw prompts and images are never retained in this cache.
 */
export class AiRequestResultCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<string, InFlightEntry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 200,
  ) {}

  async run(
    key: string,
    fingerprint: string,
    work: () => Promise<T>,
  ): Promise<{ value: T; source: AiRequestResultSource }> {
    const now = Date.now();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) {
      if (cached.fingerprint !== fingerprint) throw new AiIdempotencyConflictError();
      return { value: cached.value, source: "cache" };
    }
    if (cached) this.entries.delete(key);

    const active = this.inFlight.get(key);
    if (active) {
      if (active.fingerprint !== fingerprint) throw new AiIdempotencyConflictError();
      return { value: await active.promise, source: "in-flight" };
    }

    const promise = Promise.resolve().then(work);
    this.inFlight.set(key, { fingerprint, promise });
    try {
      const value = await promise;
      this.entries.delete(key);
      this.entries.set(key, { fingerprint, value, expiresAt: Date.now() + this.ttlMs });
      this.evictExpiredAndOldest();
      return { value, source: "fresh" };
    } finally {
      if (this.inFlight.get(key)?.promise === promise) this.inFlight.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  private evictExpiredAndOldest(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.entries.entries())) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Hash structured request data without retaining or logging its contents. */
export function hashAiRequest(value: unknown): string {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

/** Incrementally hash large string parts, such as base64 images. */
export function hashAiRequestParts(...parts: string[]): string {
  const hash = crypto.createHash("sha256");
  for (const part of parts) hash.update(part).update("\0");
  return hash.digest("hex");
}
