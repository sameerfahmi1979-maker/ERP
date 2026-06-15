import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getDmsDocuments } from "@/server/actions/dms/documents";
import { getDmsNewDocumentDefaults } from "@/server/actions/dms/documents";
import { DmsDocumentsTable } from "@/features/dms/documents/dms-documents-table";
import { ERPPageHeader } from "@/components/erp/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsDocumentsPage() {
  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "dms.documents.view") && !hasPermission(authContext, "dms.admin")) {
    redirect("/dashboard");
  }

  const [docsResult, defaultsResult] = await Promise.all([
    getDmsDocuments(),
    getDmsNewDocumentDefaults(),
  ]);

  const documents = docsResult.data ?? [];
  const categories = defaultsResult.data?.categories ?? [];
  const documentTypes = defaultsResult.data?.documentTypes ?? [];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="All Documents"
        description="DMS document repository — metadata-only records. File upload enabled in DMS.5."
        breadcrumbs={[{ label: "DMS", href: "/dms" }, { label: "All Documents" }]}
      />

      <DmsDocumentsTable
        initialDocuments={documents}
        categories={categories}
        documentTypes={documentTypes}
      />
    </div>
  );
}
