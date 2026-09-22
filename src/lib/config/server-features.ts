import "server-only";

type Environment = Record<string, string | undefined>;

function required(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value || value.startsWith("PASTE_")) throw new Error(`[Configuration] ${name} is required for this feature.`);
  return value;
}

function origin(raw: string, name: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`[Configuration] ${name} must be an HTTP(S) origin.`); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`[Configuration] ${name} must be an HTTP(S) origin without credentials, path, query or fragment.`);
  }
  return url.origin;
}

/** Validated when the feature is called, never while compiling unrelated pages. */
export function getPdfTransportConfig(env: Environment = process.env) {
  const production = env.NODE_ENV === "production";
  const rendererUrl = origin(production ? required(env, "GOTENBERG_URL") : env.GOTENBERG_URL || "http://localhost:3100", "GOTENBERG_URL");
  const internalSiteUrl = origin(production ? required(env, "INTERNAL_SITE_URL") : env.INTERNAL_SITE_URL || "http://localhost:3000", "INTERNAL_SITE_URL");
  const timeoutMs = Number(env.GOTENBERG_TIMEOUT_MS ?? "30000");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new Error("[Configuration] GOTENBERG_TIMEOUT_MS must be an integer from 1000 to 120000.");
  }
  return { rendererUrl, internalSiteUrl, timeoutMs };
}

export function getPrintTokenSecret(env: Environment = process.env): string {
  const value = required(env, "PDF_PRINT_TOKEN_SECRET");
  if (value.length < 32) throw new Error("[Configuration] PDF_PRINT_TOKEN_SECRET must contain at least 32 characters.");
  return value;
}

export function getAdminConfig(env: Environment = process.env) {
  return {
    url: origin(required(env, "NEXT_PUBLIC_SUPABASE_URL"), "NEXT_PUBLIC_SUPABASE_URL"),
    serviceKey: required(env, "SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function assertConfiguredPrintUrl(value: string, internalSiteUrl: string): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("[Gotenberg] Invalid print URL."); }
  if (url.origin !== internalSiteUrl || url.username || url.password || !url.pathname.startsWith("/print/")) {
    // Do not echo URLs: their query strings contain short-lived credentials.
    throw new Error("[Gotenberg] Rejected URL outside the configured internal print route.");
  }
}
