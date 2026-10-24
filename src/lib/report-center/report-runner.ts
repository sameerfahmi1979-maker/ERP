/**
 * Global ERP Report Center — Report Runner Foundation
 * Phase: REPORT.2 — Global Report Engine + Registry + Security Foundation
 *
 * Server-side only. Do NOT import in client components.
 *
 * REPORT.2 scope:
 *  - runReport: validates permissions, detects missing fetcher, creates run log
 *  - createReportRunLog / completeReportRunLog / failReportRunLog: audit trail
 *
 * Real fetchers are registered in report-fetchers.ts (REPORT.4 for HR reports).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type {
  ReportRunRequest,
  ReportRunResult,
  ReportRegistryEntry,
  ReportDataResult,
} from "./types";
import { resolveReportBranding } from "./branding-resolver";
import { applyRedaction } from "./redaction-engine";
import { REPORT_FETCHERS } from "./report-fetchers";
import { assertAccountActive, hasPermission, getAuthContextForProfileId, type AuthContext } from "@/lib/rbac/check";
import { createScopedReportReadClient,revalidateScopedReportReadClient,type ReportReadClient } from "./scoped-read-client";
import {collectedCompanyIds,reportAuthorityIdentity} from './result-identity';
import {getEmployeeAccess} from '@/lib/rbac/employee-access';

// ─────────────────────────────────────────────────────────────────────────────
// Registry loader
// ─────────────────────────────────────────────────────────────────────────────

async function loadRegistryEntry(
  reportCode: string
): Promise<ReportRegistryEntry | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("erp_report_registry")
    .select("*")
    .eq("report_code", reportCode)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if(error)throw Error('Report configuration could not be loaded. Retry the request.');
  return data as ReportRegistryEntry | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Run log helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateRunLogInput {
  reportCode: string;
  reportId: number | null;
  runByUserId: number;
  outputFormat: string;
  filtersJson: Record<string, unknown>;
  selectedTemplateId: number | null;
  resolvedBrandingProfileId: number | null;
  ownerCompanyIds: number[];
  wasMultiCompany: boolean;
  templateSelectedManually: boolean;
  sensitiveProfile: string;
  sensitiveDataIncluded: boolean;
}

export interface CreateRunLogResult {
  runId: number | null;
  error?: string;
}

export async function createReportRunLog(
  input: CreateRunLogInput
): Promise<CreateRunLogResult> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_runs")
      .insert({
        report_code: input.reportCode,
        report_id: input.reportId,
        run_by: input.runByUserId,
        run_status: "running",
        output_format: input.outputFormat,
        filters_json: input.filtersJson,
        selected_template_id: input.selectedTemplateId,
        resolved_branding_profile_id: input.resolvedBrandingProfileId,
        owner_company_ids: input.ownerCompanyIds,
        was_multi_company: input.wasMultiCompany,
        template_selected_manually: input.templateSelectedManually,
        sensitive_profile: input.sensitiveProfile,
        sensitive_data_included: input.sensitiveDataIncluded,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      logger.error("[report-runner] createReportRunLog error:", error.message);
      return { runId: null, error: error.message };
    }

    return { runId: (data as { id: number }).id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[report-runner] createReportRunLog exception:", msg);
    return { runId: null, error: msg };
  }
}

export async function completeReportRunLog(
  runId: number,
  rowCount: number,
  redactionSummaryJson: Record<string, unknown>,
  durationMs: number,
  context?: {ownerCompanyIds:number[];templateId:number|null;profileId:number|null}
): Promise<boolean> {
  try {
    const db = createAdminClient();
    const result=await db
      .from("erp_report_runs")
      .update({
        run_status: "success",
        row_count: rowCount,
        redaction_summary_json: redactionSummaryJson,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        ...(context?{owner_company_ids:context.ownerCompanyIds,was_multi_company:context.ownerCompanyIds.length>1,
          selected_template_id:context.templateId,resolved_branding_profile_id:context.profileId}:{}),
      })
      .eq("id", runId).select('id').maybeSingle();
    if(result.error||result.data?.id!==runId)throw Error('Report run completion not confirmed');
    return true;
  } catch (err) {
    logger.error("[report-runner] completeReportRunLog exception:", err);
    return false;
  }
}

export async function failReportRunLog(
  runId: number,
  errorMessage: string,
  durationMs: number
): Promise<void> {
  try {
    const db = createAdminClient();
    await db
      .from("erp_report_runs")
      .update({
        run_status: "failed",
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq("id", runId);
  } catch (err) {
    logger.error("[report-runner] failReportRunLog exception:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a report:
 * 1. Load registry entry
 * 2. Validate caller permissions
 * 3. Resolve branding / template
 * 4. Find and call fetcher (or return controlled "not implemented" for stubs)
 * 5. Apply redaction
 * 6. Write run log
 * 7. Return result
 */
export async function runReport(
  request: ReportRunRequest,
  actor: AuthContext
): Promise<ReportRunResult> {
  const startMs = Date.now();
  assertAccountActive(actor);
  if(actor.profile!.id!==request.requestedByUserId) return {success:false,error:"Report principal mismatch"};
  let callerPermissionCodes=actor.permissionCodes;
  const deliveryPermissions = request.outputFormat === "screen" ? [] : request.outputFormat === "email" ? ["reports.export","reports.email"] : ["reports.export"];
  if (deliveryPermissions.some(code=>!hasPermission(actor,code))) return {success:false,error:"Separate report export/email permission is required."};

  // ── 1. Load registry ──────────────────────────────────────────────────────
  const registryEntry = await loadRegistryEntry(request.reportCode);
  if (!registryEntry) {
    return {
      success: false,
      error: `Report '${request.reportCode}' not found in registry.`,
    };
  }

  // ── 2. Permission check ───────────────────────────────────────────────────
  const missingPerms = registryEntry.required_permissions.filter(
    (p) => !hasPermission(actor,p) && !hasPermission(actor,p+".self") && !hasPermission(actor,p+".team")
  );
  if (missingPerms.length > 0) {
    return {
      success: false,
      error: `Missing permissions: ${missingPerms.join(", ")}`,
    };
  }

  // ── 3. Branding resolution ────────────────────────────────────────────────
  let brandingResult: Awaited<ReturnType<typeof resolveReportBranding>>;
  try {
    brandingResult = await resolveReportBranding({
      templateId: request.templateId,
      ownerCompanyIds: request.ownerCompanyIds ?? [],
      registryEntry,
      isLetterType: registryEntry.is_letter_type,
    }, actor);
  } catch {
    return { success: false, error: "Report branding is unavailable or not authorized. Reload and try again." };
  }

  if (brandingResult.requiresManualTemplateSelection) {
    return {
      success: false,
      requiresManualTemplateSelection: true,
      error:
        "This report spans multiple companies. Please select a template manually.",
    };
  }

  // ── 4. Create run log (status=running) ────────────────────────────────────
  const { runId } = await createReportRunLog({
    reportCode: request.reportCode,
    reportId: registryEntry.id,
    runByUserId: request.requestedByUserId,
    outputFormat: request.outputFormat,
    filtersJson: request.filters ?? {},
    selectedTemplateId: brandingResult.resolvedTemplate?.id ?? null,
    resolvedBrandingProfileId:
      brandingResult.resolvedBrandingProfile?.id ?? null,
    ownerCompanyIds: request.ownerCompanyIds ?? [],
    wasMultiCompany: (request.ownerCompanyIds?.length ?? 0) > 1,
    templateSelectedManually: !!request.templateId,
    sensitiveProfile: registryEntry.sensitive_profile,
    sensitiveDataIncluded: registryEntry.sensitive_profile !== "normal",
  });

  if(!runId)return {success:false,error:'Report audit admission could not be confirmed. No report was produced.'};

  // ── 5. Fetch data ─────────────────────────────────────────────────────────
  const fetcher = REPORT_FETCHERS[request.reportCode];
  if (!fetcher) {
    const errMsg = 'The data source for this report is not available. Ask an administrator to review its configuration; no partial report was produced.';
    if (runId) {
      await failReportRunLog(runId, errMsg, Date.now() - startMs);
    }
    return { success: false, error: errMsg, runId: runId ?? undefined };
  }

  let rawData: ReportDataResult;
  let collectionClient:ReportReadClient;
  try {
    // A capability granted for another company must not unmask fields on this
    // selected employee. The collection facade independently narrows row IDs.
    if(request.reportCode.startsWith('HR_') && request.filters?.employee_id!==undefined){
      const id=Number(request.filters.employee_id);
      if(!Number.isSafeInteger(id)||id<=0)throw Error('Select a valid employee.');
      const access=await getEmployeeAccess(actor,id);
      if(!['reports.run',...registryEntry.required_permissions,...deliveryPermissions].every(access.allows))throw Error('This employee report is outside your current permitted scope.');
      callerPermissionCodes=access.scopedContext.permissionCodes;
    }
    collectionClient=await createScopedReportReadClient(actor,request.reportCode,[...registryEntry.required_permissions,...deliveryPermissions]);
    rawData = await fetcher.fetch(
      request.filters ?? {},
      callerPermissionCodes,
      collectionClient
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (runId) {
      await failReportRunLog(runId, errMsg, Date.now() - startMs);
    }
    return { success: false, error: errMsg, runId: runId ?? undefined };
  }

  // Caller-supplied company IDs are hints, never the identity of returned data.
  // Rebind the final letterhead to the actual complete, scoped collection.
  let actualCompanies:number[];
  try{
    actualCompanies=collectedCompanyIds(rawData);
    if(request.ownerCompanyIds?.length && JSON.stringify([...new Set(request.ownerCompanyIds)].sort((a,b)=>a-b))!==JSON.stringify(actualCompanies))throw Error('The requested company context no longer matches the report data. Run it again.');
    const fresh=await getAuthContextForProfileId(actor.profile!.id);
    assertAccountActive(fresh);
    if(reportAuthorityIdentity(fresh)!==reportAuthorityIdentity(actor))throw Error('Your report permissions changed during collection. Run it again.');
    if(request.reportCode.startsWith('HR_'))await revalidateScopedReportReadClient(collectionClient,fresh);
    // Role identity alone does not include live employee/user or manager links.
    // Reconcile those relationships before releasing any selected-person facts.
    if(request.reportCode.startsWith('HR_') && request.filters?.employee_id!==undefined){
      const access=await getEmployeeAccess(fresh,Number(request.filters.employee_id));
      if(!['reports.run',...registryEntry.required_permissions,...deliveryPermissions].every(access.allows))throw Error('Your employee report access changed during collection. Run it again.');
      callerPermissionCodes=access.scopedContext.permissionCodes;
    }
    brandingResult=await resolveReportBranding({templateId:request.templateId,ownerCompanyIds:actualCompanies,registryEntry,isLetterType:registryEntry.is_letter_type},fresh);
    if(brandingResult.requiresManualTemplateSelection){await failReportRunLog(runId,'Company letterhead selection required',Date.now()-startMs);return {success:false,runId,requiresManualTemplateSelection:true,error:'This report spans multiple companies. Select a governed group or neutral letterhead.'};}
    const brandCompany=brandingResult.resolvedBrandingProfile?.owner_company_id;
    if(brandCompany!==null&&brandCompany!==undefined && (actualCompanies.length!==1||actualCompanies[0]!==brandCompany))throw Error('Choose a letterhead matching the report company, or a governed group/neutral letterhead for combined data.');
  }catch(error){
    const message=error instanceof Error&&/company context|permissions changed|scope changed|employee report access changed|Choose a letterhead/.test(error.message)?error.message:'Report company or branding authority could not be verified. No output was produced.';
    await failReportRunLog(runId,message,Date.now()-startMs);return {success:false,error:message,runId};
  }

  // ── 6. Apply redaction ────────────────────────────────────────────────────
  const { sanitizedData, summary } = applyRedaction(rawData, {
    profile: registryEntry.sensitive_profile,
    permissionCodes: callerPermissionCodes,
  });

  // ── 7. Complete run log ───────────────────────────────────────────────────
  const durationMs = Date.now() - startMs;
  if (runId) {
    const completed=await completeReportRunLog(
      runId,
      sanitizedData.rows.length,
      summary as unknown as Record<string, unknown>,
      durationMs,
      {ownerCompanyIds:actualCompanies,templateId:brandingResult.resolvedTemplate?.id??null,profileId:brandingResult.resolvedBrandingProfile?.id??null}
    );
    if(!completed)return {success:false,error:'Report completion could not be confirmed. Run it again.',runId};
  }

  return {
    success: true,
    runId: runId ?? undefined,
    rowCount: sanitizedData.rows.length,
    data: sanitizedData,
    redactionSummary: summary,
    resolvedBrandingProfileId:
      brandingResult.resolvedBrandingProfile?.id ?? undefined,
    resolvedTemplateId: brandingResult.resolvedTemplate?.id ?? undefined,
  };
}
