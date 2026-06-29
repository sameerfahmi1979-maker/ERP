import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getDmsReviewQueueItems, getDmsReviewQueueCounts } from "@/server/actions/dms/review-queue";
import { isDmsAiReviewEnabled } from "@/lib/dms/review-queue/review-queue-upsert";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsReviewQueuePageClient } from "@/features/dms/review-queue/dms-review-queue-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsReviewQueuePage() {
  const authContext = await getAuthContext();

  const canView =
    hasPermission(authContext, "dms.review_queue.view") ||
    hasPermission(authContext, "dms.review_queue.manage") ||
    hasPermission(authContext, "dms.documents.review_ai") ||
    hasPermission(authContext, "dms.admin") ||
    authContext.roleCodes.includes("system_admin");

  if (!canView) {
    redirect("/access-denied");
  }

  const reviewEnabled = await isDmsAiReviewEnabled();

  if (!reviewEnabled) {
    return (
      <div className="p-6 space-y-4">
        <ERPPageHeader
          title="DMS Review Queue"
          description="AI-powered document review queue."
          breadcrumbs={[{ label: "DMS", href: "/dms" }, { label: "Review Queue" }]}
        />
        <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          <p className="font-semibold">DMS Review Queue is not enabled.</p>
          <p className="mt-1">
            Set <code className="bg-amber-100 px-1 rounded text-xs">DMS_AI_REVIEW = true</code> in the AI Feature Flags admin to activate this feature.
          </p>
        </div>
      </div>
    );
  }

  const [itemsResult, countsResult] = await Promise.all([
    getDmsReviewQueueItems({ pageSize: 25 }),
    getDmsReviewQueueCounts(),
  ]);

  const canAdmin =
    hasPermission(authContext, "dms.review_queue.admin") ||
    hasPermission(authContext, "dms.admin") ||
    authContext.roleCodes.includes("system_admin");

  const canManage =
    hasPermission(authContext, "dms.review_queue.manage") ||
    hasPermission(authContext, "dms.documents.review_ai") ||
    hasPermission(authContext, "dms.admin") ||
    authContext.roleCodes.includes("system_admin");

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="DMS Review Queue"

        breadcrumbs={[{ label: "DMS", href: "/dms" }, { label: "Review Queue" }]}
      />

      <DmsReviewQueuePageClient
        initialItems={itemsResult.data?.items ?? []}
        initialTotal={itemsResult.data?.total ?? 0}
        initialCounts={countsResult.data ?? null}
        canManage={canManage}
        canAdmin={canAdmin}
      />
    </div>
  );
}
