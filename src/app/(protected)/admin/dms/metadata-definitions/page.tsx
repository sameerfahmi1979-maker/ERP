import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getDmsMetadataDefinitions } from "@/server/actions/dms/metadata-definitions";
import { getDmsDocumentTypes } from "@/server/actions/dms/document-types";
import { getDmsCategories } from "@/server/actions/dms/categories";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsMetadataDefinitionsTable } from "@/features/dms/admin/dms-metadata-definitions-table";

export const metadata = {
  title: "Metadata Definitions | DMS Admin | ERP",
  description: "Manage dynamic metadata field definitions for DMS document types",
};

async function MetadataDefinitionsContent({ authContext }: { authContext: AuthContext }) {
  const [metaResult, typesResult, categoriesResult] = await Promise.all([
    getDmsMetadataDefinitions(),
    getDmsDocumentTypes(),
    getDmsCategories(),
  ]);
  if (!metaResult.success || !metaResult.data) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Failed to load metadata definitions</p>
        <p className="text-sm text-destructive mt-2">{metaResult.error}</p>
      </div>
    );
  }
  return (
    <DmsMetadataDefinitionsTable
      rows={metaResult.data}
      categories={categoriesResult.data ?? []}
      documentTypes={typesResult.data ?? []}
      authContext={authContext}
    />
  );
}

export default async function DmsMetadataDefinitionsPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
    redirect("/access-denied");
  }

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Metadata Definitions"
        description="Define dynamic metadata fields per document type — including AI-extractable fields"
        breadcrumbs={[
          { label: "Admin", href: "/dashboard" },
          { label: "DMS Admin", href: "/admin/dms" },
          { label: "Metadata Definitions" },
        ]}
      />
      <Suspense fallback={<div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>}>
        <MetadataDefinitionsContent authContext={ctx} />
      </Suspense>
    </div>
  );
}
