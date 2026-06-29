import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { RequisitionsPageClient } from "@/features/hr/recruitment/requisitions-page-client";

export default async function RequisitionsPage() {
  const ctx = await getAuthContext();
  const canView = hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage") || ctx.roleCodes?.includes("system_admin");
  if (!canView) redirect("/access-denied");
  return <RequisitionsPageClient authContext={ctx} />;
}

