/**
 * Shared employee context loader for HR server actions.
 *
 * Consolidates the duplicated "fetch basic employee fields for audit/context"
 * pattern that previously appeared in actions.ts, compliance.ts, operations.ts,
 * payroll.ts, and time.ts.
 */
"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type EmployeeCtx = {
  id: number;
  employee_code: string;
  full_name_en: string;
  owner_company_id: number | null;
};

/**
 * Load minimal employee context using the anon/user Supabase client.
 * Use in server actions that have already validated auth context.
 */
export async function getEmployeeCtx(employeeId: number): Promise<EmployeeCtx | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, employee_code, full_name_en, owner_company_id")
    .eq("id", employeeId)
    .single();
  return data ?? null;
}

/**
 * Load minimal employee context using the admin Supabase client (bypasses RLS).
 * Use in server actions that already have an admin client available, or where
 * the operation requires bypassing RLS (e.g. audit logging).
 */
export async function getEmployeeCtxAdmin(employeeId: number): Promise<EmployeeCtx | null> {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("employees")
    .select("id, employee_code, full_name_en, owner_company_id")
    .eq("id", employeeId)
    .single();
  return data ?? null;
}
