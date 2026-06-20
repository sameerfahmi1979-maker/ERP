// ERP COMMON AI.14 — Audit Payload Sanitizer
// Masks sensitive values before sending to AI or UI.
// No raw OCR / content_text / prompt / AI response / API keys / IBAN / TRN exposed.

const SENSITIVE_KEY_PATTERNS = [
  /iban/i,
  /bank_account/i,
  /account_number/i,
  /api_key/i,
  /secret/i,
  /trn/i,
  /tax_registration_number/i,
  /password/i,
  /token/i,
  /ocr_text/i,
  /content_text/i,
  /raw_ocr/i,
  /prompt/i,
  /ai_response/i,
  /embedding/i,
];

const SAFE_FIELD_PATTERNS = [
  /name/i,
  /status/i,
  /type/i,
  /level/i,
  /score/i,
  /date/i,
  /code/i,
  /reference/i,
  /module/i,
  /action/i,
  /entity/i,
  /risk/i,
  /compliance/i,
  /enabled/i,
  /expiry/i,
  /created/i,
  /updated/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
}

function isSafeKey(key: string): boolean {
  return SAFE_FIELD_PATTERNS.some((p) => p.test(key));
}

export function sanitizeAuditValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (isSensitiveKey(key)) return "[redacted]";

  const str = String(value);
  if (str.length > 200) return str.slice(0, 200) + "…";
  return str;
}

export function sanitizeAuditPayload(payload: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!payload) return {};
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(payload)) {
    if (isSafeKey(key) || !isSensitiveKey(key)) {
      result[key] = sanitizeAuditValue(key, val);
    }
  }
  return result;
}

export function buildSafeAuditDiff(
  oldValues: Record<string, unknown> | null | undefined,
  newValues: Record<string, unknown> | null | undefined
): string[] {
  const changes: string[] = [];
  const allKeys = new Set([
    ...Object.keys(oldValues ?? {}),
    ...Object.keys(newValues ?? {}),
  ]);

  for (const key of allKeys) {
    if (isSensitiveKey(key)) continue;
    const old = oldValues?.[key];
    const neu = newValues?.[key];
    if (old !== neu) {
      const oldStr = old === null || old === undefined ? "(empty)" : String(old).slice(0, 80);
      const newStr = neu === null || neu === undefined ? "(empty)" : String(neu).slice(0, 80);
      changes.push(`${key}: "${oldStr}" → "${newStr}"`);
    }
  }

  return changes.slice(0, 10);
}

export function truncateSafeText(text: string, maxLength = 500): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "…";
}
