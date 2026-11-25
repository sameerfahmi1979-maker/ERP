import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsOverviewClient } from "@/features/dms/admin/dms-overview-client";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getDmsAdminOverviewStats } from "@/server/actions/dms/overview";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const metadata = {
  title: "DMS Admin | ERP",
  description: "Document Management System — Admin Overview",
};

async function OverviewContent() {
  const result = await getDmsAdminOverviewStats();
  return result.success && result.data ? (
    <DmsOverviewClient stats={result.data} />
  ) : (
    <div role="alert" className="text-center py-8 text-destructive text-sm">
      Failed to load DMS overview. Refresh to retry.
    </div>
  );
}

export default async function DmsAdminPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
    redirect("/access-denied");
  }

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
        <OverviewContent />
      </Suspense>
    </div>
  );
}
