import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getDmsBrowserDocumentTypes } from "@/server/actions/dms/browser";
import { DmsBrowserPageClient } from "@/features/dms/browser/dms-browser-page-client";

export const dynamic = "force-dynamic";

export default async function DmsBrowserPage() {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "dms.documents.view") &&
    !hasPermission(ctx, "dms.admin") &&
    !ctx.roleCodes.includes("system_admin")
  ) {
    redirect("/access-denied");
  }

  const docTypes = await getDmsBrowserDocumentTypes();

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Document Browser</h1>
        <p className="text-sm text-muted-foreground">
          Smart search across all DMS documents — by name, number, type, or content.
        </p>
      </div>

      <DmsBrowserPageClient docTypes={docTypes} />
    </div>
  );
}
