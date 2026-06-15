import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getDmsUploadSessions } from "@/server/actions/dms/upload-sessions";
import { getDmsDocuments, getDmsNewDocumentDefaults } from "@/server/actions/dms/documents";
import { isDmsBatchIntakeEnabled } from "@/server/actions/dms/batch-intake";
import { DmsUploadInboxPageClient } from "@/features/dms/upload/dms-upload-inbox-page-client";
import type { DmsDocumentTypeOption, DmsEntityContext } from "@/features/dms/upload/dms-create-document-from-upload-dialog";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DMS_ENTITY_TYPES } from "@/features/dms/documents/dms-document-constants";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ entity_type?: string; entity_id?: string }>;
}) {
  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "dms.documents.upload") && !hasPermission(authContext, "dms.admin")) {
    if (!hasPermission(authContext, "dms.documents.view")) {
      redirect("/dashboard");
    }
  }

  const params = await searchParams;
  const rawEntityType = params.entity_type;
  const rawEntityId = params.entity_id ? parseInt(params.entity_id, 10) : null;
  const entityContext: DmsEntityContext | null =
    rawEntityType &&
    DMS_ENTITY_TYPES.includes(rawEntityType as typeof DMS_ENTITY_TYPES[number]) &&
    rawEntityId &&
    rawEntityId > 0
      ? { entityType: rawEntityType, entityId: rawEntityId }
      : null;

  const [sessionsResult, documentsResult, defaultsResult, batchEnabled] = await Promise.all([
    getDmsUploadSessions({ include_completed: false }),
    getDmsDocuments(),
    getDmsNewDocumentDefaults(),
    isDmsBatchIntakeEnabled(),
  ]);

  const sessions = sessionsResult.data ?? [];
  const documents = documentsResult.data ?? [];
  const documentTypes = (defaultsResult.data?.documentTypes ?? []) as DmsDocumentTypeOption[];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Upload Inbox"
        description="Upload files to private DMS storage. Attach to existing documents or create new ones."
        breadcrumbs={[{ label: "DMS", href: "/dms" }, { label: "Upload Inbox" }]}
      />

      <DmsUploadInboxPageClient
        initialSessions={sessions}
        documents={documents}
        documentTypes={documentTypes}
        entityContext={entityContext}
        isAdmin={hasPermission(authContext, "dms.admin")}
        batchEnabled={batchEnabled}
      />
    </div>
  );
}
