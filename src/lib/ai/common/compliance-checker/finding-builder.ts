/**
 * ERP COMMON AI.4 — Compliance Finding Builder
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComplianceFindingInput, ComplianceRuleResult } from "./types";

const MAX_VALUE_LEN = 200;
const MAX_REASON_LEN = 500;
const MAX_ACTION_LEN = 300;

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

export function buildComplianceFindingKey(input: {
  findingType: string;
  entityType: string;
  entityId: number;
  documentId?: number | null;
  sourceRuleId?: number | null;
  sourceDuplicateCandidateId?: number | null;
  sourceFieldSuggestionId?: number | null;
  fieldCode?: string | null;
}): string {
  const docPart = input.documentId != null ? `doc:${input.documentId}` : "doc:none";
  const rulePart = input.sourceRuleId != null ? `rule:${input.sourceRuleId}` : null;
  const dupPart =
    input.sourceDuplicateCandidateId != null
      ? `candidate:${input.sourceDuplicateCandidateId}`
      : null;
  const suggPart =
    input.sourceFieldSuggestionId != null
      ? `suggestion:${input.sourceFieldSuggestionId}`
      : null;
  const sourcePart = rulePart ?? dupPart ?? suggPart ?? docPart;
  const fieldPart = input.fieldCode ? `:${input.fieldCode}` : "";
  return `${input.findingType}:${input.entityType}:${input.entityId}:${sourcePart}${fieldPart}`;
}

export function maskComplianceSensitiveValue(
  value: string | null | undefined,
  kind?: string
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (kind === "trn" || kind === "iban" || /^[A-Z]{2}\d{2}/i.test(trimmed)) {
    const clean = trimmed.replace(/\s/g, "").toUpperCase();
    if (clean.length <= 6) return "****";
    return `${clean.slice(0, 3)}****${clean.slice(-3)}`;
  }

  return trimmed.slice(0, MAX_VALUE_LEN);
}

export function sanitizeComplianceEvidenceJson(
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

export function buildComplianceFindingInput(
  rule: ComplianceRuleResult
): ComplianceFindingInput {
  const findingKey = buildComplianceFindingKey({
    findingType: rule.findingType,
    entityType: rule.entityType,
    entityId: rule.entityId,
    documentId: rule.documentId,
    sourceRuleId: rule.sourceRuleId,
    sourceDuplicateCandidateId: rule.sourceDuplicateCandidateId,
    sourceFieldSuggestionId: rule.sourceFieldSuggestionId,
    fieldCode: rule.fieldCode,
  });

  return {
    findingType: rule.findingType,
    severity: rule.severity,
    detectionMethod: rule.detectionMethod,
    findingKey,
    entityType: rule.entityType,
    entityId: rule.entityId,
    documentId: rule.documentId ?? null,
    sourceRuleId: rule.sourceRuleId ?? null,
    sourceDuplicateCandidateId: rule.sourceDuplicateCandidateId ?? null,
    sourceFieldSuggestionId: rule.sourceFieldSuggestionId ?? null,
    fieldCode: rule.fieldCode ?? null,
    expectedValue: maskComplianceSensitiveValue(rule.expectedValue, rule.valueKind),
    actualValue: maskComplianceSensitiveValue(rule.actualValue, rule.valueKind),
    confidenceScore: rule.confidenceScore,
    evidenceJson: sanitizeComplianceEvidenceJson(rule.evidenceJson ?? null),
    aiReason: rule.aiReason?.slice(0, MAX_REASON_LEN) ?? null,
    recommendedAction: rule.recommendedAction?.slice(0, MAX_ACTION_LEN) ?? null,
  };
}

export type UpsertComplianceResult = "inserted" | "skipped_existing" | "failed";

export async function upsertComplianceFinding(
  supabase: SupabaseClient,
  finding: ComplianceFindingInput,
  actorUserProfileId: number
): Promise<UpsertComplianceResult> {
  const { error } = await supabase.from("erp_ai_compliance_findings").insert({
    finding_type: finding.findingType,
    severity: finding.severity,
    detection_method: finding.detectionMethod,
    finding_key: finding.findingKey,
    entity_type: finding.entityType,
    entity_id: finding.entityId,
    document_id: finding.documentId,
    source_rule_id: finding.sourceRuleId,
    source_duplicate_candidate_id: finding.sourceDuplicateCandidateId,
    source_field_suggestion_id: finding.sourceFieldSuggestionId,
    field_code: finding.fieldCode,
    expected_value: finding.expectedValue,
    actual_value: finding.actualValue,
    confidence_score: finding.confidenceScore,
    evidence_json: finding.evidenceJson,
    ai_reason: finding.aiReason,
    recommended_action: finding.recommendedAction,
    status: "open",
    created_by: actorUserProfileId,
    updated_by: actorUserProfileId,
  });

  if (error) {
    if (error.code === "23505") return "skipped_existing";
    return "failed";
  }

  return "inserted";
}

export async function insertComplianceFindingEvent(
  supabase: SupabaseClient,
  input: {
    findingId: number;
    eventType: string;
    eventDataJson?: Record<string, unknown> | null;
    actorUserId: number;
  }
): Promise<void> {
  await supabase.from("erp_ai_compliance_finding_events").insert({
    finding_id: input.findingId,
    event_type: input.eventType,
    event_data_json: sanitizeComplianceEvidenceJson(input.eventDataJson ?? null),
    actor_user_id: input.actorUserId,
  });
}
