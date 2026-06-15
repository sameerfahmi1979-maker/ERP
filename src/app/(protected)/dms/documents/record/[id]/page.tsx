import { redirect, notFound } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getDmsDocumentRecordData, getDmsNewDocumentDefaults } from "@/server/actions/dms/documents";
import { DmsDocumentRecordForm } from "@/features/dms/documents/dms-document-record-form";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function DmsDocumentRecordPage({ params, searchParams }: Props) {
  const { id: idStr } = await params;
  const { mode: modeParam } = await searchParams;

  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "dms.documents.view") && !hasPermission(authContext, "dms.admin")) {
    redirect("/dashboard");
  }

  const [docResult, defaultsResult] = await Promise.all([
    getDmsDocumentRecordData(id),
    getDmsNewDocumentDefaults(),
  ]);

  if (!docResult.success || !docResult.data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p className="text-lg font-medium">Document not found</p>
        <p className="text-sm">The document with ID {idStr} does not exist or you do not have access.</p>
        <Link href="/dms/documents" className="text-sm underline text-primary">
          Back to All Documents
        </Link>
      </div>
    );
  }

  const canEdit = hasPermission(authContext, "dms.documents.edit") || hasPermission(authContext, "dms.admin");
  let resolvedMode: "edit" | "view" = "view";
  if (modeParam === "edit" && canEdit) {
    resolvedMode = "edit";
  }

  const documentTypes = defaultsResult.data?.documentTypes ?? [];
  const categories = defaultsResult.data?.categories ?? [];

  return (
    <div className="h-full">
      <DmsDocumentRecordForm
        doc={docResult.data}
        mode={resolvedMode}
        authContext={authContext}
        documentTypes={documentTypes}
        categories={categories}
      />
    </div>
  );
}
