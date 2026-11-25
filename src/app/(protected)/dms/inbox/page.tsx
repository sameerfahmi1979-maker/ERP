import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

import { isDmsBatchIntakeEnabled, findDmsBatchAdmission } from "@/server/actions/dms/batch-intake";
import { isDmsAiAutoStartEnabled } from "@/server/actions/dms/ai-intake";
import { DmsUploadInboxPageClient } from "@/features/dms/upload/dms-upload-inbox-page-client";
import type { DmsEntityContext } from "@/features/dms/upload/dms-create-document-from-upload-dialog";
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

  const canViewInbox = hasPermission(authContext, "dms.documents.view") || hasPermission(authContext, "dms.admin");
  if (!canViewInbox && !hasPermission(authContext, "dms.documents.upload")) {
    redirect("/access-denied");
  }

  const params = await searchParams;
  const parsedContext=parseDmsUploadContext(params);
  if(!parsedContext.success)return <div role="alert" className="p-6">This upload link has an invalid, conflicting or unsupported subject. Return to the original record and open its Documents section. No unlinked upload was substituted.</div>;
  const recoverCode=params.recoverBatch;
  const recovery=typeof recoverCode==='string'?await findDmsBatchAdmission(recoverCode):undefined;
  if(recoverCode!==undefined&&(!recovery?.success||recovery.receipts.length!==1))return <div role="alert" className="p-6">The original batch or its current access is unavailable. No replacement batch was created.</div>;
  const recoveryReceipt=recovery?.success?recovery.receipts[0]:undefined;
  const originalContext=recoveryReceipt?.manifest.context;
  if(recoveryReceipt&&parsedContext.context&&JSON.stringify({type:parsedContext.context.entityType,id:parsedContext.context.entityId})!==JSON.stringify(originalContext))return <div role="alert" className="p-6">This recovery link conflicts with the original batch subject. No replacement was created.</div>;
  const entityContext:DmsEntityContext|null=originalContext?{entityType:originalContext.type,entityId:originalContext.id}:parsedContext.context;

  const [batchEnabled, autoStartEnabled] = await Promise.all([
    isDmsBatchIntakeEnabled(),
    isDmsAiAutoStartEnabled(),
  ]);


  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Upload Inbox"
        description="Upload files to private DMS storage. Attach to existing documents or create new ones."
        breadcrumbs={[{ label: "DMS", href: "/dms" }, { label: "Upload Inbox" }]}
      />

      {!canViewInbox ? <DmsLoadError /> : <DmsUploadInboxPageClient
        key={recoveryReceipt?.operation_id??'inbox'}
        initialSessions={[]}
        documents={[]}
        entityContext={entityContext}
        isAdmin={hasPermission(authContext, "dms.admin")}
        batchEnabled={batchEnabled}
        autoStartEnabled={autoStartEnabled}
        recoveryReceipt={recoveryReceipt}
      />}
    </div>
  );
}
