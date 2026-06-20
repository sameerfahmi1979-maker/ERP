/**
 * ERP COMMON AI.3 — Duplicate Scan Engine
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDuplicateCandidateInput,
  upsertDuplicateCandidate,
} from "./candidate-builder";
import { runAllDeterministicRules } from "./deterministic-rules";
import { runAiAssistedRules } from "./ai-rules";
import type {
  DuplicateScanInput,
  DuplicateScanResult,
  DuplicateRuleResult,
} from "./types";
import {
  DUPLICATE_SCAN_DEFAULT_PAIR_LIMIT,
  DUPLICATE_SCAN_DEFAULT_AI_CALL_LIMIT,
} from "./types";

export async function supersedePendingCandidatesForScope(
  supabase: SupabaseClient,
  input: {
    entityType?: string;
    entityId?: number;
    actorUserProfileId: number;
  }
): Promise<number> {
  let query = supabase
    .from("erp_ai_duplicate_candidates")
    .update({
      status: "superseded",
      updated_by: input.actorUserProfileId,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "pending")
    .is("deleted_at", null);

  if (input.entityType && input.entityId) {
    query = query.or(
      `and(entity_type_a.eq.${input.entityType},entity_id_a.eq.${input.entityId}),` +
        `and(entity_type_b.eq.${input.entityType},entity_id_b.eq.${input.entityId})`
    );
  }

  const { data, error } = await query.select("id");
  if (error || !data) return 0;
  return data.length;
}

function filterRulesForEntity(
  rules: DuplicateRuleResult[],
  entityType?: string,
  entityId?: number
): DuplicateRuleResult[] {
  if (!entityType || !entityId) return rules;
  return rules.filter(
    (r) =>
      (r.entityTypeA === entityType && r.entityIdA === entityId) ||
      (r.entityTypeB === entityType && r.entityIdB === entityId) ||
      r.sourceDocumentId === entityId
  );
}

async function persistCandidates(
  supabase: SupabaseClient,
  rules: DuplicateRuleResult[],
  actorUserProfileId: number,
  dryRun: boolean
): Promise<{ inserted: number; skippedExisting: number }> {
  if (dryRun) return { inserted: 0, skippedExisting: 0 };

  let inserted = 0;
  let skippedExisting = 0;

  for (const rule of rules) {
    const candidate = buildDuplicateCandidateInput(rule);
    const result = await upsertDuplicateCandidate(supabase, candidate, actorUserProfileId);
    if (result === "inserted") inserted++;
    else if (result === "skipped_existing") skippedExisting++;
  }

  return { inserted, skippedExisting };
}

export async function runDuplicateScan(
  supabase: SupabaseClient,
  input: DuplicateScanInput,
  actorUserProfileId: number
): Promise<DuplicateScanResult> {
  const dryRun = input.dryRun === true;
  const pairLimit = Math.min(input.limit ?? DUPLICATE_SCAN_DEFAULT_PAIR_LIMIT, DUPLICATE_SCAN_DEFAULT_PAIR_LIMIT);
  const aiCallLimit = Math.min(
    input.aiCallLimit ?? DUPLICATE_SCAN_DEFAULT_AI_CALL_LIMIT,
    DUPLICATE_SCAN_DEFAULT_AI_CALL_LIMIT
  );

  let superseded = 0;
  if (!dryRun && input.supersedeExisting) {
    superseded = await supersedePendingCandidatesForScope(supabase, {
      entityType: input.entityType,
      entityId: input.entityId,
      actorUserProfileId,
    });
  }

  const { results: deterministicRaw, failedRules } = await runAllDeterministicRules(supabase, {
    limit: pairLimit,
  });
  let deterministicRules = filterRulesForEntity(
    deterministicRaw,
    input.entityType,
    input.entityId
  );

  let aiRules: DuplicateRuleResult[] = [];
  let aiCallsMade = 0;

  if (input.includeAiRules) {
    const aiOutcome = await runAiAssistedRules({
      supabase,
      aiCallLimit,
      aiCallsMade: 0,
    });
    aiRules = filterRulesForEntity(aiOutcome.results, input.entityType, input.entityId);
    aiCallsMade = aiOutcome.aiCallsMade;
  }

  const allRules = [...deterministicRules, ...aiRules];
  const { inserted, skippedExisting } = await persistCandidates(
    supabase,
    allRules,
    actorUserProfileId,
    dryRun
  );

  return {
    deterministicDetected: deterministicRules.length,
    aiDetected: aiRules.length,
    inserted,
    skippedExisting,
    superseded,
    failedRules,
    aiCallsMade,
    dryRun,
    previewCount: dryRun ? allRules.length : undefined,
  };
}

export async function runEntityDuplicateScan(
  supabase: SupabaseClient,
  input: {
    entityType: string;
    entityId: number;
    includeAiRules?: boolean;
    dryRun?: boolean;
    actorUserProfileId: number;
  }
): Promise<DuplicateScanResult> {
  return runDuplicateScan(
    supabase,
    {
      scope: input.entityType as DuplicateScanInput["scope"],
      entityType: input.entityType as DuplicateScanInput["entityType"],
      entityId: input.entityId,
      includeAiRules: input.includeAiRules,
      dryRun: input.dryRun,
      supersedeExisting: !input.dryRun,
    },
    input.actorUserProfileId
  );
}
