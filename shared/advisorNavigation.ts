/** Old chats and clients can retain destinations that no longer exist. */
export function isRetiredAdvisorRoute(route: string): boolean {
  return ["/process-manager", "/nic-tuning"].includes(
    route.split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase(),
  );
}

export function isRetiredAdvisorTweak(id: unknown): boolean {
  return typeof id === "string" && id.toLowerCase().startsWith("nic-");
}

/** Older renderers can submit removed controls even after the server upgrades. */
export function supportedAdvisorContext(input: any): any {
  if (!input || typeof input !== "object") return input;
  const { nicTuning: _retired, ...context } = input;
  for (const key of ["enabledTweaks", "disabledTweaks", "networkTweaksApplied", "sliderTweaks"]) {
    if (Array.isArray(context[key])) {
      context[key] = context[key].filter((item: any) => !isRetiredAdvisorTweak(item?.id));
    }
  }
  if (Array.isArray(context.lastRecommendedTweaks)) {
    context.lastRecommendedTweaks = context.lastRecommendedTweaks.filter((id: unknown) => !isRetiredAdvisorTweak(id));
  }
  return context;
}

export function stripRetiredAdvisorLinks(text: string): string {
  return text.replace(/<<APPLY:(nic-[^>]+)>>/gi, "").replace(/<<NAV:([^:>]+):([^>]+)>>/gi, (marker, route: string) =>
    isRetiredAdvisorRoute(route.trim()) ? "" : marker,
  );
}
