import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { LoadError } from "@/components/erp/load-error";
import { Button } from "@/components/ui/button";
import { Briefcase, Plus } from "lucide-react";
import { listDesignations } from "@/server/actions/common-master-data/designations";
import Link from "next/link";
import { DesignationsListClient } from "@/features/common-master-data/designations/designations-list-client";

export default async function DesignationsPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.view") && !hasPermission(ctx, "common_md.designations.view")) {
    redirect("/access-denied");
  }
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.designations.manage");
  let result: Awaited<ReturnType<typeof listDesignations>> | undefined;
  try {
    result = await listDesignations({});
  } catch {
    return <LoadError title="Designations" retryHref="/admin/common-master-data/designations" />;
  }
  if (result?.kind === "forbidden") redirect("/access-denied");
  if (!result?.success || !Array.isArray(result.data)) {
    return <LoadError title="Designations" retryHref="/admin/common-master-data/designations" />;
  }
  const designations = result.data;

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Designations"
        description="Job titles and authority levels"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Common Master Data", href: "/admin/common-master-data" },
          { label: "Designations" },
        ]}
        actions={canManage ? (
          <Link href="/admin/common-master-data/designations/record/new">
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Designation</Button>
          </Link>
        ) : null}
      />
      {designations.length === 0 ? (
        <ERPEmptyState icon={Briefcase} title="No designations yet" description="Create your first job title." />
      ) : (
        <DesignationsListClient designations={designations} canManage={canManage} />
      )}
    </div>
  );
}
