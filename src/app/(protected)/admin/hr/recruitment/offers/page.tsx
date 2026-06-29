import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { OffersPageClient } from "@/features/hr/recruitment/offers-page-client";

export default async function OffersPage() {
  const ctx = await getAuthContext();
  const canView = hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage") || ctx.roleCodes?.includes("system_admin");
  if (!canView) redirect("/access-denied");
  return <OffersPageClient authContext={ctx} />;
}

