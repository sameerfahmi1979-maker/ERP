import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listDmsUploadBatches } from "@/server/actions/dms/batch-intake";
import { DmsBatchListClient } from "@/features/dms/upload/dms-batch-list-client";
import { ERPPageHeader } from "@/components/erp/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsBatchListPage() {
  const ctx = await getAuthContext();

  if (
    !hasPermission(ctx, "dms.documents.view") &&
    !hasPermission(ctx, "dms.documents.upload") &&
    !hasPermission(ctx, "dms.admin")
  ) {
    redirect("/dashboard");
  }

  const result = await listDmsUploadBatches();
  const batches = result.data ?? [];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Batch Intake"
        description="All multi-file upload batches. Unfinished batches stay here until every draft is approved or discarded — nothing is lost."
        breadcrumbs={[
          { label: "DMS", href: "/dms" },
          { label: "Upload Inbox", href: "/dms/inbox" },
          { label: "Batch Intake" },
        ]}
      />

      <DmsBatchListClient initialBatches={batches} />
    </div>
  );
}
