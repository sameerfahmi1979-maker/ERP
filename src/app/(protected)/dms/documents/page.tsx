import { redirect } from "next/navigation";
import { getReadAuthContext } from "@/server/reads/read-context";
import { readScopeVersion } from "@/lib/reads/scope-version";
import { hasPermission, isGlobalAdmin } from "@/lib/rbac/check";
import { readDmsDocumentPage } from "@/server/reads/dms-documents";
import { readDmsListChoices } from "@/server/reads/dms-list-choices";
import { DmsDocumentsTable } from "@/features/dms/documents/dms-documents-table";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsLoadError } from "@/features/dms/documents/dms-load-error";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsDocumentsPage() {
  const authContext = await getReadAuthContext();

  if (!hasPermission(authContext, "dms.documents.view") && !hasPermission(authContext, "dms.admin")) {
    redirect("/access-denied");
  }

  const [docsResult, defaultsResult] = await Promise.all([
    // DMS ARCHIVE.1 — exclude archived/superseded; they live in /dms/archive
    readDmsDocumentPage({ filters:{excludeArchived:true} },authContext),
    readDmsListChoices(authContext),
  ]);

  const documents = docsResult.data?.rows ?? [];
  const categories = defaultsResult.data?.categories ?? [];
  const documentTypes = defaultsResult.data?.documentTypes ?? [];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="All Documents"
        description="Browse, search, and manage all DMS documents."
        breadcrumbs={[{ label: "DMS", href: "/dms" }, { label: "All Documents" }]}
      />

      {!docsResult.success || !defaultsResult.success ? <DmsLoadError /> : <DmsDocumentsTable
        initialSeed={docsResult.data && authContext.profile?.auth_user_id ? {
          identity:{authUserId:authContext.profile.auth_user_id,scopeVersion:readScopeVersion(authContext)},
          params:{page:1,pageSize:25,sortKey:"created_at",sortDir:"desc",filters:{excludeArchived:true}},
          data:docsResult.data,updatedAt:docsResult.data.updatedAt,
        } : undefined}
        initialDocuments={documents}
        initialTotal={docsResult.data?.totalCount??0}
        initialUpdatedAt={docsResult.data?.updatedAt??0}
        categories={categories}
        documentTypes={documentTypes}
        canCreate={hasPermission(authContext, "dms.documents.upload") || hasPermission(authContext, "dms.admin")}
        canEdit={hasPermission(authContext, "dms.documents.edit") || hasPermission(authContext, "dms.admin")}
        canArchive={hasPermission(authContext, "dms.documents.archive") || hasPermission(authContext, "dms.admin")}
        canHardDelete={isGlobalAdmin(authContext)}
      />}
    </div>
  );
}
