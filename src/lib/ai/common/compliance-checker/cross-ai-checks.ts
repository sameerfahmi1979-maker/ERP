/**
 * ERP COMMON AI.4 — Cross-AI Compliance Checks (AI.3 + AI.1 reads, no new AI calls)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComplianceRuleResult } from "./types";

export async function evaluateDuplicateConflictFindings(
  supabase: SupabaseClient,
  input: { entityType: string; entityId: number; limit?: number }
): Promise<ComplianceRuleResult[]> {
  const limit = input.limit ?? 50;
  const { data, error } = await supabase
    .from("erp_ai_duplicate_candidates")
    .select("id, candidate_type, entity_type_a, entity_id_a, entity_type_b, entity_id_b, source_document_id, confidence_score")
    .eq("status", "pending")
    .is("deleted_at", null)
    .or(
      `and(entity_type_a.eq.${input.entityType},entity_id_a.eq.${input.entityId}),` +
        `and(entity_type_b.eq.${input.entityType},entity_id_b.eq.${input.entityId})`
    )
    .limit(limit);

  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((row) => ({
    findingType: "duplicate_conflict_open" as const,
    severity: "high" as const,
    detectionMethod: "deterministic" as const,
    entityType: input.entityType,
    entityId: input.entityId,
    documentId: (row.source_document_id as number | null) ?? null,
    sourceDuplicateCandidateId: row.id as number,
    confidenceScore: Number(row.confidence_score) || 0.9,
    evidenceJson: {
      candidateType: row.candidate_type,
      candidateId: row.id,
    },
    recommendedAction: "Review in AI Duplicates admin",
  }));
}

export async function evaluateFieldSuggestionConflictFindings(
  supabase: SupabaseClient,
  input: { entityType: string; entityId: number; limit?: number }
): Promise<ComplianceRuleResult[]> {
  const limit = input.limit ?? 50;
  const { data, error } = await supabase
    .from("erp_ai_field_suggestions")
    .select("id, field_code, field_label, suggestion_type, confidence_score")
    .eq("entity_type", input.entityType)
    .eq("entity_id", input.entityId)
    .eq("status", "pending")
    .eq("suggestion_type", "conflict_detected")
    .is("deleted_at", null)
    .limit(limit);

  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((row) => ({
    findingType: "field_suggestion_conflict_open" as const,
    severity: "medium" as const,
    detectionMethod: "deterministic" as const,
    entityType: input.entityType,
    entityId: input.entityId,
    sourceFieldSuggestionId: row.id as number,
    fieldCode: (row.field_code as string | null) ?? null,
    confidenceScore: Number(row.confidence_score) || 0.85,
    evidenceJson: {
      fieldLabel: row.field_label,
      suggestionId: row.id,
    },
    recommendedAction: "Review AI field suggestions on entity record",
  }));
}

export async function evaluatePartyLicenseDmsExpiryMismatch(
  supabase: SupabaseClient,
  input: { partyId: number; limit?: number }
): Promise<ComplianceRuleResult[]> {
  const { data: licenses, error } = await supabase
    .from("party_licenses")
    .select("id, party_id, expiry_date, dms_license_document_id")
    .eq("party_id", input.partyId)
    .is("deleted_at", null)
    .not("expiry_date", "is", null)
    .not("dms_license_document_id", "is", null)
    .limit(input.limit ?? 20);

  if (error || !licenses) return [];

  const results: ComplianceRuleResult[] = [];
  for (const lic of licenses as Array<{
    id: number;
    party_id: number;
    expiry_date: string;
    dms_license_document_id: number;
  }>) {
    const { data: doc } = await supabase
      .from("dms_documents")
      .select("id, expiry_date, document_no")
      .eq("id", lic.dms_license_document_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!doc) continue;
    const docRow = doc as { id: number; expiry_date: string | null; document_no: string | null };
    if (!docRow.expiry_date || docRow.expiry_date === lic.expiry_date) continue;

    results.push({
      findingType: "license_expiry_mismatch",
      severity: "high",
      detectionMethod: "deterministic",
      entityType: "party",
      entityId: input.partyId,
      documentId: docRow.id,
      fieldCode: "expiry_date",
      expectedValue: lic.expiry_date,
      actualValue: docRow.expiry_date,
      valueKind: "date",
      confidenceScore: 0.95,
      evidenceJson: {
        partyLicenseId: lic.id,
        documentNo: docRow.document_no,
      },
      recommendedAction: "Reconcile party license expiry with DMS document",
    });
  }

  return results;
}

export async function evaluateTrnMismatchForParty(
  supabase: SupabaseClient,
  input: { partyId: number }
): Promise<ComplianceRuleResult[]> {
  const { data: taxRegs } = await supabase
    .from("party_tax_registrations")
    .select("trn")
    .eq("party_id", input.partyId)
    .is("deleted_at", null)
    .not("trn", "is", null)
    .limit(1);

  const partyTrn = (taxRegs?.[0] as { trn?: string } | undefined)?.trn?.trim().toUpperCase();
  if (!partyTrn) return [];

  const { data: candidates } = await supabase
    .from("erp_ai_duplicate_candidates")
    .select("id, source_document_id, value_a, value_b")
    .eq("status", "pending")
    .eq("candidate_type", "conflict_trn_value")
    .is("deleted_at", null)
    .or(
      `and(entity_type_a.eq.party,entity_id_a.eq.${input.partyId}),` +
        `and(entity_type_b.eq.party,entity_id_b.eq.${input.partyId})`
    )
    .limit(5);

  if (!candidates?.length) return [];

  return (candidates as Array<Record<string, unknown>>).map((c) => ({
    findingType: "trn_mismatch" as const,
    severity: "high" as const,
    detectionMethod: "deterministic" as const,
    entityType: "party",
    entityId: input.partyId,
    documentId: (c.source_document_id as number | null) ?? null,
    sourceDuplicateCandidateId: c.id as number,
    fieldCode: "trn",
    valueKind: "trn" as const,
    confidenceScore: 0.95,
    evidenceJson: { candidateId: c.id },
    recommendedAction: "Verify tax registration against linked documents",
  }));
}
