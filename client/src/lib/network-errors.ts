export type CloudErrorKind =
  | 'offline'
  | 'backend-unavailable'
  | 'timeout'
  | 'auth-expired'
  | 'rate-limited'
  | 'unknown';

export interface NormalizedCloudError {
  kind: CloudErrorKind;
  userMessage: string;
  retryable: boolean;
}

export function isOfflineError(err: unknown): boolean {
  if (!navigator.onLine) return true;
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('network request failed') ||
      msg.includes('load failed')
    );
  }
  if (err instanceof DOMException && err.name === 'AbortError') return false;
  return false;
}

export function isTimeoutError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof TypeError) {
    return err.message.toLowerCase().includes('timeout');
  }
  return false;
}

export function isBackendUnavailableError(err: unknown, statusCode?: number): boolean {
  if (statusCode && statusCode >= 502 && statusCode <= 504) return true;
  if (isOfflineError(err)) return false;
  if (err instanceof TypeError && err.message.toLowerCase().includes('failed to fetch')) return true;
  return false;
}

export function getCloudUserFacingError(err: unknown, statusCode?: number): NormalizedCloudError {
  if (!navigator.onLine || isOfflineError(err)) {
    return {
      kind: 'offline',
      userMessage: 'You are offline. Please check your connection and try again.',
      retryable: true,
    };
  }

  if (isTimeoutError(err)) {
    return {
      kind: 'timeout',
      userMessage: 'The request timed out. Please try again.',
      retryable: true,
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      kind: 'auth-expired',
      userMessage: 'Your session has expired. Please sign in again.',
      retryable: false,
    };
  }

  if (statusCode === 429) {
    return {
      kind: 'rate-limited',
      userMessage: 'Too many requests. Please wait a moment and try again.',
      retryable: true,
    };
  }

  if ((statusCode && statusCode >= 500) || isBackendUnavailableError(err, statusCode)) {
    return {
      kind: 'backend-unavailable',
      userMessage: 'SwitchControl services are temporarily unavailable. Local tools still work.',
      retryable: true,
    };
  }

  const msg = err instanceof Error ? err.message : String(err);
  if (msg && msg.length < 180 && !msg.includes('at ') && !msg.includes('Error:')) {
    return { kind: 'unknown', userMessage: msg, retryable: true };
  }

  return {
    kind: 'unknown',
    userMessage: 'Something went wrong. Please try again.',
    retryable: true,
  };
}
