"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Settings2 } from "lucide-react";
import { getMetadataDefinitionsForType, getDmsDocumentMetadataValues, saveDmsDocumentMetadataValues } from "@/server/actions/dms/document-metadata-values";
import type { DmsMetadataDefinitionRow, DmsMetadataValueRow } from "@/server/actions/dms/document-metadata-values";
import { queryKeys } from "@/lib/query/query-keys";

interface DmsDocumentMetadataSectionProps {
  documentId: number | null;
  documentTypeId: number | null;
  isViewing: boolean;
}

export function DmsDocumentMetadataSection({
  documentId,
  documentTypeId,
  isViewing,
}: DmsDocumentMetadataSectionProps) {
  const [saving, setSaving] = useState(false);
  const [localValues, setLocalValues] = useState<Record<number, string>>({});
  // Tracks a serialized snapshot of the last initialised data so the effect
  // doesn't re-run (and call setLocalValues) when React Query returns a new
  // array reference for the same underlying data — which would cause an
  // infinite setState loop.
  const lastInitKeyRef = useRef<string | null>(null);

  const { data: defs = [], isLoading: loadingDefs } = useQuery({
    queryKey: queryKeys.dms.documentMetadataDefs(documentTypeId ?? 0),
    queryFn: async () => {
      if (!documentTypeId) return [];
      const r = await getMetadataDefinitionsForType(documentTypeId);
      return r.data ?? [];
    },
    enabled: !!documentTypeId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: existingValues = [], isLoading: loadingValues } = useQuery({
    queryKey: queryKeys.dms.documentMetadata(documentId ?? 0),
    queryFn: async () => {
      if (!documentId) return [];
      const r = await getDmsDocumentMetadataValues(documentId);
      return r.data ?? [];
    },
    enabled: !!documentId,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    // Build a cheap stable key from the actual data content (not the array reference).
    // If the key hasn't changed since last initialisation, skip setLocalValues to
    // avoid the infinite setState → re-render → new reference → setState loop.
    const initKey =
      defs.map((d: DmsMetadataDefinitionRow) => d.id).join(",") +
      "|" +
      existingValues
        .map((v: DmsMetadataValueRow) => {
          const raw =
            v.value_text ?? v.value_number ?? v.value_boolean ?? v.value_date ?? v.value_datetime ?? "";
          return `${v.definition_id}:${raw}`;
        })
        .join(";");

    if (lastInitKeyRef.current === initKey) return;
    lastInitKeyRef.current = initKey;

    const initial: Record<number, string> = {};
    existingValues.forEach((v: DmsMetadataValueRow) => {
      const def = defs.find((d: DmsMetadataDefinitionRow) => d.id === v.definition_id);
      if (!def) return;
      switch (def.field_type) {
        case "boolean":
          initial[v.definition_id] = v.value_boolean === true ? "true" : "false";
          break;
        case "number":
        case "currency":
          initial[v.definition_id] = v.value_number != null ? String(v.value_number) : "";
          break;
        case "date":
          initial[v.definition_id] = v.value_date ?? "";
          break;
        case "datetime":
          initial[v.definition_id] = v.value_datetime ?? "";
          break;
        case "json":
          initial[v.definition_id] = v.value_json != null ? JSON.stringify(v.value_json, null, 2) : "";
          break;
        default:
          initial[v.definition_id] = v.value_text ?? "";
      }
    });
    setLocalValues(initial);
  }, [existingValues, defs]);

  async function handleSaveMetadata() {
    if (!documentId) return;
    setSaving(true);
    try {
      const values = defs.map((def: DmsMetadataDefinitionRow) => {
        const raw = localValues[def.id] ?? "";
        switch (def.field_type) {
          case "boolean":
            return { definition_id: def.id, value_boolean: raw === "true" };
          case "number":
          case "currency":
            return { definition_id: def.id, value_number: raw ? parseFloat(raw) : null };
          case "date":
            return { definition_id: def.id, value_date: raw || null };
          case "datetime":
            return { definition_id: def.id, value_datetime: raw || null };
          case "json":
            try {
              return { definition_id: def.id, value_json: raw ? JSON.parse(raw) : null };
            } catch {
              return { definition_id: def.id, value_text: raw };
            }
          default:
            return { definition_id: def.id, value_text: raw || null };
        }
      });

      const result = await saveDmsDocumentMetadataValues(documentId, values);
      if (result.success) {
        toast.success("Metadata saved");
      } else {
        toast.error(result.error ?? "Failed to save metadata");
      }
    } finally {
      setSaving(false);
    }
  }

  if (!documentTypeId) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        Select a document type to see metadata fields.
      </div>
    );
  }

  if (loadingDefs || loadingValues) {
    return (
      <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading metadata fields...
      </div>
    );
  }

  if (defs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Settings2 className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">No metadata fields defined</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
            This document type has no custom fields configured yet.
            To add fields, go to{" "}
            <span className="font-semibold text-foreground/80">DMS Admin → Metadata Definitions</span>{" "}
            and create fields for this document type.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {defs.map((def: DmsMetadataDefinitionRow) => (
        <MetadataField
          key={def.id}
          def={def}
          value={localValues[def.id] ?? ""}
          onChange={(v) => setLocalValues((prev) => ({ ...prev, [def.id]: v }))}
          disabled={isViewing}
        />
      ))}

      {!isViewing && documentId && (
        <div className="pt-2 border-t border-border">
          <Button size="sm" onClick={handleSaveMetadata} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Metadata
          </Button>
        </div>
      )}

      {!documentId && (
        <p className="text-xs text-amber-600">Save the document first to store metadata values.</p>
      )}
    </div>
  );
}

function MetadataField({
  def,
  value,
  onChange,
  disabled,
}: {
  def: DmsMetadataDefinitionRow;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const options = def.options_json
    ? ((def.options_json as { values?: string[] })?.values ?? [])
    : [];

  return (
    <div>
      <Label className="text-xs font-medium">
        {def.field_label_en}
        {def.is_required && <span className="text-red-500 ml-1">*</span>}
        {def.is_ai_extractable && (
          <span className="ml-2 text-[10px] bg-violet-100 text-violet-600 px-1 rounded">AI</span>
        )}
      </Label>
      {def.ai_field_hint && (
        <p className="text-[10px] text-muted-foreground mb-1">{def.ai_field_hint}</p>
      )}

      {def.field_type === "boolean" ? (
        <div className="flex items-center gap-2 mt-1">
          <Switch
            checked={value === "true"}
            onCheckedChange={(c) => onChange(c ? "true" : "false")}
            disabled={disabled}
          />
          <span className="text-xs text-muted-foreground">{value === "true" ? "Yes" : "No"}</span>
        </div>
      ) : def.field_type === "select" && options.length > 0 ? (
        <Select value={value} onValueChange={(v) => onChange(v ?? "")} disabled={disabled}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt: string) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : def.field_type === "multi_select" && options.length > 0 ? (
        <div className="mt-1 space-y-1">
          {options.map((opt: string) => {
            const selected = value.split(",").filter(Boolean).includes(opt);
            return (
              <label key={opt} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => {
                    const parts = value.split(",").filter(Boolean);
                    if (e.target.checked) {
                      onChange([...parts, opt].join(","));
                    } else {
                      onChange(parts.filter((p) => p !== opt).join(","));
                    }
                  }}
                  disabled={disabled}
                />
                {opt}
              </label>
            );
          })}
        </div>
      ) : def.field_type === "textarea" ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={3}
          className="mt-1"
          placeholder={def.field_label_en}
        />
      ) : def.field_type === "json" ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={4}
          className="mt-1 font-mono text-xs"
          placeholder='{"key": "value"}'
        />
      ) : (
        <Input
          type={
            def.field_type === "number" || def.field_type === "currency"
              ? "number"
              : def.field_type === "date"
              ? "date"
              : def.field_type === "datetime"
              ? "datetime-local"
              : "text"
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="mt-1"
          placeholder={def.field_label_en}
        />
      )}
    </div>
  );
}
