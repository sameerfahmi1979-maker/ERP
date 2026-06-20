import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { GlobalOnboardingPageClient } from "@/features/hr/recruitment/global-onboarding-page-client";

export default async function GlobalOnboardingPage() {
  const ctx = await getAuthContext();
  const canView = hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage") || ctx.roleCodes?.includes("system_admin");
  if (!canView) redirect("/admin");
  return <GlobalOnboardingPageClient authContext={ctx} />;
}
