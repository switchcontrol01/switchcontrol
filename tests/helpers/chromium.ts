import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";

/** File-protocol browser fixture: no app routes, credentials or native handlers. */
export async function openFileFixture(html: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sc-browser-fixture-"));
  const file = path.join(dir, "fixture.html");
  await fs.writeFile(file, html);
  const chrome = spawn("chromium", ["--headless", "--no-sandbox", "--disable-gpu",
    "--remote-debugging-port=0", `--user-data-dir=${dir}/profile`, "about:blank"],
    { stdio: ["ignore", "ignore", "ignore"] });
  let socket: WebSocket | undefined;
  let command: ((method: string, params?: any, sessionId?: string) => Promise<any>) | undefined;
  const close = async () => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
      socket.close();
    }
    if (chrome.exitCode === null) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { chrome.kill("SIGTERM"); resolve(); }, 1200);
        chrome.once("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
  try {
    let endpoint = "";
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        const [port, pathname] = (await fs.readFile(`${dir}/profile/DevToolsActivePort`, "utf8")).trim().split("\n");
        if (port && pathname) { endpoint = `ws://127.0.0.1:${port}${pathname}`; break; }
      } catch {}
      if (chrome.exitCode !== null) throw new Error("Chromium exited before starting.");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!endpoint) throw new Error("Chromium test connection timed out.");
    socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => { socket!.once("open", resolve); socket!.once("error", reject); });
    let nextId = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    socket.on("message", buffer => {
      const message = JSON.parse(buffer.toString());
      const handler = pending.get(message.id);
      if (!handler) return;
      pending.delete(message.id);
      message.error ? handler.reject(new Error(JSON.stringify(message.error))) : handler.resolve(message.result);
    });
    command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await command("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
    const page = (method: string, params?: any) => command!(method, params, sessionId);
    await page("Page.enable");
    const evaluate = async (expression: string) => {
      const result = await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const waitFor = async (expression: string, timeout = 6000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for browser state: ${expression}`);
    };
    return {
      page, evaluate, waitFor, close,
      navigate: () => page("Page.navigate", { url: `file://${file}` }),
    };
  } catch (error) { await close(); throw error; }
}
