"use server";
import {previewDmsUpdate,prepareDmsUpdate,executeDmsUpdate,cancelDmsUpdate} from "@/server/dms-reviewed-updates";
import {readAllPages} from "@/server/reads/all-pages";

/**
 * ERP DMS AI Phase 16 — Apply-to-ERP Server Actions
 *
 * Server actions for human-reviewed Apply-to-ERP operations.
 *
 * Tier 1 targets (DMS-only):
 *   - dms_documents FK fields (owning_company_id, owning_branch_id, party_id)
 *   - dms_documents basic fields (issue_date, expiry_date, title, description)
 *   - dms_document_metadata_values (via Phase 6/7 engine bridge)
 *
 * Tier 2 targets (Party child records — Tier 2 flags required):
 *   - party_licenses (license_number, license_name, license_activity_text, issue_date, expiry_date, remarks)
 *   - party_tax_registrations (tax_registration_number, effective_from, effective_to, remarks)
 *
 * Governance:
 *   - ALL writes require human confirmation (confirmedItemIds + humanReviewConfirmed)
 *   - ALL writes are feature-flag gated
 *   - Tier 2 requires: master + DMS_AI_APPLY_TO_ERP_PARTY + specific sub-flag
 *   - Dual permission: dms.apply_to_erp.run + target Party permission
 *   - Server-side revalidation before every write (record reloaded from DB)
 *   - Conflict detection: stale fields are skipped, not overwritten
 *   - Audit log every apply event (no raw content, TRN masked)
 *   - No HR writes
 *   - No direct parties/party_bank_details writes
 *   - No auto-apply, no auto-create, no auto-merge
 *   - Preview/create-run/get/list/getPartyApplyTargetRows are READ-ONLY
 *   - Only applyDmsApplyToErpRun() performs target record writes
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { checkDocumentConfidentialityAccess } from "@/lib/dms/document-access";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import {preparePartyDmsRun,executePartyDmsRun,cancelPartyDmsRun} from '@/server/party-dms-apply';
import {
  validateApplyTarget,
  isForbiddenTarget,
} from "@/lib/dms/apply-to-erp/apply-target-registry";
import type {
  ActionResult,
  ApplyRunStatus,
  ApplyItemStatus,
  DmsErpApplyRun,
  DmsErpApplyItem,
  ApplyItemProposal,
  CreateApplyRunInput,
  ApplyRunConfirmation,
  ApplyRunResult,
  PartyApplyTargetKind,
  PartyLicenseRow,
  PartyTaxRow,
} from "@/lib/dms/apply-to-erp/types";

// ── Feature flag helpers ───────────────────────────────────────────────────────

async function isDmsApplyToErpEnabled(): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_AI_APPLY_TO_ERP")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

async function isDmsApplyToErpSubFlagEnabled(
  flagCode:
    | "DMS_AI_APPLY_TO_ERP_DMS_METADATA"
    | "DMS_AI_APPLY_TO_ERP_ENTITY_LINKS"
    | "DMS_AI_APPLY_TO_ERP_PARTY"
    | "DMS_AI_APPLY_TO_ERP_PARTY_LICENSES"
    | "DMS_AI_APPLY_TO_ERP_PARTY_TAX"
): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", flagCode)
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

// ── Input Schemas ─────────────────────────────────────────────────────────────

const ApplyItemProposalSchema = z.object({
  proposedValue: z.string().max(16000).optional(),
  reviewedRevision: z.string().regex(/^[1-9]\d*$/).optional(),
  sourceType:           z.enum(["extraction_result", "validation_finding", "entity_match_candidate", "dms_metadata_apply"]),
  sourceId:             z.number().int().positive().nullable().optional(),
  sourceFieldCode:      z.string().max(100).nullable().optional(),
  targetTable:          z.string().max(100),
  targetField:          z.string().max(100),
  targetRecordId:       z.number().int().positive().nullable().optional(),
  targetDisplayLabel:   z.string().max(200),
  currentValueSummary:  z.string().max(200).nullable().optional(),
  proposedValueSummary: z.string().max(200).nullable().optional(),
  valueType:            z.enum(["text", "date", "number", "boolean", "bigint"]),
  confidence:           z.number().min(0).max(1).nullable().optional(),
  requiresConfirmation: z.boolean().optional().default(true),
  conflictRisk:         z.boolean().optional().default(false),
});

const CreateRunInputSchema = z.object({
  requestId: z.uuid().optional(),
  reviewedSnapshot: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  sourceType:        z.enum(["extraction_result", "validation_finding", "entity_match_candidate", "dms_metadata_apply"]),
  sourceId:          z.number().int().positive().nullable().optional(),
  documentId:        z.number().int().positive(),
  reviewQueueItemId: z.number().int().positive().nullable().optional(),
  targetModule:      z.enum(["dms_document", "dms_metadata", "party"]),
  targetTable:       z.string().max(100),
  targetRecordId:    z.number().int().positive().nullable().optional(),
  items:             z.array(ApplyItemProposalSchema).min(1).max(50),
  // Tier 2 Party context (required when targetModule === "party")
  partyId:           z.number().int().positive().nullable().optional(),
  targetKind:        z.enum(["party_licenses", "party_tax_registrations"]).nullable().optional(),
}).refine(
  (data) => {
    // When targetModule is "party", partyId and targetKind are required
    if (data.targetModule === "party") {
      return data.partyId != null && data.targetKind != null;
    }
    return true;
  },
  { message: "partyId and targetKind are required when targetModule is 'party'" }
);

const ApplyRunConfirmationSchema = z.object({
  confirmedItemIds:         z.array(z.number().int().positive()).min(1),
  humanReviewConfirmed:     z.literal(true),
  replaceExistingConfirmed: z.boolean(),
});

// ── getDmsApplyToErpPreview ───────────────────────────────────────────────────

/**
 * READ-ONLY: Validate and return preview proposals for Apply-to-ERP.
 * No target record writes. No history rows created.
 */
export async function getDmsApplyToErpPreview(
  proposals: ApplyItemProposal[]
): Promise<ActionResult<ApplyItemProposal[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canPreview =
      hasPermission(ctx, "dms.apply_to_erp.preview") ||
      hasPermission(ctx, "dms.apply_to_erp.view") ||
      hasPermission(ctx, "dms.apply_to_erp.run") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canPreview) {
      return { success: false, error: "Permission denied", errorCode: "permission_denied" };
    }

    const masterEnabled = await isDmsApplyToErpEnabled();
    if (!masterEnabled) {
      return { success: false, error: "Apply-to-ERP feature is not enabled", errorCode: "feature_flag_disabled" };
    }

    // Validate each proposal against allowlist and forbidden list
    const validated: ApplyItemProposal[] = [];
    for (const proposal of proposals) {
      if (isForbiddenTarget(proposal.targetTable, proposal.targetField)) {
        logger.warn("[apply-to-erp] forbidden target in preview", {
          targetTable: proposal.targetTable,
          targetField: proposal.targetField,
          userId: ctx.profile.id,
        });
        continue;  // skip forbidden — do not expose as error, just filter
      }
      const v = validateApplyTarget(proposal.targetTable, proposal.targetField);
      if (!v.valid) {
        logger.warn("[apply-to-erp] non-allowlisted target in preview", {
          targetTable: proposal.targetTable,
          targetField: proposal.targetField,
          reason: v.reason,
        });
        continue;
      }
      validated.push(proposal);
    }

    return { success: true, data: validated };
  } catch (err) {
    logger.error("[apply-to-erp] getDmsApplyToErpPreview error", { error: String(err) });
    return { success: false, error: "Preview failed: internal error" };
  }
}

// ── createDmsApplyToErpRun ─────────────────────────────────────────────────────

/**
 * READ-ONLY on target records: creates apply run + items in history only.
 * No target record writes happen here.
 */
export async function createDmsApplyToErpRun(
  rawInput: CreateApplyRunInput
): Promise<ActionResult<{ runId: number; runCode: string }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canRun =
      hasPermission(ctx, "dms.apply_to_erp.run") ||
      hasPermission(ctx, "dms.apply_to_erp.admin") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canRun) {
      return { success: false, error: "Permission denied: requires dms.apply_to_erp.run", errorCode: "permission_denied" };
    }

    const masterEnabled = await isDmsApplyToErpEnabled();
    if (!masterEnabled) {
      return { success: false, error: "Apply-to-ERP feature is not enabled", errorCode: "feature_flag_disabled" };
    }

    // Validate input
    const parsed = CreateRunInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: `Invalid input: ${parsed.error.issues[0]?.message}`, errorCode: "invalid_input" };
    }
    const input = parsed.data;

    if(input.targetModule==='party')return preparePartyDmsRun(input as CreateApplyRunInput);
    if(input.items.some(i=>['party_licenses','party_tax_registrations'].includes(i.targetTable)))return {success:false,error:'Party fields require a party review.',errorCode:'invalid_input'};

    return prepareDmsUpdate(input as CreateApplyRunInput);
  } catch (err) {
    logger.error("[apply-to-erp] createDmsApplyToErpRun error", { error: String(err) });
    return { success: false, error: "Failed to create apply run" };
  }
}

// ── applyDmsApplyToErpRun ──────────────────────────────────────────────────────

/**
 * THE ONLY ACTION THAT WRITES TO TARGET RECORDS.
 *
 * Executes confirmed items from an apply run.
 *
 * Requirements:
 *   - confirmedItemIds must be non-empty
 *   - humanReviewConfirmed must be true
 *   - run must be in 'pending' status
 *   - each item is server-revalidated before write
 *   - conflicts are skipped (not overwritten unless replaceExistingConfirmed=true)
 *   - forbidden items are never written
 *   - metadata apply uses the dms_metadata module path only
 */
export async function applyDmsApplyToErpRun(
  runId: number,
  rawConfirmation: ApplyRunConfirmation
): Promise<ActionResult<ApplyRunResult>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canRun =
      hasPermission(ctx, "dms.apply_to_erp.run") ||
      hasPermission(ctx, "dms.apply_to_erp.admin") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canRun) {
      return { success: false, error: "Permission denied: requires dms.apply_to_erp.run", errorCode: "permission_denied" };
    }

    // Validate confirmation
    const parsedConfirmation = ApplyRunConfirmationSchema.safeParse(rawConfirmation);
    if (!parsedConfirmation.success) {
      return {
        success: false,
        error: `Invalid confirmation: ${parsedConfirmation.error.issues[0]?.message}`,
        errorCode: "invalid_input",
      };
    }
    const confirmation = parsedConfirmation.data;

    if (!confirmation.humanReviewConfirmed) {
      return { success: false, error: "Human review must be confirmed", errorCode: "invalid_input" };
    }
    if (confirmation.confirmedItemIds.length === 0) {
      return { success: false, error: "No confirmed items provided", errorCode: "no_confirmed_items" };
    }

    // Feature flags
    const masterEnabled = await isDmsApplyToErpEnabled();
    if (!masterEnabled) {
      return { success: false, error: "Apply-to-ERP feature is not enabled", errorCode: "feature_flag_disabled" };
    }

    // Reload run record
    const caller = await createClient();
    const { data: runRow, error: runLoadErr } = await caller
      .from("dms_ai_erp_apply_runs")
      .select("id, run_code, status, document_id, source_type, target_module, target_table, target_record_id, requested_by")
      .eq("id", runId)
      .single();

    if (runLoadErr || !runRow) {
      return { success: false, error: "Apply run not found", errorCode: "run_not_found" };
    }
    const run = runRow as {
      id: number; run_code: string | null; status: string; document_id: number | null;
      source_type: string; target_module: string; target_table: string;
      target_record_id: number | null; requested_by: number;
    };

    if(run.target_module==='party'){
      const result=await executePartyDmsRun(runId,confirmation);
      if(result.success){
        // The transaction receipt proves commit; cache failure cannot undo it.
        for(const path of [`/admin/master-data/parties/record/${run.target_record_id}`,'/admin/master-data/parties',`/dms/documents/record/${run.document_id}`,'/dms/documents']){
          try{revalidatePath(path);}catch{logger.warn('[party-dms] committed review cache refresh failed',{runId});}
        }
      }
      return result;
    }

    const result=await executeDmsUpdate(runId,confirmation);
    if(result.success){for(const path of [`/dms/documents/record/${run.document_id}`,"/dms/documents"]){try{revalidatePath(path);}catch{logger.warn("ERP update committed; display refresh unavailable");}}}
    return result;
  } catch (err) {
    logger.error("[apply-to-erp] applyDmsApplyToErpRun error", { error: String(err) });
    return { success: false, error: "Apply run execution failed" };
  }
}

// ── getPartyApplyTargetRows ───────────────────────────────────────────────────

/**
 * READ-ONLY: Returns safe list of party_licenses or party_tax_registrations rows
 * for the given party, for human selection before creating a party apply run.
 *
 * Never writes. Never auto-selects or auto-creates.
 * TRN fields are masked in the returned rows.
 */
export async function getPartyApplyTargetRows(input: {
  documentId: number;
  partyId:    number;
  targetKind: PartyApplyTargetKind;
}): Promise<ActionResult<PartyLicenseRow[] | PartyTaxRow[]>> {
  try {
    const parsed = z.object({
      documentId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      partyId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      targetKind: z.enum(["party_licenses", "party_tax_registrations"]),
    }).strict().safeParse(input);
    if (!parsed.success) return { success: false, error: "Select a valid document, party and target type.", errorCode: "invalid_input" };
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    // Global shared-party authority and source-document authority are separate.
    // A company-scoped role is not permission to browse the global party data.
    if (!hasGlobalPermission(ctx, "master_data.parties.view")) {
      return { success: false, error: "Permission denied: requires master_data.parties.view", errorCode: "permission_denied" };
    }

    const db = await createClient();
    const sourceAccess = await checkDocumentConfidentialityAccess(db, parsed.data.documentId, ctx);
    if (!sourceAccess.allowed) return { success: false, error: "The source document is unavailable or access is restricted.", errorCode: "permission_denied" };
    const { data: parent, error: parentError } = await db.from("parties")
      .select("id, is_active, is_locked").eq("id", parsed.data.partyId).maybeSingle();
    if (parentError) return { success: false, error: "The party could not be checked. Try again." };
    if (!parent) return { success: false, error: "This party is unavailable for Apply to ERP.", errorCode: "target_record_not_found" };
    if (!parent.is_active) return { success: false, error: "This party is inactive and cannot receive changes.", errorCode: "target_record_inactive" };
    if (parent.is_locked) return { success: false, error: "This party is locked and cannot receive changes.", errorCode: "target_forbidden" };

    const masterEnabled = await isDmsApplyToErpEnabled();
    if (!masterEnabled) {
      return { success: false, error: "Apply-to-ERP feature is not enabled", errorCode: "feature_flag_disabled" };
    }
    const partyGate = await isDmsApplyToErpSubFlagEnabled("DMS_AI_APPLY_TO_ERP_PARTY");
    if (!partyGate) {
      return { success: false, error: "Party apply feature is not enabled", errorCode: "feature_flag_disabled" };
    }

    if (parsed.data.targetKind === "party_licenses") {
      const { data, error } = await db
        .from("party_licenses")
        .select("id, party_id, workspace_revision, license_code, license_number, license_name, license_activity_text, remarks, issue_date, expiry_date, is_active")
        .eq("party_id", parsed.data.partyId)
        .eq("is_active", true)
        .is("archived_at", null)
        .order("is_active", { ascending: false })
        .order("id", { ascending: false });

      if (error || !Array.isArray(data)) {
        return { success: false, error: "Failed to load party licenses" };
      }

      const rows: PartyLicenseRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
        workspace_revision: String(r.workspace_revision),
        license_activity_text: r.license_activity_text as string|null,
        remarks: r.remarks as string|null,
        id:           r.id as number,
        party_id:     r.party_id as number,
        license_code: (r.license_code as string | null) ?? null,
        license_number: (r.license_number as string | null) ?? null,
        license_name: (r.license_name as string | null) ?? null,
        issue_date:   (r.issue_date as string | null) ?? null,
        expiry_date:  (r.expiry_date as string | null) ?? null,
        is_active:    Boolean(r.is_active),
      }));

      return { success: true, data: rows };

    } else {
      // party_tax_registrations
      const { data, error } = await db
        .from("party_tax_registrations")
        .select("id, party_id, workspace_revision, tax_registration_code, tax_registration_number, remarks, effective_from, effective_to, is_active")
        .eq("party_id", parsed.data.partyId)
        .eq("is_active", true)
        .is("archived_at", null)
        .order("is_active", { ascending: false })
        .order("id", { ascending: false });

      if (error || !Array.isArray(data)) {
        return { success: false, error: "Failed to load party tax registrations" };
      }

      const rows: PartyTaxRow[] = (data ?? []).map((r: Record<string, unknown>) => {
        const rawTrn = (r.tax_registration_number as string | null) ?? null;
        return {
          id:                           r.id as number,
          party_id:                     r.party_id as number,
          workspace_revision: String(r.workspace_revision),
          remarks: r.remarks as string|null,
          tax_registration_code:        (r.tax_registration_code as string | null) ?? null,
          tax_registration_number_masked: rawTrn
            ? (rawTrn.length <= 8 ? "****" : rawTrn.slice(0, 4) + "****" + rawTrn.slice(-4))
            : null,
          effective_from:               (r.effective_from as string | null) ?? null,
          effective_to:                 (r.effective_to as string | null) ?? null,
          is_active:                    Boolean(r.is_active),
        };
      });

      return { success: true, data: rows };
    }
  } catch {
    logger.error("[apply-to-erp] getPartyApplyTargetRows failed");
    return { success: false, error: "Failed to load party target rows" };
  }
}

// ── getDmsApplyToErpRun ────────────────────────────────────────────────────────

/** READ-ONLY: Get a single apply run with its items. */
export async function getDmsApplyToErpRun(
  runId: number
): Promise<ActionResult<DmsErpApplyRun>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id||!ctx.isAccountActive||ctx.profile.must_change_password) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canView =
      hasPermission(ctx, "dms.apply_to_erp.view") ||
      hasPermission(ctx, "dms.apply_to_erp.run") ||
      hasPermission(ctx, "dms.apply_to_erp.admin") ||
      hasPermission(ctx, "dms.documents.view") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canView) {
      return { success: false, error: "Permission denied", errorCode: "permission_denied" };
    }

    const db = await createClient();

    const { data: runRow, error } = await db
      .from("dms_ai_erp_apply_runs")
      .select(`
        id, run_code, source_type, source_id, document_id, review_queue_item_id,
        status, target_module, target_table, target_record_id,
        requested_by, confirmed_by, started_at, completed_at, failed_at, cancelled_at,
        error_message, created_at, updated_at
      `)
      .eq("id", runId)
      .single();

    if (error || !runRow) {
      return { success: false, error: "Apply run not found", errorCode: "run_not_found" };
    }

    const itemRows=await readAllPages(async(from,to)=>await db
      .from("dms_ai_erp_apply_items")
      .select("*",{count:"exact"})
      .eq("apply_run_id", runId)
      .order("id").range(from,to),{identity:row=>row.id,maxRows:10000});

    if(!Array.isArray(itemRows))return {success:false,error:'Apply history could not be loaded. Try again.'};

    const run = mapRunRow(runRow as Record<string, unknown>, (itemRows ?? []) as Record<string, unknown>[]);
    return { success: true, data: run };
  } catch (err) {
    logger.error("[apply-to-erp] getDmsApplyToErpRun error", { error: String(err) });
    return { success: false, error: "Failed to load apply run" };
  }
}

// ── listDmsApplyToErpRuns ─────────────────────────────────────────────────────

/** READ-ONLY: List apply runs with optional filters. */
export async function listDmsApplyToErpRuns(filters?: {
  documentId?:  number;
  status?:      string;
  page?:        number;
  pageSize?:    number;
}): Promise<ActionResult<{ runs: DmsErpApplyRun[]; total: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id||!ctx.isAccountActive||ctx.profile.must_change_password) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canView =
      hasPermission(ctx, "dms.apply_to_erp.view") ||
      hasPermission(ctx, "dms.apply_to_erp.run") ||
      hasPermission(ctx, "dms.apply_to_erp.admin") ||
      hasPermission(ctx, "dms.documents.view") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canView) {
      return { success: false, error: "Permission denied", errorCode: "permission_denied" };
    }

    const db = await createClient();
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    if(!Number.isSafeInteger(page)||page<1||page>100000||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)return {success:false,error:"Invalid history page"};
    const from = (page - 1) * pageSize;

    let query = db
      .from("dms_ai_erp_apply_runs")
      .select("id, run_code, source_type, status, target_module, target_table, document_id, requested_by, created_at, updated_at, completed_at, cancelled_at", { count: "exact" });

    if (filters?.documentId) {
      query = query.eq("document_id", filters.documentId);
    }
    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    query = query.order("created_at", { ascending: false }).order("id").range(from, from + pageSize - 1);

    let result=await query;
    if(result.status===416&&result.error?.code==="PGRST103"){const c=await query.range(0,0);if(!c.error&&c.count!==null&&Number.isSafeInteger(c.count)&&c.count>=0&&from>=c.count&&c.data?.length===Math.min(1,c.count))result={...c,data:[]};}
    const {data,error,count}=result;

    if (error||count===null||!Number.isSafeInteger(count)||!Array.isArray(data)||data.length!==Math.min(pageSize,Math.max(0,count-from))) {
      return { success: false, error: "Failed to list apply runs" };
    }

    const runs = (data ?? []).map((row) => mapRunRow(row as Record<string, unknown>, []));
    return { success: true, data: { runs, total: count ?? 0 } };
  } catch (err) {
    logger.error("[apply-to-erp] listDmsApplyToErpRuns error", { error: String(err) });
    return { success: false, error: "Failed to list apply runs" };
  }
}

// ── cancelDmsApplyToErpRun ────────────────────────────────────────────────────

/** Cancel a pending apply run. Does not revert applied items. */
export async function cancelDmsApplyToErpRun(
  runId: number
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canRun =
      hasPermission(ctx, "dms.apply_to_erp.run") ||
      hasPermission(ctx, "dms.apply_to_erp.admin") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canRun) {
      return { success: false, error: "Permission denied", errorCode: "permission_denied" };
    }

    const caller = await createClient();
    const { data: runRow } = await caller
      .from("dms_ai_erp_apply_runs")
      .select("id, run_code, status, document_id, requested_by, target_module")
      .eq("id", runId)
      .single();

    if (!runRow) {
      return { success: false, error: "Apply run not found", errorCode: "run_not_found" };
    }

    if(runRow.target_module==='party')return cancelPartyDmsRun(runId);

    return cancelDmsUpdate(runId);
  } catch (err) {
    logger.error("[apply-to-erp] cancelDmsApplyToErpRun error", { error: String(err) });
    return { success: false, error: "Failed to cancel apply run" };
  }
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function mapRunRow(
  row: Record<string, unknown>,
  items: Record<string, unknown>[]
): DmsErpApplyRun {
  return {
    id:                 row.id as number,
    runCode:            (row.run_code as string | null) ?? null,
    sourceType:         row.source_type as DmsErpApplyRun["sourceType"],
    sourceId:           (row.source_id as number | null) ?? null,
    documentId:         (row.document_id as number | null) ?? null,
    reviewQueueItemId:  (row.review_queue_item_id as number | null) ?? null,
    status:             row.status as ApplyRunStatus,
    targetModule:       row.target_module as DmsErpApplyRun["targetModule"],
    targetTable:        row.target_table as string,
    targetRecordId:     (row.target_record_id as number | null) ?? null,
    requestedBy:        row.requested_by as number,
    requestedByName:    null,
    confirmedBy:        (row.confirmed_by as number | null) ?? null,
    confirmedByName:    null,
    startedAt:          (row.started_at as string | null) ?? null,
    completedAt:        (row.completed_at as string | null) ?? null,
    failedAt:           (row.failed_at as string | null) ?? null,
    cancelledAt:        (row.cancelled_at as string | null) ?? null,
    errorMessage:       (row.error_message as string | null) ?? null,
    createdAt:          row.created_at as string,
    updatedAt:          row.updated_at as string,
    items:              items.map(mapItemRow),
  };
}

function mapItemRow(row: Record<string, unknown>): DmsErpApplyItem {
  return {
    id:                   row.id as number,
    applyRunId:           row.apply_run_id as number,
    sourceType:           row.source_type as DmsErpApplyItem["sourceType"],
    sourceId:             (row.source_id as number | null) ?? null,
    sourceFieldCode:      (row.source_field_code as string | null) ?? null,
    targetTable:          row.target_table as string,
    targetField:          row.target_field as string,
    targetRecordId:       (row.target_record_id as number | null) ?? null,
    targetDisplayLabel:   (row.target_display_label as string | null) ?? null,
    currentValueSummary:  (row.current_value_summary as string | null) ?? null,
    proposedValueSummary: (row.proposed_value_summary as string | null) ?? null,
    appliedValueSummary:  (row.applied_value_summary as string | null) ?? null,
    valueType:            (row.value_type as DmsErpApplyItem["valueType"]) ?? null,
    confidence:           (row.confidence as number | null) ?? null,
    status:               row.status as ApplyItemStatus,
    skipReason:           (row.skip_reason as string | null) ?? null,
    failureReason:        (row.failure_reason as string | null) ?? null,
    requiresConfirmation: Boolean(row.requires_confirmation),
    confirmed:            Boolean(row.confirmed),
    appliedAt:            (row.applied_at as string | null) ?? null,
    appliedBy:            (row.applied_by as number | null) ?? null,
    createdAt:            row.created_at as string,
    updatedAt:            row.updated_at as string,
  };
}

/** Resolve complete source and target values before human confirmation. */
export async function getDmsApplyToErpReview(documentId:number,items:ApplyItemProposal[]){
 return previewDmsUpdate(documentId,items);
}
