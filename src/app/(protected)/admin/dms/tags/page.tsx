import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getDmsTags } from "@/server/actions/dms/tags";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsTagsTable } from "@/features/dms/admin/dms-tags-table";

export const metadata = {
  title: "Tags | DMS Admin | ERP",
  description: "Manage DMS document tags for categorization and filtering",
};

async function TagsContent({ authContext }: { authContext: AuthContext }) {
  const result = await getDmsTags();
  if (!result.success || !result.data) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Failed to load tags</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }
  return <DmsTagsTable rows={result.data} authContext={authContext} />;
}

export default async function DmsTagsPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
    redirect("/dashboard");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Tags"
        description="Manage color-coded tags for categorizing and filtering DMS documents"
        breadcrumbs={[
          { label: "Admin", href: "/dashboard" },
          { label: "DMS Admin", href: "/admin/dms" },
          { label: "Tags" },
        ]}
      />
      <Suspense fallback={<div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>}>
        <TagsContent authContext={ctx} />
      </Suspense>
    </div>
  );
}
