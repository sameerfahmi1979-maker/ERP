import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { InterviewsPageClient } from "@/features/hr/recruitment/interviews-page-client";

export default async function InterviewsPage() {
  const ctx = await getAuthContext();
  const canView = hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage") || ctx.roleCodes?.includes("system_admin");
  if (!canView) redirect("/admin");
  return <InterviewsPageClient authContext={ctx} />;
}
