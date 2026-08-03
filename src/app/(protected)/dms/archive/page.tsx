import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, isGlobalAdmin } from "@/lib/rbac/check";
import { getArchivedDocuments, getDmsNewDocumentDefaults } from "@/server/actions/dms/documents";
import { DmsArchiveTable } from "@/features/dms/archive/dms-archive-table";
import { ERPPageHeader } from "@/components/erp/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsArchivePage() {
  const authContext = await getAuthContext();

  if (
    !hasPermission(authContext, "dms.documents.view") &&
    !hasPermission(authContext, "dms.admin")
  ) {
    redirect("/access-denied");
  }

  const [docsResult, defaultsResult] = await Promise.all([
    getArchivedDocuments(),
    getDmsNewDocumentDefaults(),
  ]);

  const documents = docsResult.data ?? [];
  const categories = defaultsResult.data?.categories ?? [];
  const documentTypes = defaultsResult.data?.documentTypes ?? [];

  const canUnarchive =
    hasPermission(authContext, "dms.documents.archive") ||
    hasPermission(authContext, "dms.admin") ||
    isGlobalAdmin(authContext);

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Document Archive"
        description="All manually archived documents and documents superseded by renewal. Renewed documents show a link to their replacement."
        breadcrumbs={[{ label: "DMS", href: "/dms" }, { label: "Archive" }]}
      />

      <DmsArchiveTable
        initialDocuments={documents}
        categories={categories}
        documentTypes={documentTypes}
        canUnarchive={canUnarchive}
      />
    </div>
  );
}
