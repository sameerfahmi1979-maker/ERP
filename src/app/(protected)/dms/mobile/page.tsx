import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getReadAuthContext } from "@/server/reads/read-context";
import { hasPermission } from "@/lib/rbac/check";
import { readDmsDocumentPage } from "@/server/reads/dms-documents";
import { readDmsListChoices } from "@/server/reads/dms-list-choices";
import { parseDmsUploadContext } from "@/lib/dms/upload-context";
import { MobileDmsCapture } from "@/features/dms/mobile/mobile-dms-capture";
import { MobileDmsInstall } from "@/features/dms/mobile/mobile-dms-install";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mobile DMS", manifest: "/mobile-dms.webmanifest" };

export default async function MobileDmsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [auth, params] = await Promise.all([getReadAuthContext(), searchParams]);
  const allowed = (permission: string) => hasPermission(auth, permission) || hasPermission(auth, "dms.admin");
  const browse = allowed("dms.documents.view");
  const upload = allowed("dms.documents.upload");
  const canStartAi = upload && allowed("dms.documents.review_ai") && allowed("dms.documents.preview");
  const review = ["dms.documents.review_ai", "dms.review_queue.view", "dms.review_queue.manage"].some(allowed);
  const user = auth.profile?.auth_user_id;
  if (!user || (!browse && !upload && !review)) redirect("/access-denied");

  const context = parseDmsUploadContext(params);
  const capture = upload && (params.tab === "capture" || !context.success || !!context.context || !browse);
  const captureParams = new URLSearchParams({ tab: "capture" });
  if (context.success && context.context) {
    captureParams.set("entityType", context.context.entityType);
    captureParams.set("entityId", String(context.context.entityId));
  }
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const type = Number(params.type);
  const typeId = typeof params.type === "string" && Number.isSafeInteger(type) && type > 0 ? type : undefined;
  const page = Math.max(1, Math.min(100000, Number.parseInt(String(params.page), 10) || 1));
  const [documents, choices] = browse && !capture ? await Promise.all([
    readDmsDocumentPage({ page, pageSize: 20, filters: { search, document_type_id: typeId, excludeArchived: true } }, auth),
    readDmsListChoices(auth),
  ]) : [null, null];
  const pageLink = (number: number) => `/dms/mobile?${new URLSearchParams({ q: search, ...(typeId ? { type: String(typeId) } : {}), page: String(number) })}`;

  return <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-5">
    <h1 className="text-2xl font-semibold">Mobile DMS</h1>
    <nav aria-label="Mobile DMS" className="flex flex-wrap gap-2 [&_a]:min-h-11">
      {browse && <Button nativeButton={false} variant={capture ? "outline" : "default"} render={<Link href="/dms/mobile" />}>Documents</Button>}
      {upload && context.success && <Button nativeButton={false} variant={capture ? "default" : "outline"} render={<Link href={`/dms/mobile?${captureParams}`} />}>Capture</Button>}
      {upload && <Button nativeButton={false} variant="outline" render={<Link href="/dms/inbox" />}>Uploads</Button>}
      {review && <Button nativeButton={false} variant="outline" render={<Link href="/dms/review-queue" />}>AI review</Button>}
    </nav>
    <MobileDmsInstall />
    {capture && (context.success
      ? <MobileDmsCapture key={`${user}:${context.context?.entityType}:${context.context?.entityId}`} user={user} context={context.context} canStartAi={canStartAi} />
      : <p role="alert">This record link is invalid. Open Capture again from the original record.</p>)}
    {documents && <section aria-label="Documents" className="space-y-3">
      <form method="get" action="/dms/mobile" className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input name="q" defaultValue={search} maxLength={200} aria-label="Search documents" placeholder="Search documents" className="min-h-11 rounded-md border bg-background px-3 text-base" />
        <select name="type" defaultValue={typeId ?? ""} aria-label="Document type" className="min-h-11 rounded-md border bg-background px-3 text-base">
          <option value="">All document types</option>
          {choices?.data?.documentTypes.map((item) => <option key={item.id} value={item.id}>{item.name_en}</option>)}
        </select>
        <Button type="submit" className="min-h-11">Search</Button>
      </form>
      {!documents.success && <p role="alert">Documents could not be loaded. Try the search again.</p>}
      {choices && !choices.success && <p role="status">Document type filters are temporarily unavailable.</p>}
      {documents.success && documents.data && <>
        {!documents.data.rows.length && <p>No matching documents.</p>}
        <ul className="space-y-2">{documents.data.rows.map((document) => <li key={document.id}>
          <Link className="block rounded-md border p-3 hover:bg-muted focus-visible:outline focus-visible:outline-primary" href={`/dms/documents/record/${document.id}`}>
            <span className="block break-words font-medium">{document.title || document.document_no}</span>
            <span className="block text-sm text-muted-foreground">{document.document_no} · {document.document_type?.name_en ?? document.status}</span>
            {document.expiry_date && <span className="block text-sm">Expiry {document.expiry_date}</span>}
          </Link>
        </li>)}</ul>
        <div className="flex flex-wrap items-center gap-2">
          {page > 1 && <Button nativeButton={false} variant="outline" render={<Link href={pageLink(page - 1)} />}>Previous</Button>}
          {page < 100000 && page * 20 < documents.data.totalCount && <Button nativeButton={false} variant="outline" render={<Link href={pageLink(page + 1)} />}>Next</Button>}
        </div>
      </>}
    </section>}
  </main>;
}
