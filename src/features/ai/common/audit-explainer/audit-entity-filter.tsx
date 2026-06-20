"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ENTITY_TYPES = [
  { value: "", label: "All Entities" },
  { value: "organization", label: "Organization" },
  { value: "branch", label: "Branch" },
  { value: "party", label: "Party" },
  { value: "work_site", label: "Work Site" },
  { value: "dms_document", label: "DMS Document" },
];

interface Props {
  entityType?: string;
  entityId?: number;
  onFilterChange: (entityType?: string, entityId?: number) => void;
  disabled?: boolean;
}

export function AuditEntityFilter({ entityType, entityId, onFilterChange, disabled }: Props) {
  const [localId, setLocalId] = useState(entityId ? String(entityId) : "");

  const handleTypeChange = (value: string) => {
    setLocalId("");
    onFilterChange(value || undefined, undefined);
  };

  const handleIdSearch = () => {
    const id = parseInt(localId, 10);
    onFilterChange(entityType, isNaN(id) ? undefined : id);
  };

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-slate-500">Entity Type</Label>
        <select
          value={entityType ?? ""}
          onChange={(e) => handleTypeChange(e.target.value)}
          disabled={disabled}
          className="h-8 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {ENTITY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      {entityType && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Entity ID</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={localId}
              onChange={(e) => setLocalId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleIdSearch()}
              placeholder="ID…"
              className="h-8 w-28 text-sm"
              disabled={disabled}
            />
            <button
              type="button"
              onClick={handleIdSearch}
              disabled={disabled}
              className="h-8 w-8 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Search className="h-3.5 w-3.5 text-slate-500" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
