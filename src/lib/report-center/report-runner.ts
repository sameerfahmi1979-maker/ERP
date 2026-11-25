import {HR_LETTER_CAPABILITIES} from '@/lib/official-documents/hr-source-contract';
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
  ReportDataResult,
} from "./types";
import { resolveReportBranding } from "./branding-resolver";
import { applyRedaction } from "./redaction-engine";
import { REPORT_FETCHERS } from "./report-fetchers";
import { PAYROLL_FINANCE_REPORT } from "./payroll-finance-contract";
import { assertAccountActive, hasPermission, getAuthContextForProfileId, type AuthContext } from "@/lib/rbac/check";
import { createScopedReportReadClient,revalidateScopedReportReadClient,type ReportReadClient } from "./scoped-read-client";
import { isRecruitmentReport, usesFreshAnalyticalExport } from "./recruitment-reports";
import { analyticalBrandingVersion, matchesScreenPageReceipt, pageAnalyticalRows, screenPageReceipt, screenRunId } from "./analytical-screen-page";
import {collectedCompanyIds,reportAuthorityIdentity} from './result-identity';
import {getEmployeeAccess} from '@/lib/rbac/employee-access';
import { readActiveReportRegistryEntry, REPORT_CONFIGURATION_LOAD_ERROR } from "@/server/reads/report-registry-entry";
import { brandingPermission } from "@/lib/branding/asset-permissions";

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
  actor: AuthContext,
  {refreshInteractiveActor}: {refreshInteractiveActor?: () => Promise<AuthContext>} = {},
): Promise<ReportRunResult> {
  const startMs = Date.now();
  assertAccountActive(actor);
  if(actor.profile!.id!==request.requestedByUserId) return {success:false,error:"Report principal mismatch"};
  const analytical = usesFreshAnalyticalExport(request.reportCode);
  if (request.screenPage && (!analytical || request.outputFormat !== "screen")) {
    return {success: false, error: "Result paging is only available for analytical report previews."};
  }
  const continuation = request.screenPage?.receipt;
  if (request.reportCode === PAYROLL_FINANCE_REPORT && request.outputFormat !== "screen") {
    return { success: false, error: "Payroll reconciliation is available only in Report Center." };
  }
  let callerPermissionCodes=actor.permissionCodes;
  const deliveryPermissions = request.outputFormat === "screen" ? [] : request.outputFormat === "email" ? ["reports.export","reports.email"] : ["reports.export"];
  if (deliveryPermissions.some(code=>!hasPermission(actor,code))) return {success:false,error:"Separate report export/email permission is required."};

  // ── 1. Load registry ──────────────────────────────────────────────────────
  const registry = await readActiveReportRegistryEntry(request.reportCode);
  if (registry.state === "failed") return { success: false, error: REPORT_CONFIGURATION_LOAD_ERROR };
  if (registry.state === "missing") {
    return {
      success: false,
      error: `Report '${request.reportCode}' not found in registry.`,
    };
  }
  const registryEntry = registry.entry;

  // ── 2. Permission check ───────────────────────────────────────────────────
  registryEntry.required_permissions=[...new Set([...registryEntry.required_permissions,...(HR_LETTER_CAPABILITIES[request.reportCode]??[])])];
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
  // A receipt ties a continuation to a completed run, while every request still
  // recollects and revalidates current authority and source facts below.
  const runId = continuation ? screenRunId(continuation) : (await createReportRunLog({
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
  })).runId;

  if(!runId)return {success:false,error:'Report audit admission could not be confirmed. No report was produced.'};
  const failRun = async (message: string) => {
    if (!continuation) await failReportRunLog(runId, message, Date.now() - startMs);
  };

  // ── 5. Fetch data ─────────────────────────────────────────────────────────
  const fetcher = REPORT_FETCHERS[request.reportCode];
  if (!fetcher) {
    const errMsg = 'The data source for this report is not available. Ask an administrator to review its configuration; no partial report was produced.';
    await failRun(errMsg);
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
    collectionClient=await createScopedReportReadClient(actor,request.reportCode,[...registryEntry.required_permissions,...deliveryPermissions],request.filters ?? {});
    rawData = await fetcher.fetch(
      request.filters ?? {},
      callerPermissionCodes,
      collectionClient
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await failRun(errMsg);
    return { success: false, error: errMsg, runId: runId ?? undefined };
  }

  // Caller-supplied company IDs are hints, never the identity of returned data.
  // Rebind the final letterhead to the actual complete, scoped collection.
  let actualCompanies:number[];
  let outputActor = actor;
  try{
    actualCompanies=collectedCompanyIds(rawData);
    if(request.ownerCompanyIds?.length && JSON.stringify([...new Set(request.ownerCompanyIds)].sort((a,b)=>a-b))!==JSON.stringify(actualCompanies))throw Error('The requested company context no longer matches the report data. Run it again.');
    // Interactive runs check their live session immediately before publication.
    // Workers retain their existing profile-based recheck and never need cookies.
    const fresh=refreshInteractiveActor ? actor : await getAuthContextForProfileId(actor.profile!.id);
    outputActor = fresh;
    assertAccountActive(fresh);
    if(reportAuthorityIdentity(fresh)!==reportAuthorityIdentity(actor))throw Error('Your report permissions changed during collection. Run it again.');
    await revalidateScopedReportReadClient(collectionClient,fresh);
    // Role identity alone does not include live employee/user or manager links.
    // Reconcile those relationships before releasing any selected-person facts.
    if(request.reportCode.startsWith('HR_') && request.filters?.employee_id!==undefined){
      const access=await getEmployeeAccess(fresh,Number(request.filters.employee_id));
      if(!['reports.run',...registryEntry.required_permissions,...deliveryPermissions].every(access.allows))throw Error('Your employee report access changed during collection. Run it again.');
      callerPermissionCodes=access.scopedContext.permissionCodes;
    }
    const hasUnassignedScope = isRecruitmentReport(request.reportCode) && rawData.rows.some(row => row.owner_company_id === null);
    brandingResult=await resolveReportBranding({templateId:request.templateId,ownerCompanyIds:hasUnassignedScope ? [] : actualCompanies,registryEntry,isLetterType:registryEntry.is_letter_type},fresh);
    if(brandingResult.requiresManualTemplateSelection){await failRun('Company letterhead selection required');return {success:false,runId,requiresManualTemplateSelection:true,error:'This report spans multiple companies. Select a governed group or neutral letterhead.'};}
    const brandCompany=brandingResult.resolvedBrandingProfile?.owner_company_id;
    if(brandCompany!==null&&brandCompany!==undefined && (hasUnassignedScope||actualCompanies.length!==1||actualCompanies[0]!==brandCompany))throw Error('Choose a letterhead matching the report company, or a governed group/neutral letterhead for combined data.');
  }catch(error){
    const message=error instanceof Error&&/company context|permissions changed|scope changed|data changed|employee report access changed|Choose a letterhead/.test(error.message)?error.message:'Report company or branding authority could not be verified. No output was produced.';
    await failRun(message);return {success:false,error:message,runId};
  }

  // ── 6. Apply redaction ────────────────────────────────────────────────────
  const { sanitizedData, summary } = applyRedaction(rawData, {
    profile: registryEntry.sensitive_profile,
    permissionCodes: callerPermissionCodes,
  });

  let preview: ReturnType<typeof pageAnalyticalRows> | undefined;
  let brandingVersion: string | undefined;
  let brandingCanSign: boolean | undefined;
  try {
    if (refreshInteractiveActor) {
      outputActor = await refreshInteractiveActor();
      if (!outputActor.profile || outputActor.profile.auth_user_id !== actor.profile!.auth_user_id || !outputActor.isAccountActive) {
        const message = "Your report session is no longer active. Sign in and run it again.";
        await failRun(message);
        return {success: false, error: message, runId};
      }
      if (reportAuthorityIdentity(outputActor) !== reportAuthorityIdentity(actor)) {
        const message = "Your report permissions changed during collection. Run it again.";
        await failRun(message);
        return {success: false, error: message, runId};
      }
    }
    if (analytical) {
      brandingCanSign = brandingPermission(outputActor, "reports.sign", brandingResult.resolvedBrandingProfile?.owner_company_id ?? null);
      brandingVersion = analyticalBrandingVersion(registryEntry, brandingResult, brandingCanSign);
    }
    if (request.screenPage) {
      const filters = Object.entries(request.filters ?? {}).sort(([a], [b]) => a.localeCompare(b));
      const receipt = screenPageReceipt(runId, {
        actor: [actor.profile!.auth_user_id, reportAuthorityIdentity(actor)],
        report: request.reportCode,
        filters,
        companies: actualCompanies,
        brandingVersion,
        rawData,
        visibleColumns: sanitizedData.columns,
        summary,
      });
      if (continuation && !matchesScreenPageReceipt(continuation, receipt)) {
        return {success: false, error: "Report data, scope or branding changed. Run the report again."};
      }
      preview = pageAnalyticalRows(sanitizedData, request.screenPage, receipt);
    }
  } catch {
    const message = "The analytical report result could not be verified. Run the report again.";
    await failRun(message);
    return {success: false, error: message, runId};
  }

  // ── 7. Complete run log ───────────────────────────────────────────────────
  const durationMs = Date.now() - startMs;
  if (!continuation) {
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
    data: preview?.data ?? sanitizedData,
    ...(preview ? {screenPage: preview.screenPage} : {}),
    ...(brandingVersion ? {analyticalBrandingVersion: brandingVersion, analyticalBrandingCanSign: brandingCanSign} : {}),
    redactionSummary: summary,
    resolvedBrandingProfileId:
      brandingResult.resolvedBrandingProfile?.id ?? undefined,
    resolvedTemplateId: brandingResult.resolvedTemplate?.id ?? undefined,
  };
}
