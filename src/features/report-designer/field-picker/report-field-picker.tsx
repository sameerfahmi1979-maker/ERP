"use client";

import { useState, useMemo, useCallback } from "react";
import { Search, Lock, ChevronDown, ChevronRight, ShieldAlert, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ReportFieldRegistryEntry, ReportFieldModuleGroup } from "@/lib/report-designer/field-registry/types";
import {
  getReportFieldsGroupedByModuleSorted,
  searchReportFields,
} from "@/lib/report-designer/field-registry/registry-utils";
import {
  canFieldBeInsertedForTemplate,
  getFieldInsertBlockReason,
} from "@/lib/report-designer/field-registry/governance";
import { ReportFieldBadge } from "./report-field-badge";
import { useFieldPickerContext } from "./field-picker-context";
import { downloadFieldReferenceMd } from "@/lib/report-designer/field-registry/field-reference-md";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ReportFieldPickerProps {
  /** Called when an active, insertable field is clicked */
  onInsert: (fieldPath: string) => void;
  /** Whether to show restricted/confidential fields as locked (default: true) */
  showLocked?: boolean;
  /** Whether to show planned/future fields (default: true) */
  showPlanned?: boolean;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field row
// ─────────────────────────────────────────────────────────────────────────────

interface FieldRowProps {
  entry: ReportFieldRegistryEntry;
  onInsert: (path: string) => void;
  userPermissions: string[];
  templateType: string;
}

function FieldRow({ entry, onInsert, userPermissions, templateType }: FieldRowProps) {
  const pickerContext = { userPermissions, templateType };
  const insertable = canFieldBeInsertedForTemplate(entry, pickerContext);
  const blockReason = !insertable ? getFieldInsertBlockReason(entry, pickerContext) : null;

  const isLocked =
    entry.isPlanned ||
    entry.sensitivityLevel === "restricted" ||
    entry.sensitivityLevel === "confidential";

  const isRestrictedButUnlocked =
    (entry.sensitivityLevel === "restricted" || entry.sensitivityLevel === "confidential") &&
    insertable;

  const handleClick = useCallback(() => {
    if (insertable) onInsert(entry.fieldPath);
  }, [insertable, entry.fieldPath, onInsert]);

  const tooltipTitle =
    entry.isPlanned
      ? "Coming soon — module not yet implemented"
      : blockReason ?? entry.description ?? entry.fieldLabel;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!insertable}
      title={tooltipTitle}
      className={cn(
        "group w-full flex items-center gap-2 px-3 py-1.5 text-left rounded",
        "text-xs transition-colors",
        insertable && !isRestrictedButUnlocked
          ? "hover:bg-accent hover:text-accent-foreground cursor-pointer"
          : insertable && isRestrictedButUnlocked
            ? "hover:bg-amber-50 hover:text-amber-900 cursor-pointer border border-amber-200/60"
            : "opacity-50 cursor-not-allowed",
      )}
    >
      {isRestrictedButUnlocked ? (
        <ShieldAlert className="h-3 w-3 shrink-0 text-amber-500" />
      ) : isLocked ? (
        <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
      ) : null}
      <span className="flex-1 min-w-0">
        <span className="block font-medium text-foreground truncate">
          {entry.fieldLabel}
        </span>
        <span className="block text-[10px] text-muted-foreground font-mono truncate">
          {"{{" + entry.fieldPath + "}}"}
        </span>
        {isRestrictedButUnlocked && (
          <span className="block text-[10px] text-amber-600 font-medium mt-0.5">
            Restricted — requires approval to publish
          </span>
        )}
      </span>
      <ReportFieldBadge
        sensitivity={entry.sensitivityLevel}
        isPlanned={entry.isPlanned}
        className="shrink-0"
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Module group accordion
// ─────────────────────────────────────────────────────────────────────────────

interface ModuleGroupProps {
  group: ReportFieldModuleGroup;
  onInsert: (path: string) => void;
  defaultExpanded?: boolean;
  userPermissions: string[];
  templateType: string;
}

function ModuleGroup({
  group,
  onInsert,
  defaultExpanded = false,
  userPermissions,
  templateType,
}: ModuleGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold",
          "bg-muted/50 hover:bg-muted transition-colors",
          group.isPlanned && "text-muted-foreground"
        )}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className="flex-1">{group.moduleLabel}</span>
        {group.isPlanned && (
          <span className="text-[10px] text-muted-foreground font-normal">
            Coming soon
          </span>
        )}
      </button>

      {expanded && (
        <div className="divide-y">
          {group.entities.map((entity) => (
            <div key={entity.entityCode} className="py-1">
              {group.entities.length > 1 && (
                <div className="px-3 pt-1 pb-0.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                  {entity.entityLabel}
                </div>
              )}
              {entity.fields.map((field) => (
                <FieldRow
                  key={field.fieldPath}
                  entry={field}
                  onInsert={onInsert}
                  userPermissions={userPermissions}
                  templateType={templateType}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main picker
// ─────────────────────────────────────────────────────────────────────────────

export function ReportFieldPicker({
  onInsert,
  showLocked = true,
  showPlanned = true,
  className,
}: ReportFieldPickerProps) {
  const [query, setQuery] = useState("");
  const { userPermissions, templateType } = useFieldPickerContext();

  const allGroups = useMemo(
    () => getReportFieldsGroupedByModuleSorted(),
    []
  );

  const filteredEntries = useMemo(() => {
    if (!query.trim()) return null;
    return searchReportFields(query).filter((e) => {
      if (!showLocked && (e.sensitivityLevel === "restricted" || e.sensitivityLevel === "confidential")) return false;
      if (!showPlanned && e.isPlanned) return false;
      return true;
    });
  }, [query, showLocked, showPlanned]);

  const filteredGroups = useMemo((): ReportFieldModuleGroup[] => {
    if (!showLocked && !showPlanned) {
      return allGroups
        .filter((g) => !g.isPlanned)
        .map((g) => ({
          ...g,
          entities: g.entities.map((e) => ({
            ...e,
            fields: e.fields.filter(
              (f) =>
                f.sensitivityLevel !== "restricted" &&
                f.sensitivityLevel !== "confidential" &&
                !f.isPlanned
            ),
          })).filter((e) => e.fields.length > 0),
        }))
        .filter((g) => g.entities.length > 0);
    }
    return allGroups;
  }, [allGroups, showLocked, showPlanned]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Search + Download row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search fields..."
            className="pl-8 h-8 text-xs"
          />
        </div>
        <button
          type="button"
          title="Download field reference as Markdown — paste into ChatGPT to draft report content"
          onClick={() => downloadFieldReferenceMd()}
          className="shrink-0 flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-dashed border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-medium transition-colors"
        >
          <Download className="h-3 w-3" />
          .md
        </button>
      </div>

      {/* Search results (flat list) */}
      {filteredEntries !== null ? (
        <div className="flex flex-col gap-0.5">
          {filteredEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-3 text-center">
              No fields match &ldquo;{query}&rdquo;
            </p>
          ) : (
            filteredEntries.map((entry) => (
              <FieldRow
                key={entry.fieldPath}
                entry={entry}
                onInsert={onInsert}
                userPermissions={userPermissions}
                templateType={templateType}
              />
            ))
          )}
        </div>
      ) : (
        /* Grouped view */
        <div className="flex flex-col gap-1.5">
          {filteredGroups.map((group) => (
            <ModuleGroup
              key={group.moduleCode}
              group={group}
              onInsert={onInsert}
              defaultExpanded={!group.isPlanned}
              userPermissions={userPermissions}
              templateType={templateType}
            />
          ))}
        </div>
      )}
    </div>
  );
}
