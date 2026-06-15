import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getDmsNewDocumentDefaults } from "@/server/actions/dms/documents";
import { DmsDocumentRecordForm, type DmsEntityContext } from "@/features/dms/documents/dms-document-record-form";
import { DMS_ENTITY_TYPES } from "@/features/dms/documents/dms-document-constants";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsDocumentNewPage({
  searchParams,
}: {
  searchParams: Promise<{ entity_type?: string; entity_id?: string; mode?: string }>;
}) {
  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "dms.documents.view") && !hasPermission(authContext, "dms.admin")) {
    redirect("/dashboard");
  }

  if (!hasPermission(authContext, "dms.documents.upload") && !hasPermission(authContext, "dms.admin")) {
    redirect("/dms/documents");
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

  const defaultsResult = await getDmsNewDocumentDefaults();
  const documentTypes = defaultsResult.data?.documentTypes ?? [];
  const categories = defaultsResult.data?.categories ?? [];

  return (
    <div className="h-full">
      <DmsDocumentRecordForm
        mode="add"
        authContext={authContext}
        documentTypes={documentTypes}
        categories={categories}
        entityContext={entityContext}
      />
    </div>
  );
}
