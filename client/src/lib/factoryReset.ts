export const FACTORY_RESET_IPC_TIMEOUT_MS = 5_000;

export interface FactoryResetFailure {
  entry?: string;
  path?: string;
  error?: string;
}

export interface FactoryResetResult {
  ok: boolean;
  error?: string;
  message?: string;
  startedAt?: string;
  preservedFiles?: string[];
  failures?: FactoryResetFailure[];
  relaunchScheduled?: boolean;
}

/**
 * Electron exits shortly after a successful reset. Keep the renderer from
 * waiting forever if a broken/native build drops the IPC reply instead.
 */
export function invokeFactoryResetWithTimeout(
  invoke: () => Promise<unknown>,
  timeoutMs = FACTORY_RESET_IPC_TIMEOUT_MS,
): Promise<unknown> {
  const boundedTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : FACTORY_RESET_IPC_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("The desktop reset did not respond. It may still be running; please restart SwitchControl and try again."));
    }, boundedTimeout);

    const settle = (callback: (value: unknown) => void, value: unknown) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      callback(value);
    };

    let pending: Promise<unknown>;
    try {
      pending = Promise.resolve(invoke());
    } catch (error) {
      settle(reject, error);
      return;
    }
    pending.then(
      (value) => settle(resolve, value),
      (error) => settle(reject, error),
    );
  });
}

export function isSuccessfulFactoryResetResult(
  value: unknown,
): value is FactoryResetResult & { ok: true; relaunchScheduled: true } {
  return !!value &&
    typeof value === "object" &&
    (value as FactoryResetResult).ok === true &&
    (value as FactoryResetResult).relaunchScheduled === true;
}

export function describeFactoryResetFailure(value: unknown): string {
  if (value && typeof value === "object") {
    const result = value as FactoryResetResult;
    const details = (result.failures ?? [])
      .map((failure) => failure.entry ? `${failure.entry}: ${failure.error || "deletion failed"}` : failure.error)
      .filter(Boolean)
      .join("; ");
    if (result.message) return details ? `${result.message} Details: ${details}` : result.message;
    if (details) return `Factory reset failed. Details: ${details}`;
    if (result.error) return `Factory reset failed (${result.error}).`;
  }
  return "Factory reset did not return a valid success result. Please try again.";
}