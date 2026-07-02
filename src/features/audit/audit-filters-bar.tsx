"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, RefreshCw } from "lucide-react";

const MODULE_OPTIONS = [
  { value: "", label: "All Modules" },
  { value: "users", label: "Users" },
  { value: "roles", label: "Roles" },
  { value: "permissions", label: "Permissions" },
  { value: "audit", label: "Audit" },
  { value: "dms", label: "DMS" },
  { value: "hr", label: "HR" },
  { value: "reports", label: "Reports" },
  { value: "notifications", label: "Notifications" },
  { value: "settings", label: "Settings" },
];

const ACTION_OPTIONS = [
  { value: "", label: "All Actions" },
  { value: "USER_CREATED", label: "User Created" },
  { value: "USER_UPDATED", label: "User Updated" },
  { value: "USER_STATUS_CHANGED", label: "User Status Changed" },
  { value: "USER_DELETED", label: "User Deleted" },
  { value: "USER_ROLE_ASSIGNED", label: "Role Assigned" },
  { value: "USER_ROLE_REMOVED", label: "Role Removed" },
  { value: "USER_PASSWORD_CHANGED", label: "Password Changed" },
  { value: "USER_SECURITY_RESET_EMAIL_SENT", label: "Password Reset Sent" },
  { value: "USER_SECURITY_TEMP_PASSWORD_SET", label: "Temp Password Set" },
  { value: "USER_SECURITY_FORCE_CHANGE_SET", label: "Force Change Set" },
  { value: "USER_SECURITY_WELCOME_EMAIL_SENT", label: "Welcome Email Sent" },
  { value: "USER_SECURITY_INVITE_EMAIL_SENT", label: "Invite Email Sent" },
  { value: "ROLE_CREATED", label: "Role Created" },
  { value: "ROLE_UPDATED", label: "Role Updated" },
  { value: "ROLE_STATUS_CHANGED", label: "Role Status Changed" },
  { value: "ROLE_DELETED", label: "Role Deleted" },
  { value: "ROLE_CLONED", label: "Role Cloned" },
  { value: "ROLE_PERMISSION_ASSIGNED", label: "Permission Assigned" },
  { value: "ROLE_PERMISSION_REMOVED", label: "Permission Removed" },
  { value: "EFFECTIVE_ACCESS_VIEWED", label: "Effective Access Viewed" },
  { value: "UNAUTHORIZED_ACCESS_ATTEMPT", label: "Unauthorized Attempt" },
  { value: "LAST_ADMIN_GUARD_TRIGGERED", label: "Last Admin Guard" },
  { value: "DEBUG_ROUTE_ACCESSED", label: "Debug Route Accessed" },
];

export function AuditFiltersBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [action, setAction] = useState(searchParams.get("action") ?? "");
  const [module, setModule] = useState(searchParams.get("module") ?? "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("date_from") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("date_to") ?? "");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [actor, setActor] = useState(searchParams.get("actor") ?? "");

  const applyFilters = () => {
    startTransition(() => {
      const params = new URLSearchParams();
      if (action) params.set("action", action);
      if (module) params.set("module", module);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (search) params.set("search", search);
      if (actor) params.set("actor", actor);
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const clearFilters = () => {
    setAction("");
    setModule("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setActor("");
    startTransition(() => {
      router.push(pathname);
    });
  };

  const hasFilters = action || module || dateFrom || dateTo || search || actor;

  const selectClass =
    "flex h-8 w-full rounded-md border border-input bg-background text-foreground px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring";

  // Active filter chips
  const activeChips: { label: string; onRemove: () => void }[] = [];
  if (search) activeChips.push({ label: `Search: "${search}"`, onRemove: () => { setSearch(""); applyWithOverride({ search: "" }); } });
  if (module) {
    const m = MODULE_OPTIONS.find((o) => o.value === module);
    activeChips.push({ label: `Module: ${m?.label ?? module}`, onRemove: () => { setModule(""); applyWithOverride({ module: "" }); } });
  }
  if (action) {
    const a = ACTION_OPTIONS.find((o) => o.value === action);
    activeChips.push({ label: `Action: ${a?.label ?? action}`, onRemove: () => { setAction(""); applyWithOverride({ action: "" }); } });
  }
  if (dateFrom) activeChips.push({ label: `From: ${dateFrom}`, onRemove: () => { setDateFrom(""); applyWithOverride({ dateFrom: "" }); } });
  if (dateTo) activeChips.push({ label: `To: ${dateTo}`, onRemove: () => { setDateTo(""); applyWithOverride({ dateTo: "" }); } });
  if (actor) activeChips.push({ label: `Actor: #${actor}`, onRemove: () => { setActor(""); applyWithOverride({ actor: "" }); } });

  function applyWithOverride(override: Record<string, string>) {
    startTransition(() => {
      const params = new URLSearchParams();
      const cur = { action, module, dateFrom, dateTo, search, actor, ...override };
      if (cur.action) params.set("action", cur.action);
      if (cur.module) params.set("module", cur.module);
      if (cur.dateFrom) params.set("date_from", cur.dateFrom);
      if (cur.dateTo) params.set("date_to", cur.dateTo);
      if (cur.search) params.set("search", cur.search);
      if (cur.actor) params.set("actor", cur.actor);
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1 — Search + apply + refresh */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search action or entity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            className="pl-8 h-8 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(""); applyWithOverride({ search: "" }); }}
              className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            onClick={applyFilters}
            disabled={isPending}
            className="gap-1.5"
          >
            <Search className="h-3.5 w-3.5" />
            {isPending ? "Loading…" : "Apply"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => startTransition(() => router.refresh())}
            disabled={isPending}
            aria-label="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Row 2 — Labeled filter panel */}
      <div className="rounded-lg border border-border bg-muted/10 p-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Module
            </label>
            <select value={module} onChange={(e) => setModule(e.target.value)} className={selectClass}>
              {MODULE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Action
            </label>
            <select value={action} onChange={(e) => setAction(e.target.value)} className={selectClass}>
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Date From
            </label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Date To
            </label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Actor (Profile ID)
            </label>
            <Input
              type="number"
              className="h-8 text-xs"
              placeholder="e.g. 5"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            />
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
              onClick={clearFilters}
              className="text-[11px] text-muted-foreground hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
