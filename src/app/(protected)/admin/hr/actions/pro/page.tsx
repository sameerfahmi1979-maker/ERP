import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { HrProProcessesPageClient } from "@/features/hr/actions/hr-pro-processes-page-client";

export const dynamic = "force-dynamic";

export default async function HrProProcessesPage() {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.actions.view")) {
    redirect("/admin");
  }
  return <HrProProcessesPageClient authContext={ctx} />;
}
