"use client";
import {useEffect, useState} from "react";
import {ChevronDown, ChevronRight, Search, User, UserRound, Users, X} from "lucide-react";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {cn} from "@/lib/utils";
import type {AuthContext} from "@/lib/rbac/check";
import {useHrDocumentBrowser, type HrBrowserSeed} from "@/hooks/use-hr-document-browser";
import type {HrBrowserEmployee} from "@/lib/reads/hr-document-browser-schema";
import type {BrowserEntitySelection} from "./hr-doc-browser-types";
import {HrBrowserPagination, HrBrowserReadState} from "./hr-doc-browser-read-state";

type Props = {authContext: AuthContext; seed?: HrBrowserSeed; selection: BrowserEntitySelection | null; onSelect: (selection: BrowserEntitySelection) => void; onDenied: () => void};
export function HrDocBrowserNavigator(props: Props) {
  const [search, setSearch] = useState(""), [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all"), [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  useEffect(() => {const timer = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(timer);}, [search]);
  const read = useHrDocumentBrowser(props.authContext, {operation: "employees", page, pageSize: 25, status, search: debounced}, {seed: props.seed, onDenied: props.onDenied});
  const data = search !== debounced ? undefined : read.data, rows = data && "rows" in data ? data.rows : undefined;
  const oversized = data && "availability" in data && data.availability === "too_large";
  const busy = search !== debounced || read.isFetching;
  const total = data && "totalCount" in data ? data.totalCount : null;
  if (total !== null && page > Math.max(1, Math.ceil(total / 25))) setPage(Math.max(1, Math.ceil(total / 25)));
  return <div className="flex flex-col h-full overflow-hidden">
    <div className="p-2.5 border-b border-border/60 space-y-2 shrink-0">
      <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input aria-label="Search employees" maxLength={200} value={search} onChange={e => {setSearch(e.target.value); setPage(1);}} placeholder="Search employees or dependents…" className="pl-8 h-8 text-sm" />
        {search && <button onClick={() => {setSearch(""); setPage(1);}} className="absolute right-2 top-1/2 -translate-y-1/2" aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>}
      </div>
      <div className="flex gap-1">{(["all", "active", "inactive"] as const).map(value => <button key={value} type="button" aria-pressed={status === value} onClick={() => {setStatus(value); setPage(1);}}
        className={cn("flex-1 rounded-md px-2 py-1 text-[11px] font-medium capitalize", status === value ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted")}>{value}</button>)}</div>
    </div>
    <div className="flex items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0"><Users className="h-3.5 w-3.5" />Employees<span className="ml-auto tabular-nums">{total ?? "—"}</span></div>
    <div className="flex-1 min-h-0 overflow-y-auto pb-2" aria-busy={busy}>
      <HrBrowserReadState noun="employees" busy={busy} failed={read.isError} oversized={oversized} retry={read.retry} />
      {rows?.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted-foreground">No employees match.</p>}
      {rows?.map(emp => {
        const isExpanded = expanded.has(emp.id), selected = props.selection?.type === "employee" && props.selection.id === emp.id;
        const inactive = emp.status !== null && emp.status !== "active";
        return <div key={emp.id}>
          <div className={cn("group flex items-center gap-1 pr-2 border-l-2", selected ? "bg-primary/10 border-l-primary" : "border-l-transparent hover:bg-muted/50")}>
            <button type="button" onClick={() => setExpanded(old => {const next = new Set(old); if (next.has(emp.id)) next.delete(emp.id); else next.add(emp.id); return next;})}
              className="ml-1 h-6 w-6 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:bg-muted" aria-label={`${isExpanded ? "Collapse" : "Expand"} dependents for ${emp.fullNameEn ?? "employee"}`} aria-expanded={isExpanded}>
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>
            <button type="button" aria-pressed={selected} onClick={() => props.onSelect({type: "employee", id: emp.id, name: emp.fullNameEn ?? "Employee name unavailable", subtitle: emp.employeeCode ?? undefined})}
              className={cn("flex items-center gap-2 flex-1 min-w-0 py-1.5 text-left", inactive && "text-muted-foreground")}>
              <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{emp.fullNameEn ?? "Employee name unavailable"}</span>
                <span className="block truncate text-[10px] text-muted-foreground font-mono">{emp.employeeCode ?? "Code unavailable"}</span></span>
              {inactive && <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 text-muted-foreground">Inactive</Badge>}
              {emp.status === null && <span className="text-[10px]">Status unavailable</span>}
            </button>
          </div>
          {isExpanded && <Dependents {...props} employee={emp} />}
        </div>;
      })}
    </div>
    <HrBrowserPagination label="employees" page={page} pageSize={25} total={total} busy={busy} onPage={setPage} />
  </div>;
}
function Dependents(props: Props & {employee: HrBrowserEmployee}) {
  const [page, setPage] = useState(1);
  const read = useHrDocumentBrowser(props.authContext, {operation: "dependents", employeeId: props.employee.id, page, pageSize: 25}, {onDenied: props.onDenied});
  const total = read.data?.totalCount ?? null;
  if (total !== null && page > Math.max(1, Math.ceil(total / 25))) setPage(Math.max(1, Math.ceil(total / 25)));
  return <div aria-label={`Dependents of ${props.employee.fullNameEn ?? "employee"}`}>
    <HrBrowserReadState noun="dependents" busy={read.isFetching} failed={read.isError} retry={read.retry} />
    {read.data?.rows.length === 0 && <p className="pl-11 p-2 text-xs text-muted-foreground">No permitted dependents.</p>}
    {read.data?.rows.map(dep => <button key={dep.id} type="button" aria-pressed={props.selection?.type === "employee_dependent" && props.selection.id === dep.id}
      onClick={() => props.onSelect({type: "employee_dependent", id: dep.id, name: dep.name ?? "Dependent name unavailable", subtitle: `${dep.relationship ?? "Dependent"} of ${props.employee.fullNameEn ?? "employee"}`})}
      className={cn("flex items-center gap-2 w-full py-1.5 pl-11 pr-2 border-l-2 text-left", props.selection?.type === "employee_dependent" && props.selection.id === dep.id ? "bg-primary/10 border-l-primary" : "border-l-transparent hover:bg-muted/50")}>
      <UserRound className="h-3 w-3 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate text-xs">{dep.name ?? "Dependent name unavailable"}</span><span className="block truncate text-[10px] text-muted-foreground">{dep.relationship ?? "Dependent"}</span></span>
    </button>)}
    {total !== null && total > 25 && <HrBrowserPagination label={`dependents of ${props.employee.fullNameEn ?? "employee"}`} page={page} pageSize={25} total={total} busy={read.isFetching} onPage={setPage} />}
  </div>;
}
