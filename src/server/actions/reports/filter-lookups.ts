"use server";

/**
 * Global ERP Report Center — Report Filter Lookup Action
 * Phase: HR.11 / REPORT FINAL FIX
 *
 * Fetches entity lookup options for common report filter fields.
 * Server-side only. Uses admin client for consistent reads.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

export interface FilterLookupOption {
  value: number;
  label: string;
  code?: string;
}

export interface ReportFilterLookups {
  employees?: FilterLookupOption[];
  ownerCompanies?: FilterLookupOption[];
  departments?: FilterLookupOption[];
  branches?: FilterLookupOption[];
  designations?: FilterLookupOption[];
  workSites?: FilterLookupOption[];
}

export type FilterLookupKey =
  | "employee_id"
  | "owner_company_id"
  | "department_id"
  | "branch_id"
  | "designation_id"
  | "work_site_id";

/**
 * Fetch lookup options for the given entity filter keys.
 * Only loads data for keys that are requested.
 */
export async function getReportFilterLookups(
  requiredKeys: FilterLookupKey[]
): Promise<{ success: boolean; data?: ReportFilterLookups; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.run")) {
      return { success: false, error: "Permission denied." };
    }

    const db = createAdminClient();
    const result: ReportFilterLookups = {};

    await Promise.all(
      requiredKeys.map(async (key) => {
        switch (key) {
          case "employee_id": {
            const { data } = await db
              .from("employees")
              .select("id, employee_code, full_name_en")
              .is("deleted_at", null)
              .order("full_name_en")
              .limit(500);
            result.employees = (data ?? []).map((e) => ({
              value: e.id,
              label: e.full_name_en,
              code: e.employee_code,
            }));
            break;
          }
          case "owner_company_id": {
            const { data } = await db
              .from("owner_companies")
              .select("id, company_code, legal_name_en")
              .is("deleted_at", null)
              .order("legal_name_en");
            result.ownerCompanies = (data ?? []).map((c) => ({
              value: c.id,
              label: c.legal_name_en,
              code: c.company_code,
            }));
            break;
          }
          case "department_id": {
            const { data } = await db
              .from("departments")
              .select("id, department_name_en")
              .is("deleted_at", null)
              .order("department_name_en");
            result.departments = (data ?? []).map((d) => ({
              value: d.id,
              label: d.department_name_en,
            }));
            break;
          }
          case "branch_id": {
            const { data } = await db
              .from("branches")
              .select("id, branch_name_en")
              .is("deleted_at", null)
              .order("branch_name_en");
            result.branches = (data ?? []).map((b) => ({
              value: b.id,
              label: b.branch_name_en,
            }));
            break;
          }
          case "designation_id": {
            const { data } = await db
              .from("designations")
              .select("id, designation_name_en")
              .is("deleted_at", null)
              .order("designation_name_en");
            result.designations = (data ?? []).map((d) => ({
              value: d.id,
              label: d.designation_name_en,
            }));
            break;
          }
          case "work_site_id": {
            const { data } = await db
              .from("work_sites")
              .select("id, site_name")
              .is("deleted_at", null)
              .order("site_name");
            result.workSites = (data ?? []).map((s) => ({
              value: s.id,
              label: s.site_name,
            }));
            break;
          }
        }
      })
    );

    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

