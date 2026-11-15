import { CatalogueControls } from "@/features/common-master-data/catalogue-controls";
import { catalogueCriteria } from "@/lib/master-data/catalogue-page";
import { getAuthContext, hasGlobalPermission, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { LoadError } from "@/components/erp/load-error";
import { Button } from "@/components/ui/button";
import { Briefcase, Plus } from "lucide-react";
import { listDesignations } from "@/server/actions/common-master-data/designations";
import Link from "next/link";
import { DesignationsListClient } from "@/features/common-master-data/designations/designations-list-client";

const BASE = "/admin/common-master-data/designations";
export default async function DesignationsPage({ searchParams }: { searchParams?: Promise<{ page?: string; q?: string }> }) {
  const ctx = await getAuthContext();
  let query;
  try { query = catalogueCriteria(await searchParams ?? {}); } catch { return <LoadError title="Catalogue" retryHref={BASE} />; }
  if (!hasPermission(ctx, "common_md.view") && !hasPermission(ctx, "common_md.designations.view")) {
    redirect("/access-denied");
  }
  const canManage = hasGlobalPermission(ctx, "common_md.manage") || hasGlobalPermission(ctx, "common_md.designations.manage");
  let result: Awaited<ReturnType<typeof listDesignations>> | undefined;
  try {
    result = await listDesignations(query);
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
      <CatalogueControls base={BASE} page={query.page} search={query.search} total={result.totalCount} />
      {designations.length === 0 ? (
        <ERPEmptyState icon={Briefcase} title="No designations match this page" description="Change the search or return to the first page." />
      ) : (
        <DesignationsListClient designations={designations} canManage={canManage} />
      )}
    </div>
  );
}
