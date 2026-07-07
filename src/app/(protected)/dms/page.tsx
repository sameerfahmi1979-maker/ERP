import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getDmsDashboardStats } from "@/server/actions/dms/dashboard";
import { DmsDashboardPageClient } from "@/features/dms/dashboard/dms-dashboard-page-client";
import { ERPPageHeader } from "@/components/erp/page-header";

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

  const statsResult = await getDmsDashboardStats(30);
  const initialStats = statsResult.success && statsResult.data
    ? statsResult.data
    : {
        total_documents: 0,
        added_this_month: 0,
        added_last_month: 0,
        inbox_pending: 0,
        expiring_30_days: 0,
        review_queue_pending: 0,
        storage_bytes: 0,
        documents_by_day: [],
        documents_by_category: [],
        ai_pipeline: [],
        expiry_buckets: [],
        inbox_items: [],
        expiring_items: [],
        renewal_items: [],
      };

  return (
    <div className="p-6 space-y-2">
      <ERPPageHeader
        title="Document Management System"
        description="Live overview of documents, uploads, AI pipeline, and expiry status"
        breadcrumbs={[{ label: "DMS" }]}
      />
      <DmsDashboardPageClient initialStats={initialStats} />
    </div>
  );
}
