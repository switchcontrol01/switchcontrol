export interface AiAvailability {
  code: "AI_QUOTA" | "AI_CONFIGURATION";
  message: string;
  until: number;
}
const KEY = "switchcontrol.ai-unavailable.v1";
export const AI_AVAILABILITY_EVENT = "switchcontrol:ai-availability";
let memory: AiAvailability | null = null;

export function getAiUnavailable(): AiAvailability | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    if (value && ["AI_QUOTA", "AI_CONFIGURATION"].includes(value.code) &&
        typeof value.message === "string" && value.until > Date.now() &&
        value.until <= Date.now() + 300_000) memory = value;
  } catch {}
  if (memory && memory.until <= Date.now()) {
    memory = null;
    try { localStorage.removeItem(KEY); } catch {}
  }
  return memory;
}

export function rememberAiUnavailable(code: string | undefined, message: string, retryAfterSeconds = 300): void {
  if (code !== "AI_QUOTA" && code !== "AI_CONFIGURATION") return;
  memory = {
    code, message,
    until: Date.now() + Math.max(1, Math.min(300, retryAfterSeconds)) * 1000,
  };
  try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AI_AVAILABILITY_EVENT));
}

export function clearAiUnavailable(): void {
  memory = null;
  try { localStorage.removeItem(KEY); } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AI_AVAILABILITY_EVENT));
}
