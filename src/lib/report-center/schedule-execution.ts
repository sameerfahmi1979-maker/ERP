import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContextForProfileId, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { runReport } from "./report-runner";
import { generateAttachmentByType } from "@/lib/export/generate-attachment";
import { resolveTemplateForExport } from "./template-export";
import { DeliveryPolicyError, requireReportDelivery } from "@/lib/email/queue/policy";
import type { DeliveryClaim } from "@/lib/email/queue/source";
import type { EmailMessageInput } from "@/lib/email/providers/types";
import type { ERPExportOptions } from "@/lib/export/export-types";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function grantSnapshot(ctx: AuthContext) {
    return JSON.stringify((ctx.roleAssignments ?? []).map(r => [r.roleId, r.ownerCompanyId, r.branchId,
        [...r.permissionCodes].sort()]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
export interface ExecutableSchedule {
    id: number;
    created_by: number;
    owner_company_id: number | null;
    filters_json: Record<string, unknown>;
    selected_template_id: number | null;
    output_format: "pdf" | "excel" | "csv";
    recipient_to: string[];
    recipient_cc: string[] | null;
    email_subject_template: string | null;
    email_body_template: string | null;
    is_active: boolean;
    deleted_at: string | null;
    report: {
        id: number;
        report_code: string;
        report_name_en: string;
        required_permissions: string[];
        sensitive_profile: string;
        is_active: boolean;
        supports_scheduling: boolean;
        document_class: string | null;
    };
}
export const SCHEDULE_DELIVERY_SELECT = `*,report:erp_report_registry(
 id,report_code,report_name_en,required_permissions,sensitive_profile,is_active,supports_scheduling,document_class)`;
export async function loadDeliverableSchedule(id: number): Promise<ExecutableSchedule> {
    const { data, error } = await createAdminClient().from("erp_report_schedules").select(SCHEDULE_DELIVERY_SELECT).eq("id", id).maybeSingle();
    if (error)
        throw new Error("Schedule lookup failed");
    const s = data as unknown as ExecutableSchedule | null;
    if (!s || !s.is_active || s.deleted_at || !s.report?.is_active || !s.report.supports_scheduling
        || ![null, "", "E", "F", "G"].includes(s.report.document_class) || !["pdf", "excel", "csv"].includes(s.output_format))
        throw new DeliveryPolicyError();
    return s;
}
/** Preflight ONLY. Each attempt regenerates data with current scoped email permissions. */
export async function prepareScheduleMessage(q: DeliveryClaim, signal: AbortSignal): Promise<EmailMessageInput> {
    if (!q.source_entity_id || !q.report_schedule_run_id || !q.source_revision)
        throw new DeliveryPolicyError();
    const sched = await loadDeliverableSchedule(q.source_entity_id);
    if (sched.created_by !== q.created_by)
        throw new DeliveryPolicyError();
    const current = await createAdminClient().rpc("f09_schedule_is_current", { p_id: sched.id, p_revision: q.source_revision });
    if (current.error)
        throw new Error("Schedule revision lookup failed");
    if (current.data !== true)
        throw new DeliveryPolicyError();
    const actor = await getAuthContextForProfileId(sched.created_by);
    requireReportDelivery(actor, sched.owner_company_id);
    if (sched.report.required_permissions.some(p => ![p, p + ".self", p + ".team"].some(code => hasPermission(actor, code))))
        throw new DeliveryPolicyError();
    const allRecipients = [...sched.recipient_to, ...(sched.recipient_cc ?? [])];
    if (!sched.recipient_to.length || allRecipients.length > 100 || allRecipients.some(e => !EMAIL_RE.test(e)))
        throw new DeliveryPolicyError();
    signal.throwIfAborted();
    const runResult = await runReport({
        reportCode: sched.report.report_code,
        outputFormat: "email",
        filters: sched.filters_json,
        templateId: sched.selected_template_id ?? undefined,
        ownerCompanyIds: sched.owner_company_id ? [sched.owner_company_id] : [],
        requestedByUserId: sched.created_by,
    }, actor);
    if (!runResult.success || !runResult.data) {
        throw new Error("Authorized report generation failed");
    }
    signal.throwIfAborted();
    const { columns, rows } = runResult.data;
    const exportColumns = columns.map((col) => ({
        key: col,
        header: col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
    const exportData = rows.map((row) => Object.fromEntries(columns.map((col) => [col, row[col] ?? ""])));
    // Resolve report branding from the selected (or run-resolved) template.
    const resolvedTemplateId = sched.selected_template_id ?? runResult.resolvedTemplateId;
    let brandingContext: ERPExportOptions<Record<string, unknown>>["branding"] | undefined;
    if (!resolvedTemplateId)
        throw new DeliveryPolicyError();
    if (resolvedTemplateId) {
        try {
            const ctx = await resolveTemplateForExport({
                templateId: resolvedTemplateId,
                reportCode: sched.report.report_code,
                principalId: sched.created_by,
            });
            if (!ctx)
                throw new DeliveryPolicyError();
            brandingContext = ctx;
        }
        catch {
            throw new DeliveryPolicyError();
        }
    }
    const exportOptions: ERPExportOptions<Record<string, unknown>> = {
        title: sched.report.report_name_en,
        filename: `${sched.report.report_code}_${new Date().toISOString().split("T")[0]}`,
        columns: exportColumns,
        data: exportData,
        branding: brandingContext,
    };
    signal.throwIfAborted();
    const attachment = await generateAttachmentByType(sched.output_format, exportOptions);
    signal.throwIfAborted();
    const subject = sched.email_subject_template ??
        `${sched.report.report_name_en} — ${new Date().toLocaleDateString("en-GB")}`;
    const body = sched.email_body_template ??
        `Dear Recipient,\n\nPlease find attached the scheduled ${sched.report.report_name_en} report.\n\nRegards,\nERP System`;
    // Recipient validation: only well-formed addresses stored on the schedule
    // are ever used; anything else fails the run before any send.
    const toList = [...new Set((sched.recipient_to ?? []).map((e) => e.trim()).filter(Boolean))];
    const ccList = [...new Set((sched.recipient_cc ?? []).map((e) => e.trim()).filter(Boolean))];
    const invalid = [...toList, ...ccList].filter((e) => !EMAIL_RE.test(e));
    if (!toList.length || invalid.length || toList.length + ccList.length > 100)
        throw new DeliveryPolicyError();
    const latestActor = await getAuthContextForProfileId(sched.created_by);
    requireReportDelivery(latestActor, sched.owner_company_id);
    if (grantSnapshot(latestActor) !== grantSnapshot(actor))
        throw new DeliveryPolicyError();
    const latest = await loadDeliverableSchedule(sched.id);
    if (JSON.stringify(latest.report) !== JSON.stringify(sched.report))
        throw new DeliveryPolicyError();
    signal.throwIfAborted();
    if (!runResult.runId || attachment.sizeBytes > 3000000)
        throw new DeliveryPolicyError();
    const recorded = await createAdminClient().rpc("f09_record_report_preparation", {
        p_id: q.id, p_owner: q.lease_owner, p_token: q.lease_token, p_report_run_id: runResult.runId,
        p_filename: attachment.filename, p_size: attachment.sizeBytes,
    });
    if (recorded.error)
        throw new Error("Prepared report metadata could not be recorded");
    if (recorded.data !== true)
        throw new DeliveryPolicyError();
    return { to: toList, cc: ccList, subject, textBody: body, attachments: [attachment] };
}
export { calculateNextRunAt } from "./schedule-calendar";
