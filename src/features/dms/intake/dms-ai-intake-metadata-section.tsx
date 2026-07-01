"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DmsAiIntakeFieldRow } from "./dms-ai-intake-field-row";
import { DmsAiIntakeZeroDefinitionsNotice } from "./dms-ai-intake-zero-definitions-notice";
import { getMetadataDefinitionsForType } from "@/server/actions/dms/document-metadata-values";
import type { DmsMetadataDefinitionRow } from "@/server/actions/dms/document-metadata-values";
import { groupMetadataDefinitionsByFieldGroup } from "@/lib/dms/metadata/metadata-definition-shared";
import { Loader2 } from "lucide-react";

interface MetadataValue {
  fieldType: string;
  rawValue: string;
}

interface FieldConfidenceEntry {
  score: number;
  label: string;
  source_snippet?: string | null;
}

interface DmsAiIntakeMetadataSectionProps {
  documentTypeId: number | null;
  /** DMS AI META.2 — used by the zero-definition notice; falls back to "this document type" when absent. */
  documentTypeName?: string | null;
  extractedFieldsJson: Record<string, unknown> | null;
  fieldConfidenceJson: Record<string, unknown> | null;
  values: Record<number, MetadataValue>;
  onChange: (definitionId: number, fieldType: string, rawValue: string) => void;
  /** Called ONCE with all AI-seeded values when definitions first load. */
  onBulkSeed?: (seeded: Record<number, { fieldType: string; rawValue: string }>) => void;
  /** DMS AI META.2 Flow A — called after AI-suggested definitions are approved, so the parent can offer re-extraction. */
  onDefinitionsCreated?: (documentTypeId: number) => void;
}

function buildReviewWarning(
  def: DmsMetadataDefinitionRow,
  currentValue: string,
  confEntry: FieldConfidenceEntry | undefined
): string | null {
  const warnings: string[] = [];
  const trimmed = currentValue.trim();
  if (def.review_required_if_missing && !trimmed) {
    warnings.push("Required for review — value is missing");
  }
  if (
    def.review_required_if_low_confidence &&
    confEntry?.score != null &&
    def.ai_confidence_threshold != null &&
    confEntry.score < def.ai_confidence_threshold
  ) {
    warnings.push("AI confidence is below the configured threshold");
  }
  return warnings.length > 0 ? warnings.join(". ") : null;
}

function MetadataFieldInput({
  def,
  currentValue,
  onChange,
}: {
  def: DmsMetadataDefinitionRow;
  currentValue: string;
  onChange: (definitionId: number, fieldType: string, rawValue: string) => void;
}) {
  const placeholder = def.placeholder_en ?? def.field_label_en;
  if (def.field_type === "textarea") {
    return (
      <Textarea
        value={currentValue}
        onChange={(e) => onChange(def.id, def.field_type, e.target.value)}
        rows={2}
        className="text-sm"
        placeholder={placeholder}
        // Arabic/RTL content (e.g. AI-extracted Arabic name fields) must render
        // right-to-left with correctly ordered word arrangement. dir="auto"
        // lets the browser pick the direction per the first strong-direction
        // character in the field's current value, and re-evaluates live as
        // the value changes (AI seed or manual edit) — no per-field-code
        // Arabic detection needed.
        dir="auto"
      />
    );
  }
  return (
    <Input
      type={
        def.field_type === "date"
          ? "date"
          : def.field_type === "number" || def.field_type === "decimal"
            ? "number"
            : "text"
      }
      value={currentValue}
      onChange={(e) => onChange(def.id, def.field_type, e.target.value)}
      className="text-sm"
      placeholder={placeholder}
      dir="auto"
    />
  );
}

export function DmsAiIntakeMetadataSection({
  documentTypeId,
  documentTypeName,
  extractedFieldsJson,
  fieldConfidenceJson,
  values,
  onChange,
  onBulkSeed,
  onDefinitionsCreated,
}: DmsAiIntakeMetadataSectionProps) {
  const [definitions, setDefinitions] = useState<DmsMetadataDefinitionRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Track which documentTypeId we've already seeded AI values for,
  // so we seed exactly once per type load and never create an update loop.
  const seededForTypeRef = useRef<number | null>(null);
  // DMS AI META.2 — bumped after AI-suggested definitions are approved, to
  // force the definitions list below to reload for this document type.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!documentTypeId) {
      setDefinitions([]);
      setIsLoading(false);
      seededForTypeRef.current = null;
      return;
    }

    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const result = await getMetadataDefinitionsForType(documentTypeId, "intake");
      if (!cancelled) {
        if (result.success && result.data) {
          setDefinitions(result.data);
        } else {
          setDefinitions([]);
        }
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentTypeId, reloadToken]);

  // Seed the parent formValues with AI-extracted values immediately after
  // definitions load. All fields are collected first and emitted in ONE bulk
  // call via onBulkSeed so the parent can merge them atomically. Calling
  // onChange() per-field in a loop causes a stale-closure race: each call
  // captures the same snapshot of values.metadataValues and the last call
  // overwrites all previous ones (React 18 batching does not help here).
  useEffect(() => {
    if (!definitions.length || !documentTypeId) return;
    if (seededForTypeRef.current === documentTypeId) return;
    seededForTypeRef.current = documentTypeId;

    const seeded: Record<number, { fieldType: string; rawValue: string }> = {};
    for (const def of definitions) {
      const aiValue = extractedFieldsJson?.[def.field_code];
      if (aiValue != null && String(aiValue) !== "") {
        seeded[def.id] = { fieldType: def.field_type, rawValue: String(aiValue) };
      }
    }
    if (Object.keys(seeded).length > 0) {
      if (onBulkSeed) {
        onBulkSeed(seeded);
      } else {
        // Fallback: per-field calls (legacy callers without onBulkSeed)
        for (const [idStr, v] of Object.entries(seeded)) {
          onChange(Number(idStr), v.fieldType, v.rawValue);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definitions]);

  if (!documentTypeId) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading metadata fields…
      </div>
    );
  }

  if (definitions.length === 0) {
    // DMS AI META.2 Flow A — zero-definition notice replaces the previous no-op.
    return (
      <DmsAiIntakeZeroDefinitionsNotice
        documentTypeId={documentTypeId}
        documentTypeName={documentTypeName ?? "this document type"}
        onDefinitionsCreated={() => {
          setReloadToken((t) => t + 1);
          onDefinitionsCreated?.(documentTypeId);
        }}
      />
    );
  }

  const groups = groupMetadataDefinitionsByFieldGroup(definitions);

  return (
    <div className="space-y-6">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Metadata Fields
      </h4>
      {groups.map(({ group, items }) => (
        <div key={group} className="space-y-4">
          {groups.length > 1 && (
            <h5 className="text-xs font-semibold text-muted-foreground border-b pb-1">{group}</h5>
          )}
          {items.map((def) => {
            const aiValue = extractedFieldsJson?.[def.field_code] as string | null | undefined;
            const confEntry = fieldConfidenceJson?.[def.field_code] as FieldConfidenceEntry | undefined;
            const currentValue = values[def.id]?.rawValue ?? aiValue ?? "";
            const reviewWarning = buildReviewWarning(def, currentValue, confEntry);
            const label = def.field_label_ar
              ? `${def.field_label_en} / ${def.field_label_ar}`
              : def.field_label_en;

            return (
              <div key={def.id} className="space-y-1">
                {def.field_section && (
                  <p className="text-[11px] text-muted-foreground font-medium">{def.field_section}</p>
                )}
                <DmsAiIntakeFieldRow
                  label={label}
                  required={def.is_required}
                  aiSuggestedValue={aiValue}
                  confidenceLabel={confEntry?.label}
                  confidenceScore={confEntry?.score}
                  sourceSnippet={confEntry?.source_snippet}
                  reviewWarning={reviewWarning}
                >
                  <MetadataFieldInput def={def} currentValue={currentValue} onChange={onChange} />
                </DmsAiIntakeFieldRow>
                {def.help_text_en && (
                  <p className="text-[11px] text-muted-foreground pl-0.5">{def.help_text_en}</p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
