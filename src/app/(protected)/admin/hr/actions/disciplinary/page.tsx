import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { HrDisciplinaryPageClient } from "@/features/hr/actions/hr-disciplinary-page-client";

export const dynamic = "force-dynamic";

export default async function HrDisciplinaryPage() {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.actions.view")) {
    redirect("/access-denied");
  }
  return <HrDisciplinaryPageClient authContext={ctx} />;
}

