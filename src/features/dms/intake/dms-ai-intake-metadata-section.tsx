"use client";

import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DmsAiIntakeFieldRow } from "./dms-ai-intake-field-row";
import { getMetadataDefinitionsForType } from "@/server/actions/dms/document-metadata-values";
import type { DmsMetadataDefinitionRow } from "@/server/actions/dms/document-metadata-values";
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
  extractedFieldsJson: Record<string, unknown> | null;
  fieldConfidenceJson: Record<string, unknown> | null;
  values: Record<number, MetadataValue>;
  onChange: (definitionId: number, fieldType: string, rawValue: string) => void;
}

export function DmsAiIntakeMetadataSection({
  documentTypeId,
  extractedFieldsJson,
  fieldConfidenceJson,
  values,
  onChange,
}: DmsAiIntakeMetadataSectionProps) {
  const [definitions, setDefinitions] = useState<DmsMetadataDefinitionRow[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!documentTypeId) {
      setDefinitions([]);
      return;
    }
    startTransition(async () => {
      const result = await getMetadataDefinitionsForType(documentTypeId);
      if (result.success && result.data) {
        setDefinitions(result.data);
      } else {
        setDefinitions([]);
      }
    });
  }, [documentTypeId]);

  if (!documentTypeId) return null;

  if (isPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading metadata fields…
      </div>
    );
  }

  if (definitions.length === 0) return null;

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Metadata Fields
      </h4>
      {definitions.map((def) => {
        const aiValue = extractedFieldsJson?.[def.field_code] as string | null | undefined;
        const confEntry = (fieldConfidenceJson?.[def.field_code] as FieldConfidenceEntry | undefined);
        const currentValue = values[def.id]?.rawValue ?? aiValue ?? "";

        return (
          <DmsAiIntakeFieldRow
            key={def.id}
            label={def.label_en}
            required={def.is_required}
            aiSuggestedValue={aiValue}
            confidenceLabel={confEntry?.label}
            confidenceScore={confEntry?.score}
            sourceSnippet={confEntry?.source_snippet}
          >
            {def.field_type === "textarea" ? (
              <Textarea
                value={currentValue}
                onChange={(e) => onChange(def.id, def.field_type, e.target.value)}
                rows={2}
                className="text-sm"
                placeholder={def.label_en}
              />
            ) : (
              <Input
                type={
                  def.field_type === "date" ? "date"
                    : def.field_type === "number" || def.field_type === "decimal" ? "number"
                    : "text"
                }
                value={currentValue}
                onChange={(e) => onChange(def.id, def.field_type, e.target.value)}
                className="text-sm"
                placeholder={def.label_en}
              />
            )}
          </DmsAiIntakeFieldRow>
        );
      })}
    </div>
  );
}
