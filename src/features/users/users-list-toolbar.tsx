"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Role, OwnerCompany, Branch } from "@/types/database";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

type UsersListToolbarProps = {
  totalCount: number;
  page: number;
  pageSize: number;
  search: string;
  status: string;
  companyId: string;
  branchId: string;
  roleId: string;
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
  roles,
  companies,
  branches,
}: UsersListToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

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

  const selectClass =
    "flex h-9 rounded-md border border-input bg-background text-foreground px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border/40">
      <form action={handleSearchSubmit} className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={search}
            placeholder="Search name, user code, or email..."
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
          Search
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => updateParams({ status: e.target.value || null, page: "1" })}
          className={selectClass}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>

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

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {totalCount} user{totalCount !== 1 ? "s" : ""} total
          {isPending ? " · Loading…" : ""}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={String(pageSize)}
            onChange={(e) => updateParams({ pageSize: e.target.value, page: "1" })}
            className={selectClass}
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
            variant="outline"
            size="sm"
            disabled={page <= 1 || isPending}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isPending}
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
