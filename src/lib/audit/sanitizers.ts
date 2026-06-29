import "server-only";

// ── Sensitive field blocklist ─────────────────────────────────────────────────

export const SENSITIVE_FIELD_BLOCKLIST = [
  "password",
  "temporary_password",
  "generated_password",
  "reset_link",
  "invite_link",
  "action_link",
  "token",
  "otp",
  "jwt",
  "cookie",
  "session",
  "refresh_token",
  "access_token",
  "secret",
  "service_role_key",
  "api_key",
  "raw_response",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isBlockedKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_FIELD_BLOCKLIST.some((blocked) => lower.includes(blocked));
}

function redactObject(obj: unknown, depth = 0): unknown {
  if (depth > 10) return "[MAX_DEPTH]";
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (isBlockedKey(k)) {
      result[k] = "[REDACTED]";
    } else {
      result[k] = redactObject(v, depth + 1);
    }
  }
  return result;
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Recursively remove/redact sensitive keys from an audit payload.
 * Use before storing anything in audit_logs.
 */
export function sanitizeSecurityAuditPayload(payload: Record<string, unknown>): Record<string, unknown>;
export function sanitizeSecurityAuditPayload(payload: unknown): unknown;
export function sanitizeSecurityAuditPayload(payload: unknown): unknown {
  return redactObject(payload);
}

/**
 * Sanitize an unknown error for safe user-facing message and audit logging.
 * Never returns stack traces, raw Supabase errors, or internal object dumps.
 */
export function sanitizeServerActionError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    // Surface known ERP user-facing messages verbatim
    if (
      msg.includes("You do not have permission") ||
      msg.includes("Unauthorized") ||
      msg.includes("Forbidden") ||
      msg.includes("Account is") ||
      msg.includes("not active") ||
      msg.includes("suspended") ||
      msg.includes("Cannot ") ||
      msg.includes("already exists") ||
      msg.includes("not found") ||
      msg.includes("required") ||
      msg.includes("invalid") ||
      msg.includes("must be")
    ) {
      return msg;
    }
    // Do not return stack, internal SQL, or raw Supabase errors
    return "An unexpected error occurred. Please try again.";
  }
  if (typeof error === "string") {
    // Short, clearly-user-facing strings are fine
    if (error.length < 200 && !error.toLowerCase().includes("supabase") && !error.includes("\n")) {
      return error;
    }
    return "An unexpected error occurred.";
  }
  return "An unexpected error occurred.";
}

/**
 * Sanitize a payload for display in the audit viewer UI.
 * Same as sanitizeSecurityAuditPayload but safe to call in server components.
 */
export function sanitizeAuditDisplayPayload(payload: unknown): unknown {
  return redactObject(payload);
}
