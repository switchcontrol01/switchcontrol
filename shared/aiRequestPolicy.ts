/** A lost POST response does not mean the provider never charged for it. */
export function isBillableAiPath(path: string): boolean {
  return /^\/?(?:api\/)?(?:ai\/(?:chat|advice)|tweak-intelligence\/ai-recommendations|bios\/(?:photo-scan|explain)|security\/image-analysis)(?:[/?]|$)/.test(path);
}

export function shouldRetryCloudPost(path: string, attempt: number, status: number, retryable: boolean): boolean {
  return attempt === 1 && !isBillableAiPath(path) && (status >= 500 || (status === 0 && retryable));
}
