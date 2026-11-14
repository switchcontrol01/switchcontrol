import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import OpenAI from "openai";
import {
  classifyAiFailure, AiServiceError, AiFailureCooldown, boundedOutputTokens,
  compactChatHistory, compactAdvisorContext, instrumentAiFetch, sendAiFailure,
} from "../server/lib/aiService";
import { isBillableAiPath, shouldRetryCloudPost } from "../shared/aiRequestPolicy";
import { clearAiUnavailable, getAiUnavailable, rememberAiUnavailable } from "../client/src/lib/ai-availability";

test("quota is not confused with temporary rate limiting or cloud login failure", () => {
  const quota = classifyAiFailure({ status: 429, code: "insufficient_quota" });
  assert.equal(quota.category, "quota");
  assert.equal(quota.status, 503);
  assert.equal(quota.retryable, false);
  assert.equal(quota.retryAfterSeconds, 300);
  assert.equal(classifyAiFailure({ status: 429, type: "insufficient_quota" }).category, "quota");
  assert.equal(classifyAiFailure({ status: 429 }).category, "rate_limit");
  for (const status of [401, 403, 404]) {
    const failure = classifyAiFailure({ status });
    assert.equal(failure.category, "configuration");
    assert.equal(failure.status, 503);
    assert.equal(failure.retryable, false);
  }
  assert.equal(classifyAiFailure({ _cloudConfigError: true }).category, "configuration");
  assert.equal(classifyAiFailure({ status: 400 }).retryable, false);
  assert.equal(classifyAiFailure({ status: 503 }).category, "temporary");
  assert.equal(classifyAiFailure({ name: "APIConnectionTimeoutError" }).category, "temporary");
  assert.equal(classifyAiFailure({ name: "TypeError", message: "fetch failed" }).category, "temporary");
});

test("SDK-wrapped cooldown failures retain their original category", () => {
  const original = new AiServiceError(classifyAiFailure({ status: 429, code: "insufficient_quota" }));
  assert.equal(classifyAiFailure({ cause: original, name: "APIConnectionError" }).code, "AI_QUOTA");
});

test("all six billable endpoints suppress network and server-error replays; non-AI retries remain", () => {
  for (const path of ["/ai/chat", "/ai/advice", "/bios/photo-scan", "/bios/explain", "/security/image-analysis", "/tweak-intelligence/ai-recommendations"]) {
    assert.equal(isBillableAiPath(path), true, path);
    assert.equal(shouldRetryCloudPost(path, 1, 503, true), false);
    assert.equal(shouldRetryCloudPost(path, 1, 0, true), false);
  }
  assert.equal(shouldRetryCloudPost("/account/profile", 1, 503, true), true);
  assert.equal(shouldRetryCloudPost("/account/profile", 1, 0, true), true);
  assert.equal(shouldRetryCloudPost("/account/profile", 1, 0, false), false);
  assert.equal(shouldRetryCloudPost("/account/profile", 2, 503, true), false);
  assert.equal(isBillableAiPath("/ai/chat-unrelated"), false);
});

test("output settings cannot exceed existing response budgets or become invalid", () => {
  for (const input of [undefined, "", "NaN", "-5", "Infinity", "99999"]) assert.equal(boundedOutputTokens(input, 1100), 1100);
  assert.equal(boundedOutputTokens("450", 1100), 450);
  assert.equal(boundedOutputTokens("450.9", 1100), 450);
  assert.equal(boundedOutputTokens("1601", 1600), 1600);
});

test("chat compaction preserves newest messages and real client hardware", () => {
  const messages = Array.from({ length: 50 }, (_, id) => ({ id }));
  assert.deepEqual(compactChatHistory(messages).map(m => m.id), [42,43,44,45,46,47,48,49]);
  const context = {
    system: { cpu: "Ryzen 7 9800X3D", gpu: "RX 7800 XT", ram: "32GB" },
    enabledTweaks: Array.from({ length: 100 }, (_, id) => ({ id: `tweak-${id}`, title: "Tweak" })),
    diagnostics: Array.from({ length: 100 }, () => ({ detail: "x".repeat(5000) })),
  };
  const compact = compactAdvisorContext(context);
  assert.deepEqual(compact.system, context.system);
  assert.equal(compact.enabledTweaks.length, 100);
  assert.equal(compact.diagnostics.length, 20);
  assert.equal(compact.diagnostics[0].detail.length, 500);
});

test("recommendation failures have a bounded, expiring negative cache", t => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const cache = new AiFailureCooldown();
  cache.set("hardware-a", { status: 429, code: "insufficient_quota" });
  assert.equal(cache.get("hardware-a")?.code, "AI_QUOTA");
  assert.equal(cache.get("hardware-b"), undefined);
  now += 300_001;
  assert.equal(cache.get("hardware-a"), undefined);
  for (let i = 0; i < 101; i++) cache.set(`key-${i}`, new Error("malformed output"));
  assert.equal(cache.get("key-0"), undefined);
  assert.equal(cache.get("key-100")?.category, "unknown");
});

test("availability persists quota/config failures only and recovers without permanent lockout", t => {
  let now = 10_000;
  t.mock.method(Date, "now", () => now);
  const storage = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  try {
    rememberAiUnavailable("AI_TEMPORARY", "Temporary", 60);
    assert.equal(getAiUnavailable(), null);
    rememberAiUnavailable("AI_QUOTA", "Credits exhausted; rules still available.", 300);
    assert.equal(getAiUnavailable()?.code, "AI_QUOTA");
    assert.equal(storage.size, 1);
    clearAiUnavailable();
    assert.equal(getAiUnavailable(), null);
    assert.equal(storage.size, 0);
    rememberAiUnavailable("AI_QUOTA", "Credits exhausted; rules still available.", 300);
    assert.equal(getAiUnavailable()?.code, "AI_QUOTA");
    now += 300_001;
    assert.equal(getAiUnavailable(), null);
    assert.equal(storage.size, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("safe HTTP errors never echo raw provider details", () => {
  let body: any, status: number | undefined;
  const response: any = {
    setHeader: () => {},
    status: (value: number) => { status = value; return response; },
    json: (value: any) => { body = value; return response; },
  };
  sendAiFailure(response, { status: 401, message: "raw credential-like data must not appear" });
  assert.equal(status, 503);
  assert.equal(body.code, "AI_CONFIGURATION");
  assert.equal(JSON.stringify(body).includes("raw credential"), false);
});

test("usage telemetry logs feature/model/user/tokens without prompts, image data, or credentials", async t => {
  const logs: string[] = [];
  t.mock.method(console, "info", (line: string) => logs.push(line));
  let forwarded: any;
  const transport: typeof fetch = async (_input, init) => {
    forwarded = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      id: "test-completion", object: "chat.completion", created: 0, model: "test-model",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"answer":"ok"}' } }],
      usage: { prompt_tokens: 123, completion_tokens: 45, total_tokens: 168, prompt_tokens_details: { cached_tokens: 30 } },
    }), { headers: { "content-type": "application/json" } });
  };
  const client = new OpenAI({ apiKey: "not-a-real-key", maxRetries: 0, fetch: instrumentAiFetch("advisor.chat", "test-user", transport) });
  await client.chat.completions.create({
    model: "test-model", max_tokens: 900, response_format: { type: "json_object" },
    messages: [{ role: "user", content: [
      { type: "text", text: "private prompt marker" },
      { type: "image_url", image_url: { url: "data:image/png;base64,private-image-marker" } },
    ] }],
  });
  assert.equal(forwarded.response_format.type, "json_object");
  assert.equal(forwarded.messages[0].content[1].type, "image_url");
  const record = JSON.parse(logs[0]);
  assert.equal(record.feature, "advisor.chat");
  assert.equal(record.user, "test-user");
  assert.equal(record.model, "test-model");
  assert.equal(record.inputTokens, 123);
  assert.equal(record.outputTokens, 45);
  assert.equal(record.totalTokens, 168);
  assert.equal(record.cachedInputTokens, 30);
  assert.doesNotMatch(logs.join(""), /private prompt marker|private-image-marker|not-a-real-key/);
});

test("oversized text is rejected before invoking a provider", async () => {
  let calls = 0;
  const transport = instrumentAiFetch("advisor.chat", "test", async () => {
    calls++; return new Response("{}");
  });
  await assert.rejects(transport("https://example.test", { body: JSON.stringify({ model: "test", messages: [{ content: "x".repeat(60_001) }] }) }));
  assert.equal(calls, 0);
});

test("routes use the shared no-retry client, negative cache and quota notice", () => {
  const service = fs.readFileSync("server/lib/aiService.ts", "utf8");
  assert.match(service, /maxRetries: 0/);
  for (const file of ["ai", "bios", "security", "tweakIntelligence"]) {
    const source = fs.readFileSync(`server/routes/${file}.ts`, "utf8");
    assert.doesNotMatch(source, /new OpenAI\(/);
    assert.match(source, /createAiClient/);
    assert.match(source, /sendAiFailure/);
  }
  const recs = fs.readFileSync("server/routes/tweakIntelligence.ts", "utf8");
  assert.match(recs, /aiRecsFailures\.get\(key\)/);
  assert.match(recs, /aiRecsFailures\.set\(key, error\)/);
  assert.match(fs.readFileSync("client/src/pages/AiAdvisor.tsx", "utf8"), /ai-unavailable-notice/);
});

// Run last: shared quota circuit is intentionally process-global.
test("quota response prevents a second paid request across different features", async t => {
  const logs: string[] = [];
  t.mock.method(console, "info", (line: string) => logs.push(line));
  let calls = 0;
  const transport: typeof fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ error: { code: "insufficient_quota", message: "PRIVATE provider details" } }), { status: 429 });
  };
  const client = new OpenAI({ apiKey: "not-real", maxRetries: 0, fetch: instrumentAiFetch("advisor.chat", "test", transport) });
  await assert.rejects(client.chat.completions.create({ model: "test", messages: [{ role: "user", content: "test" }] }),
    (error: any) => classifyAiFailure(error).code === "AI_QUOTA");
  const otherFeature = new OpenAI({ apiKey: "not-real", maxRetries: 0, fetch: instrumentAiFetch("bios.photo", "test", transport) });
  await assert.rejects(otherFeature.chat.completions.create({ model: "test", messages: [{ role: "user", content: "test" }] }),
    (error: any) => classifyAiFailure(error).code === "AI_QUOTA");
  assert.equal(calls, 1);
  assert.equal(JSON.parse(logs[0]).failureCategory, "quota");
  assert.equal(JSON.parse(logs[1]).outcome, "cooldown");
  assert.doesNotMatch(logs.join(""), /PRIVATE provider details/);
});
