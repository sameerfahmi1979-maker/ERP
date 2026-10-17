import { redirect } from "next/navigation";
import { getReadAuthContext } from "@/server/reads/read-context";
import { readScopeVersion } from "@/lib/reads/scope-version";
import { hasPermission, isGlobalAdmin } from "@/lib/rbac/check";
import { readDmsListChoices } from "@/server/reads/dms-list-choices";
import { readDmsArchivePage } from "@/server/reads/dms-archive";
import { DmsArchiveTable } from "@/features/dms/archive/dms-archive-table";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsLoadError } from "@/features/dms/documents/dms-load-error";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsArchivePage() {
  const authContext = await getReadAuthContext();

  if (
    !hasPermission(authContext, "dms.documents.view") &&
    !hasPermission(authContext, "dms.admin")
  ) {
    redirect("/access-denied");
  }

  const [docsResult, defaultsResult] = await Promise.all([
    readDmsArchivePage({},authContext),
    readDmsListChoices(authContext),
  ]);

  const documents = docsResult.data?.rows ?? [];
  const categories = defaultsResult.data?.categories ?? [];
  const documentTypes = defaultsResult.data?.documentTypes ?? [];

  const canUnarchive =
    hasPermission(authContext, "dms.documents.archive") ||
    hasPermission(authContext, "dms.admin") ||
    isGlobalAdmin(authContext);

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Document Archive"
        description="All manually archived documents and documents superseded by renewal. Renewed documents show a link to their replacement."
        breadcrumbs={[{ label: "DMS", href: "/dms" }, { label: "Archive" }]}
      />

      {!docsResult.success || !defaultsResult.success ? <DmsLoadError /> : <DmsArchiveTable
        initialSeed={docsResult.data && authContext.profile?.auth_user_id ? {
          identity:{authUserId:authContext.profile.auth_user_id,scopeVersion:readScopeVersion(authContext)},
          params:{page:1,pageSize:25,sortKey:"updated_at",sortDir:"desc",search:"",columnFilters:{}},
          data:docsResult.data,updatedAt:docsResult.data.updatedAt,
        } : undefined}
        initialDocuments={documents}
        initialTotal={docsResult.data?.totalCount??0}
        initialUpdatedAt={docsResult.data?.updatedAt??0}
        categories={categories}
        documentTypes={documentTypes}
        canUnarchive={canUnarchive}
      />}
    </div>
  );
}
