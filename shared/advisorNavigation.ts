/** Old chats and clients can retain destinations that no longer exist. */
export function isRetiredAdvisorRoute(route: string): boolean {
  return route.split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase() === "/process-manager";
}

export function stripRetiredAdvisorLinks(text: string): string {
  return text.replace(/<<NAV:([^:>]+):([^>]+)>>/gi, (marker, route: string) =>
    isRetiredAdvisorRoute(route.trim()) ? "" : marker,
  );
}
