const FORBIDDEN_KEYS = new Set([
  'ocr_text', 'content_text', 'content_text_raw', 'raw_ocr', 'ocr_raw',
  'prompt', 'system_prompt', 'user_prompt', 'ai_prompt',
  'raw_response', 'ai_response', 'completion', 'response_text',
  'api_key', 'secret_ref', 'secret', 'token', 'password',
  'embedding', 'embeddings', 'embedding_vector',
  'iban', 'bank_account', 'account_number',
  'full_iban', 'full_account',
]);

const FORBIDDEN_KEY_PATTERNS = [
  /ocr/i,
  /content_text/i,
  /prompt/i,
  /api_key/i,
  /secret/i,
  /embedding/i,
  /raw_response/i,
  /ai_response/i,
  /iban/i,
  /bank_account/i,
  /account_number/i,
  /password/i,
  /token/i,
];

const MAX_EVIDENCE_VALUE_LENGTH = 200;

export function isForbiddenKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (FORBIDDEN_KEYS.has(lower)) return true;
  return FORBIDDEN_KEY_PATTERNS.some((p) => p.test(lower));
}

export function maskSensitiveValue(value: unknown): string {
  return '[REDACTED]';
}

export function truncateEvidenceValue(value: unknown): unknown {
  if (typeof value === 'string' && value.length > MAX_EVIDENCE_VALUE_LENGTH) {
    return value.substring(0, MAX_EVIDENCE_VALUE_LENGTH) + '…';
  }
  return value;
}

export function sanitizeEvidenceJson(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isForbiddenKey(key)) {
      continue;
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      safe[key] = sanitizeEvidenceJson(value as Record<string, unknown>);
    } else {
      safe[key] = truncateEvidenceValue(value);
    }
  }
  return safe;
}

export function assertSafeEvidence(evidence: Record<string, unknown>): void {
  for (const key of Object.keys(evidence)) {
    if (isForbiddenKey(key)) {
      throw new Error(
        `[DataQuality] Forbidden key "${key}" detected in evidence JSON. Remove before storing.`
      );
    }
  }
}

export function buildSafeEvidence(
  fields: Record<string, unknown>
): Record<string, unknown> {
  return sanitizeEvidenceJson(fields);
}
