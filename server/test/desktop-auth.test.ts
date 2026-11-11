import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import { mountAuthRateLimits, AUTH_BUDGETS, BoundedAuthStore } from "../middleware/authRateLimits";
import { DesktopPollCodes } from "../auth/desktopPollCodes";
import { startDesktopAuthPoller, retryDelayMs } from "../../client/src/lib/desktopAuthPoller";

test("multi-minute shared-IP polling cannot consume callback/exchange budgets; abuse is limited", async () => {
  const app = express();
  mountAuthRateLimits(app);
  const codes = new DesktopPollCodes();
  for (const provider of ["google", "discord"]) {
    app.get(`/auth/${provider}`, (_req, res) => res.sendStatus(200));
    // Provider authentication itself is deliberately stubbed: no live credentials/accounts.
    app.get(`/api/auth/${provider}/callback`, (req, res) => {
      codes.store(String(req.query.token), "authenticated-code");
      res.sendStatus(200);
    });
  }
  app.get("/api/auth/desktop-poll", (req, res) => res.json(codes.consume(String(req.query.token))));
  app.post("/api/auth/exchange", (req, res) => {
    res.sendStatus(req.headers.authorization === "Bearer authenticated-code" ? 200 : 401);
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  const request = (path: string, method = "GET", headers = {}) =>
    fetch(url + path, { method, headers });
  try {
    for (const provider of ["google", "discord"]) {
      assert.equal((await request(`/auth/${provider}`)).status, 200);
    }
    // Four minutes, ten independent desktop tokens on the same public address.
    // The old broad 40/15min bucket would fail within the first minute.
    for (let second = 0; second < 240; second += 2) {
      now += 2000;
      for (let attempt = 0; attempt < 10; attempt++) {
        const response = await request(`/api/auth/desktop-poll?token=attempt_token_00${attempt}`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { ready: false });
      }
    }
    for (const [i, provider] of ["google", "discord"].entries()) {
      const token = `attempt_token_00${i}`;
      assert.equal((await request(`/api/auth/${provider}/callback?token=${token}`)).status, 200);
      assert.deepEqual(await (await request(`/api/auth/desktop-poll?token=${token}`)).json(),
        { ready: true, code: "authenticated-code" });
      assert.deepEqual(await (await request(`/api/auth/desktop-poll?token=${token}`)).json(), { ready: false });
      assert.equal((await request("/api/auth/exchange", "POST",
        { authorization: "Bearer authenticated-code" })).status, 200);
    }
    // Rotating client-chosen tokens/device IDs cannot escape any IP budget.
    for (let n = 0; n <= AUTH_BUDGETS.poll.limit; n++) {
      const response = await request(`/api/auth/desktop-poll?token=rotated_token_${n}`,
        "GET", { "x-device-id": `rotated_device_id_${n}` });
      if (response.status === 429) {
        assert.ok(Number(response.headers.get("retry-after")) > 0);
        assert.ok((await response.json()).retryAfter > 0);
        break;
      }
      assert.ok(n < AUTH_BUDGETS.poll.limit, "poll flood must be blocked");
    }
    // Even an exhausted poll budget leaves provider callbacks and exchange usable.
    assert.equal((await request("/api/auth/google/callback?token=another_token_000")).status, 200);
    assert.equal((await request("/api/auth/exchange", "POST",
      { authorization: "Bearer authenticated-code" })).status, 200);
    for (const [path, budget, method] of [
      ["/auth/discord", "start", "GET"],
      ["/api/auth/discord/callback", "callback", "GET"],
      ["/api/auth/exchange", "exchange", "POST"],
    ] as const) {
      let blocked = false;
      for (let n = 0; n <= AUTH_BUDGETS[budget].limit; n++) {
        const response = await request(path, method, { "x-device-id": `different_device_${n}` });
        if (response.status === 429) { blocked = true; break; }
      }
      assert.ok(blocked, `${budget} abuse must be blocked`);
    }
  } finally {
    Date.now = realNow;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("bounded IP counters retain live budgets and share overflow; poll codes expire and consume once", async () => {
  const store = new BoundedAuthStore(2);
  store.init({ windowMs: 60_000 });
  await store.increment("a");
  await store.increment("b");
  assert.equal((await store.increment("c")).totalHits, 1);
  assert.equal((await store.increment("d")).totalHits, 2);
  assert.equal((await store.increment("a")).totalHits, 2);
  const codes = new DesktopPollCodes(2, 0);
  codes.store("valid_poll_token_0", "expired");
  assert.deepEqual(codes.consume("valid_poll_token_0"), { ready: false, expired: true });
  const bounded = new DesktopPollCodes(2);
  for (let n = 0; n < 3; n++) bounded.store(`valid_poll_token_${n}`, String(n));
  assert.deepEqual(bounded.consume("valid_poll_token_0"), { ready: false });
  assert.deepEqual(bounded.consume("valid_poll_token_2"), { ready: true, code: "2" });
  assert.deepEqual(bounded.consume("valid_poll_token_2"), { ready: false });
});

// Deterministic response/timer harness, including fetches that ignore abort.
async function withClock(run: (clock: { tick: (ms: number) => Promise<void> }) => Promise<void>) {
  const originalSet = global.setTimeout;
  const originalClear = global.clearTimeout;
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  global.setTimeout = ((fn: () => void, ms: number) => {
    timers.set(++id, { at: now + ms, fn }); return id;
  }) as any;
  global.clearTimeout = ((key: number) => timers.delete(key)) as any;
  const flush = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
  try {
    await run({ tick: async ms => {
      const target = now + ms;
      while (true) {
        const next = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
        await flush();
      }
      now = target;
      await flush();
    } });
  } finally { global.setTimeout = originalSet; global.clearTimeout = originalClear; }
}

test("client honors retry header/body/date, paces responses, cancels stale codes, and times out", async () => {
  assert.equal(retryDelayMs("45", 3), 45_000);
  assert.equal(retryDelayMs(null, 12), 12_000);
  assert.equal(retryDelayMs(new Date(90_000).toUTCString(), undefined, 0), 90_000);
  assert.equal(retryDelayMs(null), 60_000);
  await withClock(async clock => {
    let calls = 0;
    let backoff = 0;
    let received = "";
    let resolveFetch!: (r: Response) => void;
    let signal: AbortSignal | undefined;
    const stop = startDesktopAuthPoller({
      url: "/poll", isActive: () => true, onCode: code => { received = code; },
      onBackoff: seconds => { backoff = seconds; }, onTimeout: () => assert.fail("unexpected timeout"),
      fetcher: (async (_url, init) => {
        calls++;
        signal = init?.signal as AbortSignal;
        if (calls === 1) return Response.json({ retryAfter: 10 }, { status: 429 });
        return new Promise<Response>(resolve => { resolveFetch = resolve; });
      }) as typeof fetch,
    });
    await clock.tick(2000);
    assert.equal(backoff, 10);
    await clock.tick(9999);
    assert.equal(calls, 1);
    await clock.tick(1);
    await clock.tick(8000);
    assert.equal(calls, 2, "no overlapping request while response is pending");
    stop();
    assert.equal(signal?.aborted, true);
    resolveFetch(Response.json({ ready: true, code: "obsolete" }));
    await clock.tick(60_000);
    assert.equal(received, "");
    assert.equal(calls, 2);
    let timedOut = 0;
    let timeoutSignal: AbortSignal | undefined;
    startDesktopAuthPoller({
      url: "/poll", isActive: () => true, onCode: () => assert.fail("late code"),
      onBackoff: () => {}, onTimeout: () => { timedOut++; }, timeoutMs: 5000,
      fetcher: (async (_url, init) => {
        timeoutSignal = init?.signal as AbortSignal;
        return new Promise(() => {});
      }) as typeof fetch,
    });
    await clock.tick(5000);
    assert.equal(timedOut, 1);
    assert.equal(timeoutSignal?.aborted, true);
  });
});

test("replacement/deep-link cancellation stops old attempts; response-paced completion runs once", async () => {
  await withClock(async clock => {
    let active = true;
    let calls = 0;
    let codes = 0;
    const options = {
      url: "/poll", isActive: () => active,
      onCode: () => { codes++; },
      onBackoff: () => {}, onTimeout: () => assert.fail("unexpected timeout"),
      fetcher: (async () => {
        calls++;
        return Response.json({ ready: true, code: "fresh" });
      }) as typeof fetch,
    };
    const obsolete = startDesktopAuthPoller(options);
    obsolete(); // replacement/unmount uses the same cancellation contract
    startDesktopAuthPoller(options);
    await clock.tick(60_000);
    assert.equal(calls, 1);
    assert.equal(codes, 1);
    startDesktopAuthPoller(options);
    active = false; // callback_received/exchanging via deep link
    await clock.tick(60_000);
    assert.equal(calls, 1);
    assert.equal(codes, 1);
  });
});

test("production wiring has one auth budget layer and both provider callbacks store poll codes", () => {
  const read = (file: string) => readFileSync(file, "utf8");
  const index = read("server/index.ts");
  assert.equal((index.match(/mountAuthRateLimits\(app\)/g) || []).length, 1);
  assert.ok(!index.includes('app.use("/api/auth", authLimiter)'));
  for (const provider of ["google", "discord"]) {
    const source = read(`server/auth/${provider}.ts`);
    assert.ok(source.includes(`"/api/auth/${provider}/callback"`));
    assert.ok(source.includes("storePollCode(pollToken, code)"));
    assert.ok(source.includes("passport.authenticate("));
  }
  const google = read("server/auth/google.ts");
  assert.ok(!google.includes("_pollAttempts"));
  assert.ok(!google.includes("_exchangeAttempts"));
  assert.ok(google.includes("desktopPollCodes.consume(token)"));
  assert.ok(google.includes("consumeElectronCode(code)"));
  assert.match(google, /prompt:\s*source\s*===\s*["']electron["']\s*\?\s*["']select_account["']/);
  const login = read("client/src/screens/Login.tsx");
  assert.ok(!login.includes("setInterval("));
  assert.ok(login.includes("attemptRef.current?.abort()"));
  assert.ok(login.includes("attemptRef.current !== attempt"));
});
