"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

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

  return (
    <div className="flex flex-col gap-3 px-4 py-3 border-b bg-muted/20">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">Filters</span>
        {hasFilters && (
          <Button type="button" variant="ghost" size="sm" className="h-6 text-xs ml-auto" onClick={clearFilters}>
            <X className="h-3 w-3 mr-1" />
            Clear all
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Module</Label>
          <Select value={module} onValueChange={(v) => setModule(v ?? "")}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="All modules" />
            </SelectTrigger>
            <SelectContent>
              {MODULE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Action</Label>
          <Select value={action} onValueChange={(v) => setAction(v ?? "")}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Date from</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Date to</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Actor (profile ID)</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="e.g. 5"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Search</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              className="h-8 text-xs pl-6"
              placeholder="action or entity..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" size="sm" className="h-7 text-xs" onClick={applyFilters} disabled={isPending}>
          {isPending ? "Filtering..." : "Apply Filters"}
        </Button>
      </div>
    </div>
  );
}
