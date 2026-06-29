import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { HrAssignmentsPageClient } from "@/features/hr/operations/assignments/hr-assignments-page-client";

export const dynamic = "force-dynamic";

export default async function HrAssignmentsPage() {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    redirect("/access-denied");
  }
  return <HrAssignmentsPageClient />;
}

