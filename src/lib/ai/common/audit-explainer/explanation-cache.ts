// ERP COMMON AI.14 — Explanation Cache
// Lightweight cache for sanitized explanation text only.
// No raw audit payloads, no prompt text, no raw AI responses.

import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditExplainerSourceType, AuditExplainerScope } from "./types";

export interface SaveExplanationInput {
  sourceType: AuditExplainerSourceType;
  sourceId?: number;
  entityType?: string;
  entityId?: number;
  scope: AuditExplainerScope | string;
  scopeStart?: string;
  scopeEnd?: string;
  explanationText: string;
  summaryJson: {
    eventCount: number;
    entityType?: string;
    entityId?: number;
    actionCodes?: string[];
    dateRange?: string;
    sourceType: string;
  };
  modelName?: string;
  promptVersion?: string;
  createdBy?: number;
}

export async function saveAuditExplanation(
  input: SaveExplanationInput
): Promise<number | null> {
  const supabase = createAdminClient();
  const scopeValue = mapToDbScope(input.scope);

  const { data, error } = await supabase
    .from("erp_ai_audit_explanations")
    .insert({
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      scope: scopeValue,
      scope_start: input.scopeStart ?? null,
      scope_end: input.scopeEnd ?? null,
      explanation_text: input.explanationText.slice(0, 4000),
      summary_json: input.summaryJson,
      model_name: input.modelName ?? null,
      prompt_version: input.promptVersion ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return null;
  return Number(data.id);
}

export async function getCachedAuditExplanation(
  sourceType: AuditExplainerSourceType,
  sourceId?: number,
  entityType?: string,
  entityId?: number,
  scope?: string
): Promise<{ id: number; explanationText: string; createdAt: string; modelName?: string } | null> {
  const supabase = createAdminClient();

  let query = supabase
    .from("erp_ai_audit_explanations")
    .select("id, explanation_text, created_at, model_name")
    .is("deleted_at", null)
    .eq("source_type", sourceType);

  if (sourceId) query = query.eq("source_id", sourceId);
  if (entityType) query = query.eq("entity_type", entityType);
  if (entityId) query = query.eq("entity_id", entityId);
  if (scope) query = query.eq("scope", mapToDbScope(scope));

  const { data } = await query.order("created_at", { ascending: false }).limit(1).single();
  if (!data) return null;

  return {
    id: Number(data.id),
    explanationText: data.explanation_text,
    createdAt: data.created_at,
    modelName: data.model_name ?? undefined,
  };
}

export async function softDeleteAuditExplanation(id: number): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("erp_ai_audit_explanations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

function mapToDbScope(scope: string): string {
  const map: Record<string, string> = {
    today: "entity_today",
    last_7_days: "entity_7_days",
    last_30_days: "entity_30_days",
    entity_today: "entity_today",
    entity_7_days: "entity_7_days",
    entity_30_days: "entity_30_days",
    single_event: "single_event",
    dashboard_period: "dashboard_period",
    custom_range: "custom_range",
  };
  return map[scope] ?? "entity_today";
}
