/** Only application-owned destinations, never arbitrary URLs or callback routes. */
export function safeAuthDestination(value: string | null | undefined, fallback = "/start"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://erp.invalid");
    if (url.origin !== "https://erp.invalid" || url.username || url.password || url.hash) return fallback;
    const allowed = ["/start", "/dashboard", "/admin", "/profile", "/settings", "/notifications", "/dms", "/reports", "/workspace"];
    if (!allowed.some(path => url.pathname === path || url.pathname.startsWith(path + "/"))) return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}

export function isProtectedAppPath(pathname: string): boolean {
  return safeAuthDestination(pathname, "") !== "";
}
