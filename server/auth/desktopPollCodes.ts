/** Codes are short-lived, single-read, and bounded independently of IP limits. */
export class DesktopPollCodes {
  private entries = new Map<string, { code: string; issuedAt: number }>();
  constructor(private capacity = 5000, private ttl = 120_000) {}
  store(token: string, code: string) {
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(token)) return;
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now - entry.issuedAt >= this.ttl) this.entries.delete(key);
    }
    if (this.entries.size >= this.capacity && !this.entries.has(token)) {
      this.entries.delete(this.entries.keys().next().value!);
    }
    this.entries.set(token, { code, issuedAt: now });
  }
  consume(token: string) {
    const entry = this.entries.get(token);
    this.entries.delete(token);
    if (!entry) return { ready: false };
    if (Date.now() - entry.issuedAt >= this.ttl) return { ready: false, expired: true };
    return { ready: true, code: entry.code };
  }
}
