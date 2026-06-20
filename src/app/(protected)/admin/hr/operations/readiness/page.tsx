import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { HrReadinessPageClient } from "@/features/hr/operations/readiness/hr-readiness-page-client";

export const dynamic = "force-dynamic";

export default async function HrReadinessPage() {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    redirect("/admin");
  }
  return <HrReadinessPageClient />;
}
