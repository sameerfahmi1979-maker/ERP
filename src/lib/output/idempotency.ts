/**
 * OUTPUT.1 — Request idempotency and content fingerprinting (pure helpers).
 *
 * v6.1 separation of concerns:
 *  - request_key  = request-level idempotency. UNIQUE (partial index). Prevents
 *    double-click / retry duplication of the SAME logical request.
 *  - content_fingerprint = detects equivalent content across requests. NOT a
 *    uniqueness constraint — legitimate authorized reissue of equal content is
 *    allowed and merely produces a warning.
 *  - final PDF hash = SHA-256 of the EXACT stored bytes, computed after every
 *    byte-changing step (e.g. PDF/A conversion). Never a uniqueness constraint.
 */
import { createHash, randomBytes } from "node:crypto";

/**
 * Deterministic request key when the caller supplies a client idempotency token,
 * otherwise a fresh random key (each invocation = distinct logical request).
 */
export function buildRequestKey(input: {
  outputCode: string;
  recordId: number | string;
  actorProfileId: number;
  clientToken?: string | null;
}): string {
  if (input.clientToken && input.clientToken.trim().length >= 8) {
    const h = createHash("sha256")
      .update(`${input.outputCode}|${input.recordId}|${input.actorProfileId}|${input.clientToken.trim()}`)
      .digest("hex");
    return `req_${h.slice(0, 48)}`;
  }
  return `req_${randomBytes(24).toString("hex")}`;
}

/**
 * Content fingerprint over normalized generation inputs (NOT the PDF bytes).
 * Key order is normalized so semantically equal payloads hash equally.
 */
export function buildContentFingerprint(input: {
  outputCode: string;
  recordId: number | string;
  templateId: number | null;
  templateVersion: number | null;
  dataSnapshot: unknown;
}): string {
  const canonical = JSON.stringify(
    {
      o: input.outputCode,
      r: String(input.recordId),
      t: input.templateId ?? null,
      v: input.templateVersion ?? null,
      d: sortDeep(input.dataSnapshot),
    },
    null,
    0
  );
  return `fp_${createHash("sha256").update(canonical).digest("hex")}`;
}

/** Exact stored-byte hash — the integrity hash recorded on the issuance row. */
export function hashFinalPdfBytes(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Cryptographically strong, non-enumerable public verification token. */
export function generatePublicToken(): string {
  return randomBytes(32).toString("base64url"); // 43 chars, > 32 min length constraint
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortDeep(v)])
    );
  }
  return value;
}
