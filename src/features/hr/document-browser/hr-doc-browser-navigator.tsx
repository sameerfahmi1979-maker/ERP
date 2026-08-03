"use client";

/**
 * HR.DOC_BROWSER.1 — Column 1: employee + dependent navigator tree.
 *
 * - Search by employee code / name (dependent names matched too)
 * - Status filter: All / Active / Inactive (D3)
 * - Inactive employees greyed out with "Inactive" chip (D3)
 * - Chevron expands dependents inline; clicking a row selects the entity
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, User, UserRound, Users, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { HrDocBrowserEmployee } from "@/server/actions/hr/doc-browser";
import type { BrowserEntitySelection } from "./hr-doc-browser-types";

type StatusFilter = "all" | "active" | "inactive";

interface HrDocBrowserNavigatorProps {
  employees: HrDocBrowserEmployee[];
  selection: BrowserEntitySelection | null;
  onSelect: (selection: BrowserEntitySelection) => void;
}

export function HrDocBrowserNavigator({
  employees,
  selection,
  onSelect,
}: HrDocBrowserNavigatorProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return employees.filter((emp) => {
      if (statusFilter === "active" && emp.status !== "active") return false;
      if (statusFilter === "inactive" && emp.status === "active") return false;
      if (!s) return true;
      if (emp.fullNameEn.toLowerCase().includes(s)) return true;
      if (emp.employeeCode.toLowerCase().includes(s)) return true;
      return emp.dependents.some((d) => d.name.toLowerCase().includes(s));
    });
  }, [employees, search, statusFilter]);

  const toggleExpand = (employeeId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const isSelected = (type: "employee" | "employee_dependent", id: number) =>
    selection?.type === type && selection.id === id;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search + status filter */}
      <div className="p-2.5 border-b border-border/60 space-y-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="pl-8 h-8 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                "flex-1 rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors",
                statusFilter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Root header */}
      <div className="flex items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
        <Users className="h-3.5 w-3.5" />
        Employees
        <span className="ml-auto tabular-nums">{filtered.length}</span>
      </div>

      {/* Tree */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-2">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No employees match.
          </p>
        ) : (
          filtered.map((emp) => {
            const isInactive = emp.status !== "active";
            const hasDeps = emp.dependents.length > 0;
            const isExpanded = expanded.has(emp.id);
            const empSelected = isSelected("employee", emp.id);

            return (
              <div key={emp.id}>
                {/* Employee row */}
                <div
                  className={cn(
                    "group flex items-center gap-1 pr-2 border-l-2 transition-colors cursor-pointer",
                    empSelected
                      ? "bg-primary/10 border-l-primary"
                      : "border-l-transparent hover:bg-muted/50"
                  )}
                >
                  {/* Expand chevron (dependents) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasDeps) toggleExpand(emp.id);
                    }}
                    className={cn(
                      "ml-1 h-5 w-5 shrink-0 flex items-center justify-center rounded text-muted-foreground",
                      hasDeps ? "hover:bg-muted" : "invisible"
                    )}
                    aria-label={isExpanded ? "Collapse dependents" : "Expand dependents"}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <button
                    onClick={() =>
                      onSelect({
                        type: "employee",
                        id: emp.id,
                        name: emp.fullNameEn,
                        subtitle: emp.employeeCode,
                      })
                    }
                    className={cn(
                      "flex items-center gap-2 flex-1 min-w-0 py-1.5 text-left",
                      isInactive && "opacity-60"
                    )}
                  >
                    <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-xs font-medium",
                          isInactive && "text-muted-foreground"
                        )}
                      >
                        {emp.fullNameEn}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground font-mono">
                        {emp.employeeCode}
                      </span>
                    </span>
                    {isInactive && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0 shrink-0 text-muted-foreground"
                      >
                        Inactive
                      </Badge>
                    )}
                  </button>
                </div>

                {/* Dependent rows */}
                {isExpanded &&
                  emp.dependents.map((dep) => {
                    const depSelected = isSelected("employee_dependent", dep.id);
                    return (
                      <button
                        key={dep.id}
                        onClick={() =>
                          onSelect({
                            type: "employee_dependent",
                            id: dep.id,
                            name: dep.name,
                            subtitle: `${dep.relationship ?? "Dependent"} of ${emp.fullNameEn}`,
                          })
                        }
                        className={cn(
                          "flex items-center gap-2 w-full py-1.5 pl-11 pr-2 border-l-2 text-left transition-colors",
                          depSelected
                            ? "bg-primary/10 border-l-primary"
                            : "border-l-transparent hover:bg-muted/50"
                        )}
                      >
                        <UserRound className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs">{dep.name}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {dep.relationship ?? "Dependent"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
