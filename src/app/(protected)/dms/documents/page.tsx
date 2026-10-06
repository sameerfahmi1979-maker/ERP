import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, isGlobalAdmin } from "@/lib/rbac/check";
import { readDmsDocumentPage } from "@/server/reads/dms-documents";
import { readDmsListChoices } from "@/server/reads/dms-list-choices";
import { DmsDocumentsTable } from "@/features/dms/documents/dms-documents-table";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsLoadError } from "@/features/dms/documents/dms-load-error";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsDocumentsPage() {
  const authContext = await getAuthContext();

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
        initialDocuments={documents}
        initialTotal={docsResult.data?.totalCount??0}
        initialUpdatedAt={docsResult.data?.updatedAt??0}
        categories={categories}
        documentTypes={documentTypes}
        canHardDelete={isGlobalAdmin(authContext)}
      />}
    </div>
  );
}
