/**
 * ERP COMMON AI.4 — Compliance Scan Engine
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildComplianceFindingInput,
  upsertComplianceFinding,
} from "./finding-builder";
import {
  evaluateLinkedDocumentHealth,
  mapLinkedDocumentRow,
  OPEN_RENEWAL_STATUSES,
} from "./document-checks";
import {
  evaluateDuplicateConflictFindings,
  evaluateFieldSuggestionConflictFindings,
  evaluatePartyLicenseDmsExpiryMismatch,
  evaluateTrnMismatchForParty,
} from "./cross-ai-checks";
import { evaluateRequiredDocumentRulesForEntity } from "./rule-engine";
import { generateComplianceAiNotes } from "./ai-notes";
import type {
  ComplianceRuleResult,
  ComplianceScanInput,
  ComplianceScanResult,
  LinkedDocumentForCompliance,
  RequiredDocumentRuleForCompliance,
} from "./types";
import {
  COMPLIANCE_MAX_FINDINGS_PER_ENTITY,
  COMPLIANCE_MAX_FINDINGS_PER_SCAN,
  COMPLIANCE_MAX_AI_CALLS_PER_SCAN,
  COMPLIANCE_SCAN_DEFAULT_ENTITY_LIMIT,
} from "./types";

const LINKED_DOC_SELECT = `
  document_id,
  document:dms_documents(
    id, document_no, title, document_type_id, issue_date, expiry_date,
    ai_risk_level, completeness_score, ocr_text_available,
    ai_summary_status, summary_embedding_status, confidentiality_level, status,
    document_type:dms_document_types(type_code)
  )
`;

function mapRuleRow(row: Record<string, unknown>): RequiredDocumentRuleForCompliance {
  const docType = row.document_type as Record<string, unknown> | null;
  return {
    id: row.id as number,
    ruleCode: row.rule_code as string,
    ruleName: row.rule_name as string,
    entityType: row.entity_type as string,
    documentTypeId: (row.document_type_id as number | null) ?? null,
    typeCode: (docType?.type_code as string | null) ?? null,
    isRequired: row.is_required as boolean,
    requiresExpiryDate: row.requires_expiry_date as boolean,
    requiresIssueDate: row.requires_issue_date as boolean,
    blocksActivation: row.blocks_activation as boolean,
    reminderDaysBeforeExpiry: (row.reminder_days_before_expiry as number[] | null) ?? null,
  };
}

async function loadRulesForEntityType(
  supabase: SupabaseClient,
  entityType: string
): Promise<RequiredDocumentRuleForCompliance[]> {
  const { data, error } = await supabase
    .from("dms_required_document_rules")
    .select("*, document_type:dms_document_types(type_code)")
    .eq("entity_type", entityType)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(mapRuleRow);
}

async function loadLinkedDocuments(
  supabase: SupabaseClient,
  entityType: string,
  entityId: number
): Promise<LinkedDocumentForCompliance[]> {
  const { data, error } = await supabase
    .from("dms_document_links")
    .select(LINKED_DOC_SELECT)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("deleted_at", null);

  if (error || !data) return [];
  return (data as Record<string, unknown>[])
    .map(mapLinkedDocumentRow)
    .filter((d) => d.id != null);
}

async function loadOpenRenewalDocumentIds(
  supabase: SupabaseClient,
  documentIds: number[]
): Promise<Set<number>> {
  if (documentIds.length === 0) return new Set();

  const { data } = await supabase
    .from("dms_renewal_requests")
    .select("document_id, status")
    .in("document_id", documentIds)
    .is("deleted_at", null);

  const open = new Set<number>();
  for (const row of (data ?? []) as Array<{ document_id: number; status: string }>) {
    if (OPEN_RENEWAL_STATUSES.has(row.status)) {
      open.add(row.document_id);
    }
  }
  return open;
}

export async function supersedeOpenFindingsForScope(
  supabase: SupabaseClient,
  input: {
    entityType?: string;
    entityId?: number;
    actorUserProfileId: number;
  }
): Promise<number> {
  let query = supabase
    .from("erp_ai_compliance_findings")
    .update({
      status: "superseded",
      updated_by: input.actorUserProfileId,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "open")
    .is("deleted_at", null);

  if (input.entityType && input.entityId) {
    query = query.eq("entity_type", input.entityType).eq("entity_id", input.entityId);
  }

  const { data, error } = await query.select("id");
  if (error || !data) return 0;
  return data.length;
}

async function scanSingleEntity(
  supabase: SupabaseClient,
  input: {
    entityType: string;
    entityId: number;
    rules: RequiredDocumentRuleForCompliance[];
    includeAiNotes: boolean;
    aiCallLimit: number;
    aiCallsMade: number;
    isAdminViewer: boolean;
  }
): Promise<{ rules: ComplianceRuleResult[]; aiCallsMade: number; failed?: boolean }> {
  try {
    const linkedDocuments = await loadLinkedDocuments(
      supabase,
      input.entityType,
      input.entityId
    );
    const entityRules = input.rules.filter((r) => r.entityType === input.entityType);
    const docIds = linkedDocuments.map((d) => d.id);
    const openRenewals = await loadOpenRenewalDocumentIds(supabase, docIds);

    const ruleResults = evaluateRequiredDocumentRulesForEntity({
      entityType: input.entityType,
      entityId: input.entityId,
      rules: entityRules,
      linkedDocuments,
    });

    const docResults = evaluateLinkedDocumentHealth({
      entityType: input.entityType,
      entityId: input.entityId,
      documents: linkedDocuments,
      openRenewalDocumentIds: openRenewals,
      isAdminViewer: input.isAdminViewer,
    });

    const dupResults = await evaluateDuplicateConflictFindings(supabase, {
      entityType: input.entityType,
      entityId: input.entityId,
    });

    const fieldResults = await evaluateFieldSuggestionConflictFindings(supabase, {
      entityType: input.entityType,
      entityId: input.entityId,
    });

    let crossResults: ComplianceRuleResult[] = [];
    if (input.entityType === "party") {
      crossResults = [
        ...(await evaluatePartyLicenseDmsExpiryMismatch(supabase, {
          partyId: input.entityId,
        })),
        ...(await evaluateTrnMismatchForParty(supabase, { partyId: input.entityId })),
      ];
    }

    let allRules = [
      ...ruleResults,
      ...docResults,
      ...dupResults,
      ...fieldResults,
      ...crossResults,
    ].slice(0, COMPLIANCE_MAX_FINDINGS_PER_ENTITY);

    let aiCallsMade = input.aiCallsMade;
    if (input.includeAiNotes && aiCallsMade < input.aiCallLimit) {
      const aiOutcome = await generateComplianceAiNotes({
        entityType: input.entityType,
        entityId: input.entityId,
        documents: linkedDocuments,
        existingFindingTypes: allRules.map((r) => r.findingType),
        aiCallLimit: input.aiCallLimit,
        aiCallsMade,
      });
      allRules = [...allRules, ...aiOutcome.results].slice(
        0,
        COMPLIANCE_MAX_FINDINGS_PER_ENTITY
      );
      aiCallsMade = aiOutcome.aiCallsMade;
    }

    return { rules: allRules, aiCallsMade };
  } catch {
    return { rules: [], aiCallsMade: input.aiCallsMade, failed: true };
  }
}

async function persistFindings(
  supabase: SupabaseClient,
  rules: ComplianceRuleResult[],
  actorUserProfileId: number,
  dryRun: boolean
): Promise<{ inserted: number; skippedExisting: number }> {
  if (dryRun) return { inserted: 0, skippedExisting: 0 };

  let inserted = 0;
  let skippedExisting = 0;

  for (const rule of rules) {
    const finding = buildComplianceFindingInput(rule);
    const result = await upsertComplianceFinding(supabase, finding, actorUserProfileId);
    if (result === "inserted") inserted++;
    else if (result === "skipped_existing") skippedExisting++;
  }

  return { inserted, skippedExisting };
}

async function loadEntityIds(
  supabase: SupabaseClient,
  entityType: string,
  limit: number
): Promise<number[]> {
  const tableMap: Record<string, { table: string; deletedCol?: string }> = {
    company: { table: "owner_companies" },
    party: { table: "parties", deletedCol: "deleted_at" },
    branch: { table: "branches" },
    site: { table: "work_sites", deletedCol: "deleted_at" },
  };

  const cfg = tableMap[entityType];
  if (!cfg) return [];

  let query = supabase.from(cfg.table).select("id").limit(limit);
  if (cfg.deletedCol) {
    query = query.is(cfg.deletedCol, null);
  }

  const { data } = await query;
  return ((data ?? []) as Array<{ id: number }>).map((r) => r.id);
}

export async function runEntityComplianceScan(
  supabase: SupabaseClient,
  input: ComplianceScanInput & { actorUserProfileId: number; isAdminViewer?: boolean }
): Promise<ComplianceScanResult> {
  if (!input.entityType || !input.entityId) {
    return {
      detected: 0,
      inserted: 0,
      skippedExisting: 0,
      superseded: 0,
      failedEntities: ["missing_entity"],
      aiCallsMade: 0,
      dryRun: input.dryRun === true,
    };
  }

  const dryRun = input.dryRun === true;
  const aiCallLimit = Math.min(
    input.aiCallLimit ?? COMPLIANCE_MAX_AI_CALLS_PER_SCAN,
    COMPLIANCE_MAX_AI_CALLS_PER_SCAN
  );

  let superseded = 0;
  if (!dryRun && input.supersedeExisting) {
    superseded = await supersedeOpenFindingsForScope(supabase, {
      entityType: input.entityType,
      entityId: input.entityId,
      actorUserProfileId: input.actorUserProfileId,
    });
  }

  const rules = await loadRulesForEntityType(supabase, input.entityType);
  const outcome = await scanSingleEntity(supabase, {
    entityType: input.entityType,
    entityId: input.entityId,
    rules,
    includeAiNotes: input.includeAiNotes === true,
    aiCallLimit,
    aiCallsMade: 0,
    isAdminViewer: input.isAdminViewer === true,
  });

  const failedEntities = outcome.failed ? [`${input.entityType}:${input.entityId}`] : [];
  const { inserted, skippedExisting } = await persistFindings(
    supabase,
    outcome.rules,
    input.actorUserProfileId,
    dryRun
  );

  return {
    detected: outcome.rules.length,
    inserted,
    skippedExisting,
    superseded,
    failedEntities,
    aiCallsMade: outcome.aiCallsMade,
    dryRun,
    previewCount: dryRun ? outcome.rules.length : undefined,
  };
}

export async function runComplianceScan(
  supabase: SupabaseClient,
  input: ComplianceScanInput,
  actorUserProfileId: number,
  isAdminViewer = false
): Promise<ComplianceScanResult> {
  const dryRun = input.dryRun === true;
  const entityLimit = Math.min(
    input.limit ?? COMPLIANCE_SCAN_DEFAULT_ENTITY_LIMIT,
    COMPLIANCE_SCAN_DEFAULT_ENTITY_LIMIT
  );
  const aiCallLimit = Math.min(
    input.aiCallLimit ?? COMPLIANCE_MAX_AI_CALLS_PER_SCAN,
    COMPLIANCE_MAX_AI_CALLS_PER_SCAN
  );

  let superseded = 0;
  if (!dryRun && input.supersedeExisting) {
    superseded = await supersedeOpenFindingsForScope(supabase, {
      actorUserProfileId,
    });
  }

  const entityTypes = ["company", "party", "branch", "site"] as const;
  const allRules: ComplianceRuleResult[] = [];
  const failedEntities: string[] = [];
  let aiCallsMade = 0;

  for (const entityType of entityTypes) {
    const entityIds = await loadEntityIds(supabase, entityType, entityLimit);
    const rules = await loadRulesForEntityType(supabase, entityType);

    for (const entityId of entityIds) {
      if (allRules.length >= COMPLIANCE_MAX_FINDINGS_PER_SCAN) break;

      const outcome = await scanSingleEntity(supabase, {
        entityType,
        entityId,
        rules,
        includeAiNotes: input.includeAiNotes === true,
        aiCallLimit,
        aiCallsMade,
        isAdminViewer,
      });

      if (outcome.failed) {
        failedEntities.push(`${entityType}:${entityId}`);
        continue;
      }

      aiCallsMade = outcome.aiCallsMade;
      allRules.push(
        ...outcome.rules.slice(0, COMPLIANCE_MAX_FINDINGS_PER_SCAN - allRules.length)
      );
    }
  }

  const { inserted, skippedExisting } = await persistFindings(
    supabase,
    allRules,
    actorUserProfileId,
    dryRun
  );

  return {
    detected: allRules.length,
    inserted,
    skippedExisting,
    superseded,
    failedEntities,
    aiCallsMade,
    dryRun,
    previewCount: dryRun ? allRules.length : undefined,
  };
}

export { loadRulesForEntityType, loadLinkedDocuments };
