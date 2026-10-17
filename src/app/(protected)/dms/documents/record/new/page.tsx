import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getDmsNewDocumentDefaults,prepareDmsManualOrigin } from "@/server/actions/dms/documents";
import { DmsDocumentRecordForm, type DmsEntityContext } from "@/features/dms/documents/dms-document-record-form";
import {parseDmsUploadContext} from '@/lib/dms/upload-context';

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsDocumentNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string,string|string[]|undefined>>;
}) {
  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "dms.documents.view") && !hasPermission(authContext, "dms.admin")) {
    redirect("/access-denied");
  }

  if (!hasPermission(authContext, "dms.documents.upload") && !hasPermission(authContext, "dms.admin")) {
    redirect("/dms/documents");
  }

  const params = await searchParams;
  const parsedContext=parseDmsUploadContext(params);
  if(!parsedContext.success)return <div role="alert" className="p-6">This document link has an invalid, conflicting or unsupported subject. Return to the original record. No unlinked document was substituted.</div>;
  let entityContext:DmsEntityContext|null=parsedContext.context;
  if(entityContext){
    const origin=await prepareDmsManualOrigin(entityContext);
    if(!origin.success||!origin.data)return <div role="alert" className="p-6">{origin.error??'Original subject unavailable. No unlinked document was substituted.'}</div>;
    // A Party is global master data; its document scope remains an explicit
    // form choice, never a company/branch guessed from the Party or profile.
    if(entityContext.entityType!=='party')entityContext={...entityContext,scope:origin.data};
  }

  const defaultsResult = await getDmsNewDocumentDefaults();
  const documentTypes = defaultsResult.data?.documentTypes ?? [];
  const categories = defaultsResult.data?.categories ?? [];

  return (
    <div className="h-full">
      <DmsDocumentRecordForm
        mode="add"
        authContext={authContext}
        documentTypes={documentTypes}
        categories={categories}
        entityContext={entityContext}
      />
    </div>
  );
}
