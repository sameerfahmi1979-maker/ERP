"use server";

import { z } from "zod";
import { employeeDate, employeeId } from "@/lib/hr/employee-contract";
import { getAuthContext } from "@/lib/rbac/check";
import { canUseApplication } from "@/lib/rbac/scope";
import { createClient } from "@/lib/supabase/server";

const employmentPeriod = z.object({
  status: z.literal("resolved"), employee_id: employeeId, period_id: employeeId,
  company_id: employeeId, branch_id: employeeId.nullable(),
  contractual_start: employeeDate, actual_start: employeeDate,
  effective_from: employeeDate, effective_until: employeeDate.nullable(),
  source_revision: z.string().regex(/^[1-9]\d*$/),
}).strict();
const employmentResult = z.discriminatedUnion("status", [
  employmentPeriod,
  z.object({ status: z.literal("unresolved") }).strict(),
]);

export async function readEmploymentAsOf(employeeIdInput: number, workDate: string) {
  const unavailable = { status: "unavailable" } as const;
  if (!employeeId.safeParse(employeeIdInput).success || !employeeDate.safeParse(workDate).success) return unavailable;
  try {
    if (!canUseApplication(await getAuthContext())) return unavailable;
    const db = await createClient();
    const response = await db.rpc("t03_employment_as_of", { p_employee: employeeIdInput, p_work_date: workDate });
    const result = employmentResult.safeParse(response.data);
    if (response.error || !result.success) return unavailable;
    if (result.data.status === "resolved" && (result.data.employee_id !== employeeIdInput
        || result.data.effective_from > workDate
        || (result.data.effective_until !== null && result.data.effective_until <= workDate))) return unavailable;
    return result.data;
  } catch {
    return unavailable;
  }
}
