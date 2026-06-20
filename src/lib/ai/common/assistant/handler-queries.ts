/**
 * ERP COMMON AI.7 — Handler Queries
 *
 * Thin DB read helpers for action handlers.
 * All queries respect RLS. No mutations.
 */

import { createClient } from "@/lib/supabase/server";

export interface ComplianceFindingLite {
  id: number;
  severity: string | null;
  finding_text: string | null;
  status: string | null;
}

export interface DuplicateCandidateLite {
  id: number;
  similarity_score: number | null;
  status: string | null;
}

export async function getComplianceFindingsForHandler(
  entityType: string,
  entityId: number,
  limit: number
): Promise<ComplianceFindingLite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("erp_ai_compliance_findings")
    .select("id, severity, finding_text, status")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .in("status", ["open", "pending_review"])
    .order("severity", { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return data as ComplianceFindingLite[];
}

export async function getDuplicateCandidatesForHandler(
  entityType: string,
  entityId: number,
  limit: number
): Promise<DuplicateCandidateLite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("erp_ai_duplicate_candidates")
    .select("id, similarity_score, status")
    .or(`entity_a_type.eq.${entityType},entity_b_type.eq.${entityType}`)
    .or(`entity_a_id.eq.${entityId},entity_b_id.eq.${entityId}`)
    .eq("status", "pending")
    .order("similarity_score", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as DuplicateCandidateLite[];
}
