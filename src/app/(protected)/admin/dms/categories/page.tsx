import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getDmsCategories } from "@/server/actions/dms/categories";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsCategoriesTable } from "@/features/dms/admin/dms-categories-table";

export const metadata = {
  title: "Document Categories | DMS Admin | ERP",
  description: "Manage DMS document categories",
};

async function CategoriesContent({ authContext }: { authContext: AuthContext }) {
  const result = await getDmsCategories();
  if (!result.success || !result.data) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Failed to load categories</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }
  return <DmsCategoriesTable rows={result.data} authContext={authContext} />;
}

export default async function DmsCategoriesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
    redirect("/dashboard");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Document Categories"
        description="Organize document types into logical groups for the DMS"
        breadcrumbs={[
          { label: "Admin", href: "/dashboard" },
          { label: "DMS Admin", href: "/admin/dms" },
          { label: "Document Categories" },
        ]}
      />
      <Suspense fallback={<div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>}>
        <CategoriesContent authContext={ctx} />
      </Suspense>
    </div>
  );
}
