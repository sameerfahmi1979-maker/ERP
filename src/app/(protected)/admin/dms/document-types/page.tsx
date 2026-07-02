import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getDmsDocumentTypes } from "@/server/actions/dms/document-types";
import { getDmsCategories } from "@/server/actions/dms/categories";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsDocumentTypesTable } from "@/features/dms/admin/dms-document-types-table";

export const metadata = {
  title: "Document Types | DMS Admin | ERP",
  description: "Manage DMS document types — the future source of truth for all ERP document types",
};

async function DocumentTypesContent({ authContext }: { authContext: AuthContext }) {
  const [typesResult, categoriesResult] = await Promise.all([
    getDmsDocumentTypes(),
    getDmsCategories(),
  ]);
  if (!typesResult.success || !typesResult.data) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Failed to load document types</p>
        <p className="text-sm text-destructive mt-2">{typesResult.error}</p>
      </div>
    );
  }
  return (
    <DmsDocumentTypesTable
      rows={typesResult.data}
      categories={categoriesResult.data ?? []}
      authContext={authContext}
    />
  );
}

export default async function DmsDocumentTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
    redirect("/access-denied");
  }

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Document Types"

        breadcrumbs={[
          { label: "Admin", href: "/dashboard" },
          { label: "DMS Admin", href: "/admin/dms" },
          { label: "Document Types" },
        ]}
      />
      <Suspense fallback={<div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>}>
        <DocumentTypesContent authContext={ctx} />
      </Suspense>
    </div>
  );
}
