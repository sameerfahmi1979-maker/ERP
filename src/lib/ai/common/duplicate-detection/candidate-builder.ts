/**
 * ERP COMMON AI.3 — Duplicate Candidate Builder
 *
 * Builds candidate keys, masks sensitive values, and persists candidates.
 * Never stores raw OCR/content/prompt/AI response or full IBAN.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DuplicateCandidateInput,
  DuplicateRuleResult,
} from "./types";

const MAX_VALUE_LEN = 200;
const MAX_REASON_LEN = 500;

export function normalizeName(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildDuplicateCandidateKey(input: {
  candidateType: string;
  entityTypeA: string;
  entityIdA: number;
  entityTypeB?: string | null;
  entityIdB?: number | null;
  conflictField?: string | null;
}): string {
  const parts = [
    input.candidateType,
    input.entityTypeA,
    String(input.entityIdA),
    input.entityTypeB ?? "none",
    input.entityIdB != null ? String(input.entityIdB) : "none",
  ];
  if (input.conflictField) parts.push(input.conflictField);
  return parts.join(":");
}

export function maskSensitiveValue(
  value: string | null | undefined,
  valueKind?: string
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (valueKind === "iban" || /^[A-Z]{2}\d{2}/i.test(trimmed)) {
    const clean = trimmed.replace(/\s/g, "").toUpperCase();
    if (clean.length <= 8) return "****";
    return `${clean.slice(0, 4)}****${clean.slice(-4)}`;
  }

  if (valueKind === "account") {
    if (trimmed.length <= 4) return "****";
    return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`;
  }

  return trimmed.slice(0, MAX_VALUE_LEN);
}

const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "ocr_text",
  "content_text",
  "raw_ocr_text",
  "prompt",
  "raw_response",
  "embedding",
  "vector",
  "api_key",
  "secret",
]);

export function sanitizeDuplicateEvidenceJson(
  evidence: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!evidence || typeof evidence !== "object") return null;

  const safe: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(evidence)) {
    if (FORBIDDEN_EVIDENCE_KEYS.has(key.toLowerCase())) continue;
    if (typeof val === "string") {
      safe[key] = val.slice(0, 200);
    } else if (typeof val === "number" || typeof val === "boolean") {
      safe[key] = val;
    } else if (Array.isArray(val)) {
      safe[key] = val.slice(0, 10).map((item) =>
        typeof item === "string" ? item.slice(0, 100) : item
      );
    }
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

export function buildDuplicateCandidateInput(
  rule: DuplicateRuleResult
): DuplicateCandidateInput {
  const candidateKey = buildDuplicateCandidateKey({
    candidateType: rule.candidateType,
    entityTypeA: rule.entityTypeA,
    entityIdA: rule.entityIdA,
    entityTypeB: rule.entityTypeB,
    entityIdB: rule.entityIdB,
    conflictField: rule.conflictField,
  });

  return {
    candidateType: rule.candidateType,
    detectionMethod: rule.detectionMethod,
    candidateKey,
    entityTypeA: rule.entityTypeA,
    entityIdA: rule.entityIdA,
    entityTypeB: rule.entityTypeB ?? null,
    entityIdB: rule.entityIdB ?? null,
    conflictField: rule.conflictField ?? null,
    valueA: maskSensitiveValue(rule.valueA, rule.valueKind),
    valueB: maskSensitiveValue(rule.valueB, rule.valueKind),
    confidenceScore: rule.confidenceScore,
    evidenceJson: sanitizeDuplicateEvidenceJson(rule.evidenceJson ?? null),
    aiReason: rule.aiReason?.slice(0, MAX_REASON_LEN) ?? null,
    sourceDocumentId: rule.sourceDocumentId ?? null,
  };
}

export type UpsertDuplicateResult = "inserted" | "skipped_existing" | "failed";

export async function upsertDuplicateCandidate(
  supabase: SupabaseClient,
  candidate: DuplicateCandidateInput,
  actorUserProfileId: number
): Promise<UpsertDuplicateResult> {
  const { error } = await supabase.from("erp_ai_duplicate_candidates").insert({
    candidate_type: candidate.candidateType,
    detection_method: candidate.detectionMethod,
    candidate_key: candidate.candidateKey,
    entity_type_a: candidate.entityTypeA,
    entity_id_a: candidate.entityIdA,
    entity_type_b: candidate.entityTypeB,
    entity_id_b: candidate.entityIdB,
    conflict_field: candidate.conflictField,
    value_a: candidate.valueA,
    value_b: candidate.valueB,
    confidence_score: candidate.confidenceScore,
    evidence_json: candidate.evidenceJson,
    ai_reason: candidate.aiReason,
    source_document_id: candidate.sourceDocumentId,
    status: "pending",
    created_by: actorUserProfileId,
    updated_by: actorUserProfileId,
  });

  if (error) {
    if (error.code === "23505") return "skipped_existing";
    return "failed";
  }

  return "inserted";
}

export async function insertDuplicateCandidateEvent(
  supabase: SupabaseClient,
  input: {
    candidateId: number;
    eventType: string;
    eventDataJson?: Record<string, unknown> | null;
    actorUserId: number;
  }
): Promise<void> {
  await supabase.from("erp_ai_duplicate_candidate_events").insert({
    candidate_id: input.candidateId,
    event_type: input.eventType,
    event_data_json: sanitizeDuplicateEvidenceJson(input.eventDataJson ?? null),
    actor_user_id: input.actorUserId,
  });
}
