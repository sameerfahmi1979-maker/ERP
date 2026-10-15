import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { DmsDashboardPageClient } from "@/features/dms/dashboard/dms-dashboard-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsDashboardPage() {
  const authContext = await getAuthContext();

  if (
    !hasPermission(authContext, "dms.documents.view") &&
    !hasPermission(authContext, "dms.admin")
  ) {
    redirect("/access-denied");
  }

  return (
    <div className="p-6 space-y-2">
      {/* One cancellable client read; no duplicate SSR read or retained seed. */}
      <DmsDashboardPageClient authContext={authContext} />
    </div>
  );
}
