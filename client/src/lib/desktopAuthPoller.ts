export function retryDelayMs(header: string | null, bodySeconds?: unknown, now = Date.now()) {
  const seconds = header !== null && header.trim() !== "" ? Number(header) : NaN;
  const date = header ? Date.parse(header) : NaN;
  const body = Number(bodySeconds);
  const delay = Number.isFinite(seconds) ? seconds * 1000
    : Number.isFinite(date) ? date - now
    : Number.isFinite(body) && body > 0 ? body * 1000 : 60_000;
  return Math.max(2000, delay);
}

/** Response-paced polling. A single owner cancels timers and in-flight fetches. */
export function startDesktopAuthPoller(options: {
  url: string;
  isActive: () => boolean;
  onCode: (code: string) => void;
  onBackoff: (seconds: number) => void;
  onTimeout: () => void;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let controller: AbortController | undefined;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(deadline);
    controller?.abort();
  };
  const deadline = setTimeout(() => {
    const active = !stopped && options.isActive();
    stop();
    if (active) options.onTimeout();
  }, options.timeoutMs ?? 300_000);
  const poll = async () => {
    if (stopped || !options.isActive()) { stop(); return; }
    controller = new AbortController();
    const requestTimeout = setTimeout(() => controller?.abort(), 15_000);
    let delay = 2000;
    try {
      const response = await (options.fetcher ?? fetch)(options.url, {
        signal: controller.signal,
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (stopped || !options.isActive()) { stop(); return; }
      if (response.status === 429) {
        delay = retryDelayMs(response.headers.get("Retry-After"), data.retryAfter);
        options.onBackoff(Math.ceil(delay / 1000));
      } else if (response.ok && data.ready && typeof data.code === "string") {
        stop();
        options.onCode(data.code);
        return;
      }
    } catch {
      // Transient network failures retry, unless the attempt was cancelled.
    } finally {
      clearTimeout(requestTimeout);
    }
    if (!stopped) timer = setTimeout(poll, delay);
  };
  timer = setTimeout(poll, 2000);
  return stop;
}
