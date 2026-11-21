import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { LoadError } from "@/components/erp/load-error";
import { HrProProcessesPageClient } from "@/features/hr/actions/hr-pro-processes-page-client";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { hrActionInquiryIdentity } from "@/lib/reads/hr-action-inquiries-schema";
import { readHrActionInquiry } from "@/server/reads/hr-action-inquiries";

export const dynamic = "force-dynamic";

const proPath = "/admin/hr/actions/pro";

export default async function HrProProcessesPage({ searchParams }: {
  searchParams: Promise<{ record?: string | string[] }>;
}) {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view")) redirect("/access-denied");

  const { record } = await searchParams;
  if (record !== undefined) {
    const recordId = typeof record === "string" && /^[1-9][0-9]*$/.test(record) ? Number(record) : NaN;
    if (!Number.isSafeInteger(recordId)) notFound();
    const result = await readHrActionInquiry({ kind: "pro", pageSize: 1 }, ctx, recordId);
    if (!result.success || result.data?.kind !== "pro") {
      return <LoadError title="PRO process" retryHref={proPath + "?record=" + recordId} />;
    }
    const item = result.data.rows[0];
    if (!item) notFound();
    return <main className="space-y-4">
      <ERPPageHeader title={item.process_title}
        breadcrumbs={[{ label: "PRO processes", href: proPath }, { label: "PRO #" + item.id }]} />
      <dl className="grid gap-4 rounded-md border bg-card p-4 text-sm sm:grid-cols-3">
        <div><dt className="text-muted-foreground">Status</dt><dd className="capitalize">{item.process_status.replaceAll("_", " ")}</dd></div>
        <div><dt className="text-muted-foreground">Requested</dt><dd>{item.request_date}</dd></div>
        <div><dt className="text-muted-foreground">Target date</dt><dd>{item.target_date ?? "No recorded deadline"}</dd></div>
      </dl>
      <Link className="text-sm font-medium text-primary underline"
        href={"/admin/hr/employees/record/" + item.employee_id + "?section=hr-actions"}>Open employee HR actions</Link>
    </main>;
  }

  const result = await readHrActionInquiry({ kind: "pro" }, ctx);
  if (!result.success || result.data?.kind !== "pro") return <LoadError title="HR records" retryHref={proPath} />;
  return <HrProProcessesPageClient authContext={ctx} initialPage={result.data} initialUpdatedAt={result.updatedAt}
    initialReadIdentity={hrActionInquiryIdentity(ctx)} />;
}
