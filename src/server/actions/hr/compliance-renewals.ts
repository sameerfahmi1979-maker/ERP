"use server";

import { z } from "zod";
import { employeeId } from "@/lib/hr/employee-contract";
import { complianceDmsRenewal } from "@/lib/hr/compliance/renewal-review";
import { getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";

export async function readComplianceDmsRenewals(employee: number) {
  try {
    const context = await getAuthContext();
    if (!employeeId.safeParse(employee).success || !context.profile || !context.isAccountActive || context.profile.must_change_password) {
      return { error: "Current employee access is unavailable." };
    }
    const db = await createClient();
    const result = await db.rpc("hr_compliance_current_dms_renewals", { p_employee: employee });
    const parsed = z.array(complianceDmsRenewal).safeParse(result.data);
    if (!result.error && parsed.success) return { data: parsed.data };
  } catch {
    // Keep the original HR fields visible and let the user retry the renewal read.
  }
  return { error: "Could not load DMS renewals." };
}
