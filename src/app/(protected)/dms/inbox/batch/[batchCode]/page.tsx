import { notFound, redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import {
  getDmsUploadBatch,
  getDmsUploadBatchDrafts,
} from "@/server/actions/dms/batch-intake";
import { DmsBatchReviewQueueClient } from "@/features/dms/upload/dms-batch-review-queue-client";
import { ERPPageHeader } from "@/components/erp/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BatchPageProps = {
  params: Promise<{ batchCode: string }>;
};

export default async function DmsBatchReviewPage({ params }: BatchPageProps) {
  const { batchCode } = await params;
  const ctx = await getAuthContext();

  if (
    !hasPermission(ctx, "dms.documents.view") &&
    !hasPermission(ctx, "dms.documents.upload") &&
    !hasPermission(ctx, "dms.admin")
  ) {
    redirect("/dashboard");
  }

  const batchResult = await getDmsUploadBatch(batchCode);
  if (!batchResult.success || !batchResult.data) {
    notFound();
  }
  const batch = batchResult.data;

  const draftsResult = await getDmsUploadBatchDrafts(batch.id);
  const drafts = draftsResult.data ?? [];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Batch Review Queue"
        description="Review each AI-created draft individually and approve one at a time. There is no bulk approval."
        breadcrumbs={[
          { label: "DMS", href: "/dms" },
          { label: "Upload Inbox", href: "/dms/inbox" },
          { label: batch.batch_code },
        ]}
      />

      <DmsBatchReviewQueueClient batch={batch} initialDrafts={drafts} />
    </div>
  );
}
