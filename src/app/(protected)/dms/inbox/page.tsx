import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

import { getDmsNewDocumentDefaults } from "@/server/actions/dms/documents";
import { isDmsBatchIntakeEnabled } from "@/server/actions/dms/batch-intake";
import { isDmsAiAutoStartEnabled } from "@/server/actions/dms/ai-intake";
import { DmsUploadInboxPageClient } from "@/features/dms/upload/dms-upload-inbox-page-client";
import type { DmsDocumentTypeOption, DmsEntityContext } from "@/features/dms/upload/dms-create-document-from-upload-dialog";
import { ERPPageHeader } from "@/components/erp/page-header";
import {parseDmsUploadContext} from '@/lib/dms/upload-context';
import { DmsLoadError } from "@/features/dms/documents/dms-load-error";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsInboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string,string|string[]|undefined>>;
}) {
  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "dms.documents.upload") && !hasPermission(authContext, "dms.admin")) {
    if (!hasPermission(authContext, "dms.documents.view")) {
      redirect("/access-denied");
    }
  }

  const params = await searchParams;
  const parsedContext=parseDmsUploadContext(params);
  if(!parsedContext.success)return <div role="alert" className="p-6">This upload link has an invalid, conflicting or unsupported subject. Return to the original record and open its Documents section. No unlinked upload was substituted.</div>;
  const entityContext:DmsEntityContext|null=parsedContext.context;

  const [defaultsResult, batchEnabled, autoStartEnabled] = await Promise.all([
    getDmsNewDocumentDefaults(),
    isDmsBatchIntakeEnabled(),
    isDmsAiAutoStartEnabled(),
  ]);

  const documentTypes = (defaultsResult.data?.documentTypes ?? []) as DmsDocumentTypeOption[];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Upload Inbox"
        description="Upload files to private DMS storage. Attach to existing documents or create new ones."
        breadcrumbs={[{ label: "DMS", href: "/dms" }, { label: "Upload Inbox" }]}
      />

      {!defaultsResult.success ? <DmsLoadError /> : <DmsUploadInboxPageClient
        initialSessions={[]}
        documents={[]}
        documentTypes={documentTypes}
        entityContext={entityContext}
        isAdmin={hasPermission(authContext, "dms.admin")}
        batchEnabled={batchEnabled}
        autoStartEnabled={autoStartEnabled}
      />}
    </div>
  );
}
