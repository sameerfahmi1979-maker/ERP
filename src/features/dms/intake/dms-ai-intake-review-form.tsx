"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DmsAiIntakeFieldRow } from "./dms-ai-intake-field-row";
import { DmsAiIntakeMetadataSection } from "./dms-ai-intake-metadata-section";
import { DmsStandardFileNameField } from "./dms-standard-file-name-field";
import { ERPCombobox } from "@/components/erp/combobox/erp-combobox";
import { OwnerCompanySelect } from "@/components/erp/organizations/owner-company-select";
import { BranchSelect } from "@/components/erp/organizations/branch-select";
import { getDmsDocumentTypes } from "@/server/actions/dms/document-types";
import type { DmsDocumentTypeRow } from "@/server/actions/dms/document-types";
import type { IntakeSessionData } from "@/server/actions/dms/ai-intake";
import type { ERPComboboxOption } from "@/components/erp/combobox/types";
import { Loader2 } from "lucide-react";

const CONFIDENTIALITY_OPTIONS = [
  { value: "public", label: "Public" },
  { value: "internal", label: "Internal" },
  { value: "confidential", label: "Confidential" },
  { value: "hr", label: "HR Confidential" },
  { value: "legal", label: "Legal Confidential" },
  { value: "executive", label: "Executive" },
];

export type ReviewFormValues = {
  title: string;
  standardFileName: string;
  documentTypeId: number | null;
  categoryId: number | null;
  description: string;
  issueDate: string;
  expiryDate: string;
  confidentialityLevel: string;
  owningCompanyId: number | null;
  owningBranchId: number | null;
  metadataValues: Record<number, { fieldType: string; rawValue: string }>;
};

interface DmsAiIntakeReviewFormProps {
  session: IntakeSessionData;
  values: ReviewFormValues;
  onChange: (patch: Partial<ReviewFormValues>) => void;
  initialDocTypes?: DmsDocumentTypeRow[];
}

function stripExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

export function DmsAiIntakeReviewForm({
  session,
  values,
  onChange,
  initialDocTypes = [],
}: DmsAiIntakeReviewFormProps) {
  const aiResult = session.ai_result;
  const extractedFields = aiResult?.extracted_fields_json ?? {};
  const fieldConf = aiResult?.field_confidence_json ?? {};
  const [docTypes, setDocTypes] = useState<DmsDocumentTypeRow[]>(initialDocTypes);
  const [isLoadingTypes, setIsLoadingTypes] = useState(initialDocTypes.length === 0);

  useEffect(() => {
    if (initialDocTypes.length > 0) {
      setDocTypes(initialDocTypes);
      setIsLoadingTypes(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setIsLoadingTypes(true);
      const res = await getDmsDocumentTypes({ is_active: true });
      if (!cancelled && res.success && res.data) setDocTypes(res.data);
      if (!cancelled) setIsLoadingTypes(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDocTypes]);

  // Sync category when types load and AI suggested a type
  useEffect(() => {
    if (!values.documentTypeId || docTypes.length === 0) return;
    const selected = docTypes.find((t) => t.id === values.documentTypeId);
    if (selected && values.categoryId !== selected.category_id) {
      onChange({ categoryId: selected.category_id ?? null });
    }
  }, [docTypes, values.documentTypeId, values.categoryId, onChange]);

  // When document type changes, update categoryId
  const handleDocTypeChange = (typeId: number | null) => {
    const selected = docTypes.find((t) => t.id === typeId) ?? null;
    onChange({
      documentTypeId: typeId,
      categoryId: selected?.category_id ?? null,
    });
  };

  const docTypeOptions: ERPComboboxOption[] = docTypes.map((t) => ({
    value: String(t.id),
    label: t.name_en,
    code: t.type_code,
    description: t.category?.name_en ?? undefined,
  }));

  const confFor = (fieldCode: string) => {
    const c = fieldConf[fieldCode] as { label?: string; score?: number; source_snippet?: string | null } | undefined;
    return { label: c?.label ?? null, score: c?.score ?? null, source: c?.source_snippet ?? null };
  };

  const selectedDocType = docTypes.find((t) => t.id === values.documentTypeId) ?? null;

  return (
    <div className="space-y-5">
      {/* Document Classification */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Document Classification
        </h4>

        {/* Document Type */}
        <DmsAiIntakeFieldRow
          label="Document Type"
          required
          aiSuggestedValue={aiResult?.suggested_type?.name_en ?? null}
          confidenceLabel={aiResult?.classification_confidence}
          confidenceScore={aiResult?.classification_score}
        >
          {isLoadingTypes ? (
            <div className="h-9 flex items-center gap-2 text-sm text-muted-foreground px-3 border rounded-md">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading types…
            </div>
          ) : (
            <ERPCombobox
              value={values.documentTypeId != null ? String(values.documentTypeId) : null}
              onValueChange={(v) => handleDocTypeChange(v != null ? Number(v) : null)}
              options={docTypeOptions}
              placeholder="Select document type…"
              showCode
            />
          )}
        </DmsAiIntakeFieldRow>

        {/* Category (derived from type) */}
        {selectedDocType?.category && (
          <div className="space-y-1">
            <label className="text-sm font-medium">Category</label>
            <div className="h-9 flex items-center px-3 text-sm bg-muted rounded-md text-muted-foreground">
              {selectedDocType.category.name_en}
            </div>
          </div>
        )}
      </div>

      {/* Core Fields */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Document Details
        </h4>

        {/* Title */}
        <DmsAiIntakeFieldRow
          label="Title"
          required
          aiSuggestedValue={aiResult?.suggested_title}
          confidenceLabel={aiResult?.classification_confidence}
          confidenceScore={aiResult?.classification_score}
        >
          <Input
            value={values.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Document title…"
            className="text-sm"
          />
        </DmsAiIntakeFieldRow>

        <DmsStandardFileNameField
          session={session}
          values={values}
          docTypes={docTypes}
          onChange={onChange}
        />

        {/* Description */}
        <DmsAiIntakeFieldRow
          label="Description"
          aiSuggestedValue={aiResult?.suggested_description ?? null}
          confidenceLabel={aiResult?.classification_confidence ?? null}
        >
          <Textarea
            value={values.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Brief description…"
            rows={2}
            className="text-sm"
          />
        </DmsAiIntakeFieldRow>

        {/* Dates row */}
        <div className="grid grid-cols-2 gap-4">
          {(() => {
            const c = confFor("issue_date");
            return (
              <DmsAiIntakeFieldRow
                label="Issue Date"
                aiSuggestedValue={aiResult?.issue_date_suggestion ?? (extractedFields["issue_date"] as string | undefined) ?? null}
                confidenceLabel={c.label}
                confidenceScore={c.score}
                sourceSnippet={c.source}
              >
                <Input
                  type="date"
                  value={values.issueDate}
                  onChange={(e) => onChange({ issueDate: e.target.value })}
                  className="text-sm"
                />
              </DmsAiIntakeFieldRow>
            );
          })()}

          {(() => {
            const c = confFor("expiry_date");
            return (
              <DmsAiIntakeFieldRow
                label="Expiry Date"
                required={selectedDocType?.requires_expiry_tracking}
                aiSuggestedValue={aiResult?.expiry_date_suggestion ?? (extractedFields["expiry_date"] as string | undefined) ?? null}
                confidenceLabel={c.label}
                confidenceScore={c.score}
                sourceSnippet={c.source}
              >
                <Input
                  type="date"
                  value={values.expiryDate}
                  onChange={(e) => onChange({ expiryDate: e.target.value })}
                  className="text-sm"
                />
              </DmsAiIntakeFieldRow>
            );
          })()}
        </div>

        {/* Confidentiality */}
        {(() => {
          const c = confFor("confidentiality_level");
          return (
            <DmsAiIntakeFieldRow
              label="Confidentiality"
              aiSuggestedValue={(extractedFields["confidentiality_level"] as string | undefined) ?? null}
              confidenceLabel={c.label}
              confidenceScore={c.score}
            >
              <Select
                value={values.confidentialityLevel}
                onValueChange={(v) => { if (v !== null) onChange({ confidentialityLevel: v }); }}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFIDENTIALITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DmsAiIntakeFieldRow>
          );
        })()}
      </div>

      {/* Ownership */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Ownership
        </h4>

        <div className="space-y-1">
          <label className="text-sm font-medium">Owning Company</label>
          <OwnerCompanySelect
            value={values.owningCompanyId}
            onValueChange={(v) => onChange({ owningCompanyId: v, owningBranchId: null })}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Owning Branch</label>
          <BranchSelect
            value={values.owningBranchId}
            onValueChange={(v) => onChange({ owningBranchId: v })}
            ownerCompanyId={values.owningCompanyId}
            disabled={!values.owningCompanyId}
          />
        </div>
      </div>

      {/* Dynamic Metadata */}
      <DmsAiIntakeMetadataSection
        documentTypeId={values.documentTypeId}
        extractedFieldsJson={aiResult?.extracted_fields_json ?? null}
        fieldConfidenceJson={aiResult?.field_confidence_json ?? null}
        values={values.metadataValues}
        onChange={(defId, fieldType, rawValue) =>
          onChange({
            metadataValues: {
              ...values.metadataValues,
              [defId]: { fieldType, rawValue },
            },
          })
        }
      />
    </div>
  );
}

// Helper to build initial form values from AI result
export function buildInitialReviewValues(session: IntakeSessionData): ReviewFormValues {
  const aiResult = session.ai_result;
  const extractedFields = aiResult?.extracted_fields_json ?? {};

  return {
    title: aiResult?.suggested_title ?? stripExtension(session.original_filename),
    standardFileName: "",
    documentTypeId: aiResult?.suggested_document_type_id ?? null,
    categoryId: null,
    description: aiResult?.suggested_description ?? "",
    issueDate: aiResult?.issue_date_suggestion ?? (extractedFields["issue_date"] as string | undefined) ?? "",
    expiryDate: aiResult?.expiry_date_suggestion ?? (extractedFields["expiry_date"] as string | undefined) ?? "",
    confidentialityLevel: (extractedFields["confidentiality_level"] as string | undefined) ?? "internal",
    owningCompanyId: null,
    owningBranchId: null,
    metadataValues: {},
  };
}
