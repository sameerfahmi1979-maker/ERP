import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { CandidatesPageClient } from "@/features/hr/recruitment/candidates-page-client";

export default async function CandidatesPage() {
  const ctx = await getAuthContext();
  const canView = hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage") || ctx.roleCodes?.includes("system_admin");
  if (!canView) redirect("/admin");
  return <CandidatesPageClient authContext={ctx} />;
}
