import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { HrEosPageClient } from "@/features/hr/actions/hr-eos-page-client";

export const dynamic = "force-dynamic";

export default async function HrEosPage() {
  const ctx = await getAuthContext();
  if (!ctx || (!hasPermission(ctx, "hr.actions.view") && !hasPermission(ctx, "hr.eos.view"))) {
    redirect("/access-denied");
  }
  return <HrEosPageClient authContext={ctx} />;
}

