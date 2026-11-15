/**
 * ERP COMMON AI.4 — Compliance Scan Engine
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  buildComplianceFindingInput,
  complianceFindingRow,
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
    ai_summary_status, summary_embedding_status, confidentiality_level, status, is_archived, superseded_by_document_id, deleted_at,
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
  const { data, error, count } = await supabase
    .from("dms_required_document_rules")
    .select("*, document_type:dms_document_types(type_code)",{count:"exact"})
    .eq("entity_type", entityType)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error || !data || count!==data.length) throw new Error("Compliance rule read failed or was incomplete");
  return (data as Record<string, unknown>[]).map(mapRuleRow);
}

async function loadLinkedDocuments(
  supabase: SupabaseClient,
  entityType: string,
  entityId: number
): Promise<LinkedDocumentForCompliance[]> {
  const { data, error, count } = await supabase
    .from("dms_document_links")
    .select(LINKED_DOC_SELECT,{count:"exact"})
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("deleted_at", null);

  if (error || !data || count!==data.length) throw new Error("Compliance document read failed or was incomplete");
  const documents=(data as Record<string, unknown>[]).map(mapLinkedDocumentRow);
  if (documents.some(doc=>doc.id==null)) throw new Error("A linked compliance document could not be verified");
  return documents;
}

async function loadOpenRenewalDocumentIds(
  supabase: SupabaseClient,
  documentIds: number[]
): Promise<Set<number>> {
  if (documentIds.length === 0) return new Set();

  const { data, error, count } = await supabase
    .from("dms_renewal_requests")
    .select("document_id, status",{count:"exact"})
    .in("document_id", documentIds)
    .is("deleted_at", null);

  if (error || !data || count!==data.length) throw new Error("Compliance renewal read failed or was incomplete");
  const open = new Set<number>();
  for (const row of (data ?? []) as Array<{ document_id: number; status: string }>) {
    if (OPEN_RENEWAL_STATUSES.has(row.status)) {
      open.add(row.document_id);
    }
  }
  return open;
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
    ];

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
      allRules = [...allRules, ...aiOutcome.results];
      aiCallsMade = aiOutcome.aiCallsMade;
    }

    if (allRules.length > COMPLIANCE_MAX_FINDINGS_PER_ENTITY) {
      return {rules:[],aiCallsMade,failed:true};
    }
    return { rules: allRules, aiCallsMade };
  } catch {
    return { rules: [], aiCallsMade: input.aiCallsMade, failed: true };
  }
}

const entityTables = {
  company: { table: "owner_companies", softDelete: false },
  party: { table: "parties", softDelete: false },
  branch: { table: "branches", softDelete: false },
  site: { table: "work_sites", softDelete: true },
} as const;
type ScanEntity = keyof typeof entityTables;

async function loadEntityIds(db: SupabaseClient, kind: ScanEntity, pageSize: number) {
  const source = entityTables[kind];
  const ids: number[] = [];
  let cursor = 0;
  for (;;) {
    let query = db.from(source.table).select("id").gt("id",cursor).order("id").limit(pageSize);
    if (source.softDelete) query=query.is("deleted_at",null);
    const {data,error}=await query;
    if (error || !data) throw new Error(`Compliance ${kind} enumeration failed`);
    if (data.length===0) return ids;
    for (const {id} of data as {id:number}[]) {
      if (!Number.isSafeInteger(id) || id<=cursor) throw new Error(`Compliance ${kind} inventory changed`);
      ids.push(id);
      cursor=id;
    }
    if (ids.length>100000) throw new Error("Compliance scan exceeds the supported inventory");
  }
}

type ScanTarget = { entityType:ScanEntity; entityId:number };

async function runScan(db:SupabaseClient, input:ComplianceScanInput, actor:number, isAdminViewer:boolean, target?:ScanTarget):Promise<ComplianceScanResult> {
  const dryRun=input.dryRun===true;
  const result:ComplianceScanResult={detected:0,inserted:0,skippedExisting:0,superseded:0,failedEntities:[],aiCallsMade:0,dryRun};
  const pageSize=Math.max(1,Math.min(input.limit??COMPLIANCE_SCAN_DEFAULT_ENTITY_LIMIT,COMPLIANCE_SCAN_DEFAULT_ENTITY_LIMIT));
  const aiCallLimit=Math.min(input.aiCallLimit??COMPLIANCE_MAX_AI_CALLS_PER_SCAN,COMPLIANCE_MAX_AI_CALLS_PER_SCAN);
  const coverage:Array<{entity_type:ScanEntity;entity_id:number}>=[];
  const findings=new Map<string,ReturnType<typeof complianceFindingRow>>();
  const generation=dryRun?null:await db.rpc("erp_compliance_scan_generation");
  if (generation && (generation.error || typeof generation.data!=="string")) throw new Error("Compliance scan could not establish its starting generation");
  const kinds=target?[target.entityType]:Object.keys(entityTables) as ScanEntity[];
  for (const entityType of kinds) {
    try {
      const [ids,rules]=await Promise.all([
        target?Promise.resolve([target.entityId]):loadEntityIds(db,entityType,pageSize),
        loadRulesForEntityType(db,entityType),
      ]);
      for (const entityId of ids) {
        const scan=await scanSingleEntity(db,{entityType,entityId,rules,includeAiNotes:input.includeAiNotes===true,
          aiCallLimit,aiCallsMade:result.aiCallsMade,isAdminViewer});
        result.aiCallsMade=scan.aiCallsMade;
        if (scan.failed) {
          result.failedEntities.push(`${entityType}:${entityId}`);
          continue;
        }
        coverage.push({entity_type:entityType,entity_id:entityId});
        for (const rule of scan.rules) {
          const finding=complianceFindingRow(buildComplianceFindingInput(rule));
          if(!findings.has(finding.finding_key)) findings.set(finding.finding_key,finding);
        }
        if(findings.size>COMPLIANCE_MAX_FINDINGS_PER_SCAN) throw new Error("Scan exceeds the complete findings limit");
      }
    } catch {
      result.failedEntities.push(target?`${entityType}:${target.entityId}`:`${entityType}:coverage`);
    }
  }
  result.detected=findings.size;
  if (dryRun) result.previewCount=result.detected;
  if (dryRun || result.failedEntities.length>0) return result;
  const request={p_operation:randomUUID(),p_actor:actor,p_generation:generation!.data,
    p_entity_type:target?.entityType??null,p_entity_id:target?.entityId??null,p_coverage:coverage,
    p_findings:[...findings.values()],p_replace:input.supersedeExisting===true};
  const commit=()=>db.rpc("erp_commit_compliance_scan",request);
  let response=await Promise.resolve(commit()).catch(()=>null);
  // A missing HTTP confirmation may follow a committed transaction. Replay
  // the exact arguments and operation ID before reporting an unknown outcome.
  if (!response || (response.error && (!response.error.code || response.error.code.startsWith("08")))) response=await commit();
  if (response.error || typeof response.data?.inserted!=="number" || typeof response.data?.superseded!=="number"
    || typeof response.data?.skippedExisting!=="number") throw new Error("Compliance scan replacement could not be confirmed");
  return {...result,inserted:response.data.inserted,superseded:response.data.superseded,skippedExisting:response.data.skippedExisting};
}

export async function runEntityComplianceScan(
  supabase: SupabaseClient,
  input: ComplianceScanInput & { actorUserProfileId: number; isAdminViewer?: boolean }
): Promise<ComplianceScanResult> {
  if (!input.entityType || !Object.hasOwn(entityTables,input.entityType) || !input.entityId) {
    throw new Error("Choose a supported compliance scan subject");
  }
  return runScan(supabase,input,input.actorUserProfileId,input.isAdminViewer===true,{ entityType:input.entityType as ScanEntity,entityId:input.entityId });
}

export async function runComplianceScan(
  supabase: SupabaseClient,
  input: ComplianceScanInput,
  actorUserProfileId: number,
  isAdminViewer = false
): Promise<ComplianceScanResult> {
  return runScan(supabase,input,actorUserProfileId,isAdminViewer);
}

export { loadRulesForEntityType, loadLinkedDocuments };
