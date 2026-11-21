import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReportRegistryEntry } from "@/lib/report-center/types";

export const REPORT_CONFIGURATION_LOAD_ERROR = "Report configuration could not be loaded. Retry the request.";

type RegistryRead =
  | { state: "found"; entry: ReportRegistryEntry }
  | { state: "missing" }
  | { state: "failed" };

/** Reads the active configuration after the caller's existing authority check. */
export async function readActiveReportRegistryEntry(reportCode: string): Promise<RegistryRead> {
  try {
    const { data, error } = await createAdminClient()
      .from("erp_report_registry")
      .select("*")
      .eq("report_code", reportCode)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return { state: "failed" };
    if (data === null) return { state: "missing" };
    if (!data || typeof data !== "object" || Array.isArray(data)) return { state: "failed" };
    return { state: "found", entry: data as ReportRegistryEntry };
  } catch {
    return { state: "failed" };
  }
}
