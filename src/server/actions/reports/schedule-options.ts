"use server";

import { getAuthContext, hasGlobalPermission, hasPermission, hasPermissionInScope } from "@/lib/rbac/check";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleUiAccess, type ScheduleFormOptions } from "@/lib/report-center/schedule-ui-access";

/** Minimal catalog labels after explicit company-wide delivery authorization.
 * Branch-only rights cannot authorize company-wide schedule delivery. */
export async function getScheduleFormOptions(): Promise<{ success: boolean; data?: ScheduleFormOptions; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.schedule.view") && !hasPermission(ctx, "reports.schedule.manage"))
      return { success: false, error: "You no longer have access to report schedules." };
    const access = scheduleUiAccess(ctx);
    if (!access.globalDelivery && !access.deliveryCompanyIds.length)
      return { success: true, data: { companies: [], reports: [] } };
    const admin = createAdminClient();
    let query = admin.from("owner_companies").select("id,legal_name_en").eq("status", "active").order("legal_name_en");
    if (!access.globalDelivery) query = query.in("id", access.deliveryCompanyIds);
    const { data: companies, error: companyError } = await query;
    if (companyError) throw companyError;
    const options = (companies ?? []).map(c => ({ value: String(c.id), label: c.legal_name_en }));
    if (access.globalDelivery) options.unshift({ value: "global", label: "Group-wide (all authorized companies)" });
    const { data: reports, error } = await admin.from("erp_report_registry")
      .select("report_code,report_name_en,required_permissions,default_output_formats,document_class")
      .eq("is_active", true).eq("supports_scheduling", true).is("deleted_at", null).order("report_name_en");
    if (error) throw error;
    return { success: true, data: { companies: options, reports: (reports ?? [])
      .filter(r => [null, "", "E", "F", "G"].includes(r.document_class))
      .map(r => ({ code: r.report_code, name: r.report_name_en,
        formats: (r.default_output_formats ?? []).filter((format: string) => ["pdf", "excel", "csv"].includes(format)),
        companyValues: options.filter(c => (r.required_permissions ?? []).every((p: string) =>
          [p, p + ".self", p + ".team"].some(code => c.value === "global"
            ? hasGlobalPermission(ctx, code) : hasPermissionInScope(ctx, code, Number(c.value))))).map(c => c.value),
      })).filter(r => r.companyValues.length > 0 && r.formats.length > 0) } };
  } catch {
    return { success: false, error: "Schedule choices could not be loaded. Your entries are retained; retry before saving." };
  }
}
