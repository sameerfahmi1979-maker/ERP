import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Briefcase, Plus } from "lucide-react";
import { listDesignations } from "@/server/actions/common-master-data/designations";
import Link from "next/link";
import { DesignationsListClient } from "@/features/common-master-data/designations/designations-list-client";

export default async function DesignationsPage() {
  const ctx = await getAuthContext();
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.designations.manage");
  const result = await listDesignations({});
  const designations = result.data ?? [];

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
