import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { HrApprovalsPageClient } from "@/features/hr/actions/hr-approvals-page-client";

export const dynamic = "force-dynamic";

export default async function HrApprovalsPage() {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.actions.view")) {
    redirect("/access-denied");
  }
  return <HrApprovalsPageClient authContext={ctx} />;
}

