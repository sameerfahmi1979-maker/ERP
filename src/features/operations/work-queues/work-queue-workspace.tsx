import Link from "next/link";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  workQueueFilter, workQueueLabels, workQueueMaxPage, workQueuePath, workQueueQuery,
  type WorkQueuePage, type WorkQueueQuery, type WorkQueueScope,
} from "@/lib/operations/work-queue-contract";
import { readWorkQueue, readWorkQueueScopes } from "@/server/reads/work-queues";

type Params = Record<string, string | string[] | undefined>;
type Row = WorkQueuePage["rows"][number];
type Filters = Pick<WorkQueueQuery, "kind" | "query" | "page">;
const evidenceLabel: Record<Row["evidence"], string> = {
  available: "Evidence available in workflow",
  restricted: "Restricted evidence",
  missing: "Evidence required",
  "in-workflow": "See owning workflow",
};

function scopeValue(scope: WorkQueueScope) {
  return String(scope.company) + "." + String(scope.branch ?? 0);
}

function queueHref(scope: WorkQueueScope, filters: Filters) {
  const params = new URLSearchParams({ scope: scopeValue(scope), kind: filters.kind });
  if (filters.query) params.set("q", filters.query);
  if (filters.page > 1) params.set("page", String(filters.page));
  return workQueuePath + "?" + params.toString();
}

const linkClass = "font-medium text-primary underline-offset-4 hover:underline focus-visible:underline";

function ScopeSelector({ scopes, selected }: { scopes: WorkQueueScope[]; selected?: WorkQueueScope }) {
  return <form action={workQueuePath} className="flex flex-wrap items-end gap-2">
    <label className="grid gap-1 text-sm font-medium">
      Employer and branch
      <select name="scope" defaultValue={selected ? scopeValue(selected) : ""} required
        className="h-9 w-full rounded-md border bg-background px-3 font-normal sm:min-w-72">
        <option value="" disabled>Choose scope</option>
        {scopes.map(scope => <option key={scopeValue(scope)} value={scopeValue(scope)}>
          {scope.company_name} · {scope.branch_name ?? "Company records without a branch"}
        </option>)}
      </select>
    </label>
    <Button type="submit" variant="outline">Open scope</Button>
  </form>;
}

function WorkQueueResults({ data, scope, filters }: { data: WorkQueuePage; scope: WorkQueueScope; filters: Filters }) {
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  return <section className="space-y-3" aria-label="Work items">
    <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
      <p role="status">{data.total.toLocaleString("en-AE")} matching {data.total === 1 ? "item" : "items"}</p>
      <p>As of <time dateTime={data.as_of}>{data.as_of}</time> in Dubai</p>
    </div>
    {data.total === 0 && <p className="rounded-md border bg-card p-4 text-sm">No open work matches these filters.</p>}
    {data.total > 0 && data.rows.length === 0 &&
      <p className="rounded-md border bg-card p-4 text-sm">This page is empty. Return to the first page to see current matches.</p>}
    {data.rows.length > 0 && <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full min-w-[52rem] text-left text-sm">
        <thead className="border-b bg-muted/40 text-muted-foreground">
          <tr>{["Source", "Responsible", "Status and evidence", "Deadline and age", "Action"].map(title =>
            <th scope="col" key={title} className="px-4 py-3 font-medium">{title}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {data.rows.map(row => <tr key={row.source_type + "/" + row.source_id} className="align-top">
            <th scope="row" className="px-4 py-3 font-medium">
              <span className="block text-xs font-normal text-muted-foreground">{workQueueLabels[row.kind]} · {row.reference}</span>
              {row.title}
            </th>
            <td className="px-4 py-3">
              {row.responsible}
              {row.assignee && <span className="block text-muted-foreground">{row.assignee}</span>}
            </td>
            <td className="px-4 py-3">
              <span className="capitalize">{row.state.replaceAll(/[-_]/g, " ")}</span>
              <span className="block text-xs text-muted-foreground">{evidenceLabel[row.evidence]}</span>
            </td>
            <td className="px-4 py-3 tabular-nums">
              {row.due_on ? <time dateTime={row.due_on}>{row.due_on}</time> : "No recorded deadline"}
              {row.overdue_days !== null && row.overdue_days > 0 &&
                <span className="block font-medium text-destructive">{row.overdue_days} {row.overdue_days === 1 ? "day" : "days"} overdue</span>}
              <span className="block text-xs text-muted-foreground">Open {row.age_days} {row.age_days === 1 ? "day" : "days"}</span>
            </td>
            <td className="px-4 py-3"><Link prefetch={false} className={linkClass} href={row.href}>{row.action}</Link></td>
          </tr>)}
        </tbody>
      </table>
    </div>}
    {data.total > 0 && <nav aria-label="Work queue pages" className="flex flex-wrap items-center gap-4 text-sm">
      {filters.page > 1 && <Link prefetch={false} className={linkClass} href={queueHref(scope, { ...filters, page: 1 })}>First page</Link>}
      {filters.page > 2 && filters.page <= pages &&
        <Link prefetch={false} className={linkClass} href={queueHref(scope, { ...filters, page: filters.page - 1 })}>Previous page</Link>}
      <span className="text-muted-foreground">Page {data.page} of {pages}</span>
      {filters.page < pages && filters.page < workQueueMaxPage &&
        <Link prefetch={false} className={linkClass} href={queueHref(scope, { ...filters, page: filters.page + 1 })}>Next page</Link>}
      {filters.page === workQueueMaxPage && filters.page < pages && <span>Refine your search to reach more records.</span>}
    </nav>}
  </section>;
}

export async function WorkQueueWorkspace({ params }: { params: Params }) {
  const scopesResult = await readWorkQueueScopes();
  const choices = scopesResult.status === "ok" ? scopesResult.data : [];
  const activeScope = params.scope === undefined
    ? choices.length === 1 ? choices[0] : undefined
    : choices.find(choice => scopeValue(choice) === params.scope);
  const kind = workQueueFilter.safeParse(params.kind ?? "all");
  const query = workQueueQuery.safeParse({
    company: activeScope?.company, branch: activeScope?.branch, kind: params.kind ?? "all",
    query: params.q ?? "", page: params.page === undefined ? 1
      : typeof params.page === "string" && /^[1-9][0-9]*$/.test(params.page) ? Number(params.page) : NaN,
  });
  const restrictedSelection = (params.scope !== undefined && !activeScope)
    || (activeScope && kind.success && kind.data !== "all" && !activeScope.kinds.includes(kind.data));
  const result = activeScope && !restrictedSelection && query.success ? await readWorkQueue(query.data) : undefined;

  return <main className="space-y-5">
    <ERPPageHeader title="Work queues" description="Review open work by employer, branch and workflow."
      breadcrumbs={[{ label: "Operations" }, { label: "Work queues" }]} />
    {scopesResult.status === "restricted" && <p role="alert">Work queues are restricted for this session.</p>}
    {scopesResult.status === "failed" && <p role="alert">Work queue scopes could not be loaded. <Link className={linkClass} href={workQueuePath}>Retry</Link></p>}
    {scopesResult.status === "ok" && choices.length === 0 &&
      <p role="alert">Work queues require an authorized employer and branch assignment.</p>}
    {choices.length > 0 && <ScopeSelector scopes={choices} selected={activeScope} />}
    {choices.length > 0 && restrictedSelection && <p role="alert">That scope or queue is restricted.</p>}
    {activeScope && !restrictedSelection && !query.success && <p role="alert">
      Check your search, queue and page filters.{" "}
      <Link className={linkClass} href={queueHref(activeScope, { kind: "all", query: "", page: 1 })}>Reset filters</Link>
    </p>}
    {activeScope && !restrictedSelection && query.success && <>
      <form action={workQueuePath} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="scope" value={scopeValue(activeScope)} />
        <label className="grid gap-1 text-sm font-medium">
          Queue
          <select name="kind" defaultValue={query.data.kind} className="h-9 rounded-md border bg-background px-3 font-normal">
            <option value="all">{workQueueLabels.all}</option>
            {activeScope.kinds.map(value => <option key={value} value={value}>{workQueueLabels[value]}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Search work items
          <Input name="q" defaultValue={query.data.query} maxLength={100} className="w-full sm:min-w-72" />
        </label>
        <Button type="submit">Apply filters</Button>
      </form>
      {result?.status === "restricted" && <p role="alert">That scope or queue is restricted.</p>}
      {result?.status === "failed" && <p role="alert">
        Work items could not be loaded. <Link className={linkClass} href={queueHref(activeScope, query.data)}>Retry</Link>
      </p>}
      {result?.status === "ok" && <WorkQueueResults data={result.data} scope={activeScope} filters={query.data} />}
    </>}
  </main>;
}
