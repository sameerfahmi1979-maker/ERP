"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Permission } from "@/types/database";

// ── Module label map ──────────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  hr: "Human Resource",
  users: "Users",
  roles: "Roles",
  permissions: "Permissions",
  dms: "Document Management",
  audit: "Audit & Logs",
  finance: "Finance",
  inventory: "Inventory",
  purchasing: "Purchasing",
  sales: "Sales",
  master_data: "Master Data",
  settings: "Settings",
  notifications: "Notifications",
  reports: "Reports",
  system: "System",
};

function humanizeModule(code: string): string {
  return MODULE_LABELS[code] ?? code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const LS_KEY = "erp_role_permission_center_expanded_modules:v1";

function loadExpandedModules(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set();
}

function saveExpandedModules(modules: Set<string>): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...modules]));
  } catch {}
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PermissionExplorerProps = {
  permissions: Permission[];
  selectedPermission: Permission | null;
  onSelect: (perm: Permission) => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function PermissionExplorer({
  permissions,
  selectedPermission,
  onSelect,
}: PermissionExplorerProps) {
  const [search, setSearch] = useState("");
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Hydrate from localStorage
  useEffect(() => {
    setExpandedModules(loadExpandedModules());
  }, []);

  const toggleModule = useCallback(
    (moduleCode: string) => {
      setExpandedModules((prev) => {
        const next = new Set(prev);
        if (next.has(moduleCode)) {
          next.delete(moduleCode);
        } else {
          next.add(moduleCode);
        }
        saveExpandedModules(next);
        return next;
      });
    },
    [],
  );

  const searchLower = search.toLowerCase().trim();

  const filtered = useMemo(() => {
    if (!searchLower) return permissions;
    return permissions.filter((p) => {
      return (
        p.permission_name.toLowerCase().includes(searchLower) ||
        p.permission_code.toLowerCase().includes(searchLower) ||
        (p.display_name ?? "").toLowerCase().includes(searchLower) ||
        p.module_code.toLowerCase().includes(searchLower) ||
        p.action_code.toLowerCase().includes(searchLower) ||
        (p.description ?? "").toLowerCase().includes(searchLower)
      );
    });
  }, [permissions, searchLower]);

  const grouped = useMemo(() => {
    const map: Record<string, Permission[]> = {};
    for (const perm of filtered) {
      if (!map[perm.module_code]) map[perm.module_code] = [];
      map[perm.module_code].push(perm);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Auto-expand modules that match search
  useEffect(() => {
    if (!searchLower) return;
    setExpandedModules((prev) => {
      const next = new Set(prev);
      for (const [mod] of grouped) next.add(mod);
      return next;
    });
  }, [searchLower, grouped]);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search permissions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-8 h-8 text-sm"
            aria-label="Search permissions"
          />
          {search && (
            <button
              type="button"
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {searchLower && (
          <p className="text-xs text-muted-foreground mt-1.5 px-0.5">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Module list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-center px-4">
            <p className="text-sm text-muted-foreground">No permissions match your search.</p>
            {searchLower && (
              <button
                type="button"
                className="text-xs text-primary underline-offset-2 hover:underline"
                onClick={() => setSearch("")}
              >
                Clear Search
              </button>
            )}
          </div>
        )}

        {grouped.map(([moduleCode, perms]) => {
          const isExpanded = expandedModules.has(moduleCode);
          return (
            <div key={moduleCode}>
              {/* Module header */}
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors text-left group"
                onClick={() => toggleModule(moduleCode)}
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? "Collapse" : "Expand"} ${humanizeModule(moduleCode)} module`}
              >
                <div className="flex items-center gap-1.5">
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{humanizeModule(moduleCode)}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 tabular-nums">
                  {perms.length}
                </Badge>
              </button>

              {/* Permission rows */}
              {isExpanded && (
                <div className="bg-muted/20">
                  {perms.map((perm) => {
                    const isSelected = selectedPermission?.id === perm.id;
                    return (
                      <button
                        key={perm.id}
                        type="button"
                        className={cn(
                          "w-full flex flex-col items-start px-4 py-2 text-left transition-colors",
                          "border-l-2",
                          isSelected
                            ? "bg-primary/10 border-primary text-primary"
                            : "border-transparent hover:bg-muted/60 hover:border-muted-foreground/30",
                        )}
                        onClick={() => onSelect(perm)}
                        aria-selected={isSelected}
                        aria-label={`Select permission: ${perm.permission_name}`}
                      >
                        <span className={cn("text-sm leading-tight", isSelected ? "font-semibold" : "font-normal")}>
                          {perm.display_name ?? perm.permission_name}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground mt-0.5 leading-tight">
                          {perm.permission_code}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
