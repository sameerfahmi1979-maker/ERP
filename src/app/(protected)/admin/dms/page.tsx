import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getDmsAdminOverviewStats } from "@/server/actions/dms/overview";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsOverviewClient } from "@/features/dms/admin/dms-overview-client";
import { FolderOpen } from "lucide-react";

export const metadata = {
  title: "DMS Admin | ERP",
  description: "Document Management System — Admin Overview",
};

export default async function DmsAdminPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
    redirect("/access-denied");
  }

  const result = await getDmsAdminOverviewStats();

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="DMS Admin"
        description="Document Management System — master data overview and quick management"
        breadcrumbs={[
          { label: "Admin", href: "/dashboard" },
          { label: "DMS Admin" },
        ]}
      />

      <Suspense fallback={<div className="text-sm text-muted-foreground py-8 text-center">Loading stats...</div>}>
        {result.success && result.data ? (
          <DmsOverviewClient stats={result.data} />
        ) : (
          <div className="text-center py-8 text-destructive text-sm">
            Failed to load DMS overview: {result.error}
          </div>
        )}
      </Suspense>
    </div>
  );
}
