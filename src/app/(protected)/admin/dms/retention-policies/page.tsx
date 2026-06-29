import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getDmsRetentionPolicies } from "@/server/actions/dms/retention-policies";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsRetentionPoliciesTable } from "@/features/dms/admin/dms-retention-policies-table";

export const metadata = {
  title: "Retention Policies | DMS Admin | ERP",
  description: "Manage DMS document retention policies and expiry actions",
};

async function RetentionPoliciesContent({ authContext }: { authContext: AuthContext }) {
  const result = await getDmsRetentionPolicies();
  if (!result.success || !result.data) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Failed to load retention policies</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }
  return <DmsRetentionPoliciesTable rows={result.data} authContext={authContext} />;
}

export default async function DmsRetentionPoliciesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
    redirect("/access-denied");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Retention Policies"
        description="Define document retention rules and automated actions on policy expiry"
        breadcrumbs={[
          { label: "Admin", href: "/dashboard" },
          { label: "DMS Admin", href: "/admin/dms" },
          { label: "Retention Policies" },
        ]}
      />
      <Suspense fallback={<div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>}>
        <RetentionPoliciesContent authContext={ctx} />
      </Suspense>
    </div>
  );
}
