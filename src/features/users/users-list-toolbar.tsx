"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Role, OwnerCompany, Branch } from "@/types/database";
import { Search, ChevronLeft, ChevronRight, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

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
  totalCount,
  page,
  pageSize,
  search,
  status,
  companyId,
  branchId,
  roleId,
  mcpFilter,
  noRoleFilter,
  roles,
  companies,
  branches,
}: UsersListToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const hasActiveFilters =
    search || status || companyId || branchId || roleId || mcpFilter || noRoleFilter;

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router, searchParams],
  );

  const handleSearchSubmit = (formData: FormData) => {
    const q = (formData.get("q") as string)?.trim() ?? "";
    updateParams({ q: q || null, page: "1" });
  };

  const handleClearAll = () => {
    startTransition(() => {
      router.push(pathname);
    });
  };

  const selectClass =
    "flex h-8 w-full rounded-md border border-input bg-background text-foreground px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring";

  // Active filter labels for chips
  const activeChips: { label: string; onRemove: () => void }[] = [];
  if (search) activeChips.push({ label: `Search: "${search}"`, onRemove: () => updateParams({ q: null, page: "1" }) });
  if (status) activeChips.push({ label: `Status: ${status}`, onRemove: () => updateParams({ status: null, page: "1" }) });
  if (companyId) {
    const co = companies.find((c) => String(c.id) === companyId);
    activeChips.push({ label: `Company: ${co?.legal_name_en ?? companyId}`, onRemove: () => updateParams({ company: null, branch: null, page: "1" }) });
  }
  if (branchId) {
    const br = branches.find((b) => String(b.id) === branchId);
    activeChips.push({ label: `Branch: ${br?.branch_name_en ?? branchId}`, onRemove: () => updateParams({ branch: null, page: "1" }) });
  }
  if (roleId) {
    const ro = roles.find((r) => String(r.id) === roleId);
    activeChips.push({ label: `Role: ${ro?.role_name ?? roleId}`, onRemove: () => updateParams({ role: null, page: "1" }) });
  }
  if (mcpFilter === "1") activeChips.push({ label: "Must Change Password", onRemove: () => updateParams({ mcp: null, page: "1" }) });
  if (noRoleFilter) activeChips.push({ label: "No Role", onRemove: () => updateParams({ no_role: null, page: "1" }) });

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1 — Quick status chips + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5 flex-1">
          {QUICK_FILTERS.map((f) => {
            const isActive = f.activeWhen(searchParams);
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => updateParams(f.params)}
                disabled={isPending}
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <form action={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={search}
                placeholder="Search name, email, user code..."
                className="pl-8 h-8 text-sm w-64"
              />
            </div>
            <Button type="submit" variant="outline" size="sm" disabled={isPending}>
              <Search className="h-3.5 w-3.5" />
            </Button>
          </form>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => startTransition(() => router.refresh())}
            disabled={isPending}
            aria-label="Refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Row 2 — Labeled filter panel */}
      <div className="rounded-lg border border-border bg-muted/10 p-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => updateParams({ status: e.target.value || null, page: "1", mcp: null, no_role: null })}
              className={selectClass}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Company
            </label>
            <select
              value={companyId}
              onChange={(e) =>
                updateParams({ company: e.target.value || null, branch: null, page: "1" })
              }
              className={selectClass}
              aria-label="Filter by company"
            >
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.legal_name_en}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Branch
            </label>
            <select
              value={branchId}
              onChange={(e) => updateParams({ branch: e.target.value || null, page: "1" })}
              className={selectClass}
              aria-label="Filter by branch"
              disabled={!companyId && branches.length > 20}
            >
              <option value="">All branches</option>
              {(companyId
                ? branches.filter((b) => String(b.owner_company_id) === companyId)
                : branches
              ).map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.branch_name_en}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Role
            </label>
            <select
              value={roleId}
              onChange={(e) => updateParams({ role: e.target.value || null, page: "1" })}
              className={selectClass}
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              {roles.filter((r) => r.is_active).map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.role_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
            {activeChips.map((chip) => (
              <Badge key={chip.label} variant="secondary" className="gap-1 pr-1 text-[11px] font-normal">
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  aria-label={`Remove ${chip.label} filter`}
                  className="hover:text-destructive"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[11px] text-muted-foreground hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {totalCount} user{totalCount !== 1 ? "s" : ""}
          {isPending ? " · Loading…" : ""}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={String(pageSize)}
            onChange={(e) => updateParams({ pageSize: e.target.value, page: "1" })}
            className="flex h-7 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Page size"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={String(n)}>
                {n} / page
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={page <= 1 || isPending}
            onClick={() => updateParams({ page: String(page - 1) })}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={page >= totalPages || isPending}
            onClick={() => updateParams({ page: String(page + 1) })}
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
