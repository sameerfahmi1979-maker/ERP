import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { HrBlocksPageClient } from "@/features/hr/operations/blocks/hr-blocks-page-client";

export const dynamic = "force-dynamic";

export default async function HrBlocksPage() {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    redirect("/access-denied");
  }
  const canManage = hasPermission(ctx, "hr.assignments.manage");
  return <HrBlocksPageClient canManage={canManage} />;
}

