/**
 * src/lib/security/action-url.ts
 * DMS.3E — Internal action URL allowlisting helper
 *
 * Ensures that notification action_url values are always safe internal
 * relative paths. External URLs, javascript: URIs, path traversal attempts,
 * and any scheme other than a leading "/" are blocked.
 */

/** Allowed leading path prefixes for internal action URLs. */
const ALLOWED_PREFIXES: readonly string[] = [
  "/dms/",
  "/notifications",
  "/admin/dms/",
  "/admin/notifications",
  "/hr/",
  "/parties/",
  "/finance/",
  "/dashboard",
];

/**
 * Patterns that must NOT appear in a safe action URL.
 * Covers absolute URLs, alternative schemes, path traversal, encoded traversal.
 */
const BLOCKED_PATTERN =
  /^(https?:|\/\/|javascript:|data:|vbscript:|file:|mailto:|ftp:)|(\.\.[/\\])|(%2e%2e[%2f%5c])/i;

/**
 * Returns true if the given URL is an allowed internal relative path.
 * Rejects: absolute URLs, alternative schemes, traversal sequences, empty strings.
 */
export function isInternalActionUrlAllowed(url: unknown): url is string {
  if (!url || typeof url !== "string" || url.trim() === "") return false;
  if (BLOCKED_PATTERN.test(url)) return false;
  return ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * Returns `url` if it passes the allowlist check, otherwise returns `fallback`.
 *
 * @param url       The candidate action URL (may be null/undefined).
 * @param fallback  Safe default when the URL is absent or blocked (default: "/notifications").
 */
export function assertInternalActionUrl(
  url: string | null | undefined,
  fallback = "/notifications"
): string {
  if (!url) return fallback;
  return isInternalActionUrlAllowed(url) ? url : fallback;
}
