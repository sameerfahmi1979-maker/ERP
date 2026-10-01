"use client";

import { Button } from "@/components/ui/button";
import { EditFilters } from "@/components/erp/table/list-controls";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Branch, OwnerCompany, Role } from "@/types/domain";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

type QuickFilter = {
  label: string;
  params: Record<string, string | null>;
  activeWhen: (p: URLSearchParams) => boolean;
};

const QUICK_FILTERS: QuickFilter[] = [
  {
    label: "All",
    params: { status: null, mcp: null, no_role: null, page: "1" },
    activeWhen: (p) => !p.get("status") && !p.get("mcp") && !p.get("no_role"),
  },
  {
    label: "Active",
    params: { status: "active", mcp: null, no_role: null, page: "1" },
    activeWhen: (p) => p.get("status") === "active" && !p.get("mcp") && !p.get("no_role"),
  },
  {
    label: "Suspended",
    params: { status: "suspended", mcp: null, no_role: null, page: "1" },
    activeWhen: (p) => p.get("status") === "suspended",
  },
  {
    label: "Inactive",
    params: { status: "inactive", mcp: null, no_role: null, page: "1" },
    activeWhen: (p) => p.get("status") === "inactive",
  },
  {
    label: "Must Change Password",
    params: { mcp: "1", status: null, no_role: null, page: "1" },
    activeWhen: (p) => p.get("mcp") === "1",
  },
  {
    label: "No Role",
    params: { no_role: "1", status: null, mcp: null, page: "1" },
    activeWhen: (p) => p.get("no_role") === "1",
  },
];

type UsersListToolbarProps = {
  totalCount: number;
  page: number;
  pageSize: number;
  search: string;
  status: string;
  companyId: string;
  branchId: string;
  roleId: string;
  mcpFilter: string;
  noRoleFilter: boolean;
  roles: Role[];
  companies: OwnerCompany[];
  branches: Branch[];
};

export function UsersListToolbar({
  totalCount, page, pageSize, search, status, companyId, branchId, roleId,
  mcpFilter, noRoleFilter, roles, companies, branches,
}: UsersListToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) params.delete(key); else params.set(key, value);
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }, [pathname, router, searchParams]);

  return <div className="algt-user-list-tools grid gap-3" aria-busy={isPending}>
    <div className="flex flex-wrap gap-2">
      {QUICK_FILTERS.map(filter => <Button key={filter.label} type="button" size="sm"
        variant={filter.activeWhen(searchParams) ? "default" : "outline"}
        aria-pressed={filter.activeWhen(searchParams)} disabled={isPending}
        onClick={() => updateParams(filter.params)}>
        {filter.label === "No Role" ? "No role (this page)" : filter.label}
      </Button>)}
    </div>
    <form key={search} action={data => updateParams({ q: String(data.get("q") ?? "").trim(), page:"1" })}
      className="flex gap-2 min-w-0">
      <Input name="q" defaultValue={search} aria-label="Search users by name, email or user code"
        placeholder="Search name, email or user code…" className="min-w-0 flex-1" />
      <Button type="submit" variant="outline" disabled={isPending}><Search className="h-4 w-4" />Search</Button>
      <Button type="button" variant="outline" disabled={isPending} aria-label="Refresh users" onClick={() => startTransition(() => router.refresh())}>
        <RefreshCw className={cn("h-4 w-4",isPending && "animate-spin")} />
      </Button>
    </form>
    <div className="flex flex-wrap gap-2">
      <EditFilters scopeLabel="Status, company, branch, role and password filters apply on the server. The No role shortcut applies to this page only."
        definitions={[
          {id:"status",label:"Status",type:"select",options:["active","inactive","suspended"].map(value=>({value,label:value}))},
          {id:"company",label:"Company",type:"select",options:companies.map(c=>({value:String(c.id),label:c.legal_name_en}))},
          {id:"branch",label:"Branch",type:"select",options:branches.map(b=>({value:String(b.id),label:b.branch_name_en}))},
          {id:"role",label:"Role",type:"select",options:roles.filter(r=>r.is_active).map(r=>({value:String(r.id),label:r.role_name}))},
          {id:"mcp",label:"Password change required",type:"select",options:[{value:"1",label:"Required"}]},
        ]}
        values={{status,company:companyId,branch:branchId,role:roleId,mcp:mcpFilter}}
        onApply={values => {
          const selectedBranch = branches.find(b=>String(b.id)===values.branch);
          const branch = !values.company || String(selectedBranch?.owner_company_id)===values.company ? values.branch : "";
          updateParams({status:values.status || null,company:values.company || null,branch:branch || null,role:values.role || null,mcp:values.mcp || null,page:"1"});
        }} />
      {(search || status || companyId || branchId || roleId || mcpFilter || noRoleFilter) &&
        <Button variant="ghost" onClick={()=>startTransition(()=>router.push(pathname))}>Clear search and filters</Button>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span role="status">{totalCount} users in server results{isPending ? " · Loading…" : ""}</span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">Rows per page
          <select aria-label="Users per page" className="rounded-sm border bg-card p-2" value={String(pageSize)} disabled={isPending}
            onChange={e=>updateParams({pageSize:e.target.value,page:"1"})}>
            {[10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <Button variant="outline" size="sm" aria-label="Previous page" disabled={page<=1 || isPending} onClick={()=>updateParams({page:String(page-1)})}><ChevronLeft className="h-4 w-4" /></Button>
        <span>Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" aria-label="Next page" disabled={page>=totalPages || isPending} onClick={()=>updateParams({page:String(page+1)})}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  </div>;
}
