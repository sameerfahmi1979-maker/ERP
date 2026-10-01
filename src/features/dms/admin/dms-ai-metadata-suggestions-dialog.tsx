"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { loadedListValue } from "@/components/erp/table/loaded-list-view";

/**
 * DMS AI META.1 — AI Metadata Suggestions Review Dialog
 *
 * Presents AI-suggested metadata fields for admin review.
 * Admin can edit label/type/flags, deselect rows, then Accept to create.
 * Nothing is saved until "Accept & Create Selected" is clicked.
 * reasoning field is display-only and never sent to createDmsMetadataDefinition.
 */

import { useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Brain, CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createDmsMetadataDefinition } from "@/server/actions/dms/metadata-definitions";
import {
  approveMetadataSuggestions,
  rejectMetadataSuggestions,
  type MetadataSuggestionSource,
} from "@/server/actions/dms/metadata-suggestion-review";
import type { AiSuggestedField } from "@/lib/dms/metadata/ai-definition-builder";
import type { CreateDmsMetadataDefinitionInput } from "@/server/actions/dms/metadata-definitions";

// ── Types ─────────────────────────────────────────────────────────────────────

type RowStatus = "pending" | "saving" | "saved" | "failed";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: AiSuggestedField[];
  documentTypeId: number;
  documentTypeName: string;
  documentTypeCode?: string | null;
  existingCount: number;
  model: string | null;
  onCreated: () => void;
  /**
   * DMS AI META.2 — where this dialog instance was opened from.
   * "admin_manual" (default) preserves the original META.1 behavior exactly
   * (no finalize call, no re-extraction). "intake_review" and "review_queue"
   * are the new META.2 Flow A / Flow B entry points and trigger
   * approveMetadataSuggestions() after at least one field is created.
   */
  source?: MetadataSuggestionSource | "admin_manual";
  /** The document that triggered the suggestion workflow (Flow A/B only). */
  triggerDocumentId?: number | null;
  /** The dms_review_queue.id being reviewed (Flow B only). */
  reviewQueueItemId?: number | null;
  /**
   * DMS AI META.2 — when true, renders the review content inline (no
   * ERPChildDialogForm chrome) so it fits inside the review queue drawer.
   */
  embedded?: boolean;
  /** Called when the user rejects/dismisses the whole batch (embedded mode only). */
  onRejected?: () => void;
};

const AI_FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean (Yes/No)" },
  { value: "currency", label: "Currency" },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsAiMetadataSuggestionsDialog({
  open,
  onOpenChange,
  suggestions,
  documentTypeId,
  documentTypeName,
  documentTypeCode,
  existingCount,
  model,
  onCreated,
  source = "admin_manual",
  triggerDocumentId = null,
  reviewQueueItemId = null,
  embedded = false,
  onRejected,
}: Props) {
  const router = useRouter();
  const [isRejecting, setIsRejecting] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(suggestions.map((s) => s.field_code))
  );
  const [edits, setEdits] = useState<Map<string, Partial<AiSuggestedField>>>(() => new Map());
  const [rowStatus, setRowStatus] = useState<Map<string, RowStatus>>(() => new Map());
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(() => new Map());
  const [isSaving, setIsSaving] = useState(false);
  const flight = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Reset state when suggestions change (new dialog open)
  const resetState = useCallback(() => {
    setSelected(new Set(suggestions.map((s) => s.field_code)));
    setEdits(new Map());
    setRowStatus(new Map());
    setRowErrors(new Map());
    setIsSaving(false);
  }, [suggestions]);

  // This component is mounted once by its parent and reused across every AI
  // suggestion batch — the `suggestions` prop is populated *after* mount (the
  // parent fetches suggestions, then sets `open=true`), so the lazy useState
  // initializer above only ever sees an empty array. Without this, every row
  // renders unselected/disabled ("Accept & Create Selected (0)"). Adjusting
  // state during render (not in an effect) on the false→true transition of
  // `open` re-selects every row for the newly-loaded batch.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSelected(new Set(suggestions.map((s) => s.field_code)));
      setEdits(new Map());
      setRowStatus(new Map());
      setRowErrors(new Map());
      setIsSaving(false);
    }
  }

  const getMergedRow = useCallback(
    (s: AiSuggestedField): AiSuggestedField => {
      const override = edits.get(s.field_code);
      return override ? { ...s, ...override } : s;
    },
    [edits]
  );

  const updateEdit = useCallback(
    (fieldCode: string, patch: Partial<AiSuggestedField>) => {
      setEdits((prev) => {
        const next = new Map(prev);
        next.set(fieldCode, { ...(next.get(fieldCode) ?? {}), ...patch });
        return next;
      });
    },
    []
  );

  const toggleRow = useCallback((fieldCode: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fieldCode)) {
        next.delete(fieldCode);
      } else {
        next.add(fieldCode);
      }
      return next;
    });
  }, []);

  const allSelected = selected.size === suggestions.length;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(suggestions.map((s) => s.field_code)));
    }
  }, [allSelected, suggestions]);

  const selectedCount = selected.size;

  // Count how many selected rows are not yet saved
  const toSaveCount = useMemo(() => {
    let count = 0;
    for (const code of selected) {
      if (rowStatus.get(code) !== "saved") count++;
    }
    return count;
  }, [selected, rowStatus]);

  const hasFailed = useMemo(
    () => [...selected].some((code) => rowStatus.get(code) === "failed"),
    [selected, rowStatus]
  );

  const handleSubmit = useCallback(async () => {
    if (flight.current || uncertain || isSaving || selectedCount === 0) return;
    const invalid = suggestions.filter(s => selected.has(s.field_code) && rowStatus.get(s.field_code) !== "saved" && !getMergedRow(s).field_label_en.trim());
    if (invalid.length) { setBatchError(`Enter a field label before saving: ${invalid.map(s=>s.field_code).join(", ")}. Use the list filters to locate these fields.`); return; }
    flight.current = true;
    setBatchError(null);
    setIsSaving(true);
    let createdCount = 0;
    let failedCount = 0;

    for (const s of suggestions) {
      const code = s.field_code;

      // Skip deselected rows
      if (!selected.has(code)) continue;

      // Skip already-saved rows (partial retry safety)
      if (rowStatus.get(code) === "saved") continue;

      setRowStatus((prev) => new Map(prev).set(code, "saving"));

      const merged = getMergedRow(s);

      const payload: CreateDmsMetadataDefinitionInput = {
        document_type_id: documentTypeId,
        field_code: merged.field_code,
        field_label_en: merged.field_label_en,
        field_label_ar: null,
        field_type: merged.field_type as CreateDmsMetadataDefinitionInput["field_type"],
        is_required: merged.is_required,
        is_ai_extractable: merged.is_ai_extractable,
        ai_field_hint: merged.ai_field_hint || null,
        ai_example_values:
          merged.ai_example_values && merged.ai_example_values.length > 0
            ? merged.ai_example_values
            : null,
        sort_order: merged.sort_order,
        is_active: true,
        show_in_review: true,
        show_in_detail: true,
        show_in_list: false,
        show_in_upload_review: true,
        // All remaining optional fields default to null/false
        options_json: null,
        validation_json: null,
        field_group: null,
        field_section: null,
        is_searchable: false,
        is_filterable: false,
        is_unique: false,
        placeholder_en: null,
        placeholder_ar: null,
        help_text_en: null,
        help_text_ar: null,
        ai_possible_labels_en: null,
        ai_possible_labels_ar: null,
        ai_keywords: null,
        ai_negative_keywords: null,
        ai_expected_format: null,
        ai_confidence_threshold: null,
        normalization_rule: null,
        review_required_if_missing: false,
        review_required_if_low_confidence: false,
        metadata_version: 1,
        ai_rules_json: null,
        // DMS AI META.2 — mark provenance so admin can filter/badge these later.
        created_from_ai_suggestion: true,
        ai_suggestion_trigger_document_id: triggerDocumentId ?? null,
      };

      try {
        const result = await createDmsMetadataDefinition(payload);

        if (result.success) {
          setRowStatus((prev) => new Map(prev).set(code, "saved"));
          setRowErrors((prev) => {
            const next = new Map(prev);
            next.delete(code);
            return next;
          });
          createdCount++;
        } else {
          setRowStatus((prev) => new Map(prev).set(code, "failed"));
          setRowErrors((prev) =>
            new Map(prev).set(code, "Field creation was not accepted. Check its definition and your permissions.")
          );
          failedCount++;
        }
      } catch {
        setUncertain(true);
        setBatchError("A field creation could not be confirmed. Further writes are paused; close and reload the metadata definitions before trying again.");
        setRowStatus((prev) => new Map(prev).set(code, "failed"));
        setRowErrors((prev) =>
          new Map(prev).set(code, "Save outcome unknown. Check existing definitions before retrying.")
        );
        failedCount++;
        break;
      }
    }

    // DMS AI META.2 — finalize approval (resolve queue item, enqueue
    // re-extraction, audit log). Never runs for the original META.1
    // admin_manual path, preserving that behavior exactly.
    if (createdCount > 0 && (source === "intake_review" || source === "review_queue")) {
      try {
        const finalizeResult = await approveMetadataSuggestions({
          documentTypeId,
          documentTypeCode: documentTypeCode ?? null,
          triggerDocumentId,
          reviewQueueItemId,
          suggestionCount: suggestions.length,
          selectedCount,
          createdCount,
          model,
          source,
        });
        if (finalizeResult.success && finalizeResult.data?.reExtractionEnqueued) {
          toast.info("AI will re-extract metadata for the triggering document.");
        }
      } catch {
        // Non-fatal — definitions are already created; finalize is best-effort.
      }
    }

    setIsSaving(false);
    flight.current = false;

    if (failedCount === 0 && createdCount > 0) {
      toast.success(
        `${createdCount} field${createdCount !== 1 ? "s" : ""} created for ${documentTypeName}`
      );
      onCreated();
      router.refresh();
      onOpenChange(false);
    } else if (createdCount > 0 && failedCount > 0) {
      toast.warning(
        `${createdCount} created, ${failedCount} failed — review errors below`
      );
    } else if (failedCount > 0 && createdCount === 0) {
      toast.error("All fields failed to create — review errors below");
    }
  }, [
    isSaving,
    uncertain,
    selectedCount,
    suggestions,
    selected,
    rowStatus,
    getMergedRow,
    documentTypeId,
    documentTypeCode,
    documentTypeName,
    triggerDocumentId,
    reviewQueueItemId,
    source,
    model,
    onCreated,
    onOpenChange,
    router,
  ]);

  // DMS AI META.2 — reject/dismiss the whole batch without creating anything.
  const handleReject = useCallback(async () => {
    if (flight.current || uncertain || isRejecting || isSaving) return;
    flight.current = true;
    setIsRejecting(true);
    try {
      const result = await rejectMetadataSuggestions({
        documentTypeId,
        documentTypeCode: documentTypeCode ?? null,
        reviewQueueItemId,
        suggestionCount: suggestions.length,
        source: source === "admin_manual" ? "review_queue" : source,
      });
      if (result.success) {
        toast.info("AI suggestions dismissed. No fields were created.");
        onRejected?.();
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error("Dismissal was not accepted. Check your permissions.");
      }
    } catch {
      setUncertain(true);
      setBatchError("Dismissal could not be confirmed. Reload the review queue before trying again.");
    } finally {
      flight.current = false;
      setIsRejecting(false);
    }
  }, [
    isRejecting,
    uncertain,
    isSaving,
    documentTypeId,
    documentTypeCode,
    reviewQueueItemId,
    suggestions.length,
    source,
    onRejected,
    onOpenChange,
    router,
  ]);

  // Submit button label
  const submitLabel = hasFailed
    ? `Retry Failed (${[...selected].filter((c) => rowStatus.get(c) === "failed").length})`
    : `Accept & Create Selected (${toSaveCount})`;

  // A "Dismiss All" action only makes sense when there is a persistent review
  // queue item to resolve (Flow B, or a Flow A notice opened against an
  // already-generated Flow B batch). It only renders in embedded mode
  // (review queue drawer); the intake dialog's Cancel/X just closes without
  // changing the item's status, leaving it open for later.
  const showRejectAction = !!reviewQueueItemId;

  const bodyContent = (
      <div className="space-y-4">
        {batchError && <div role="alert" className="rounded-sm border border-destructive p-3 text-sm text-destructive">{batchError}</div>}
        <Button type="button" variant="outline" onClick={toggleAll} disabled={isSaving || isRejecting || uncertain}>{allSelected ? "Clear selection" : "Select all loaded suggestions"}</Button>
        {/* AI info + warning banner */}
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-800 dark:text-amber-300">
            AI suggestions require review before saving. Review the label, type, required setting, and AI hint before creating fields.
            {model && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                Model: <span className="font-mono">{model}</span>
              </span>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Brain className="h-3.5 w-3.5 text-purple-500" />
          <span>
            {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""} generated
            {existingCount > 0 && ` · ${existingCount} existing fields excluded`}
          </span>
        </div>

        {/* Suggestion table */}
        {suggestions.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No new fields could be generated for this document type.
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            {/* UI05 explicit table: authorized loaded rows, original permission-aware actions */}<ERPDataTable tableId="special.dms.admin.dms-ai-metadata-suggestions-dialog.3" data={suggestions} columns={[{id:"select",header:"Select",enableSorting:false,meta:{exportable:false},enableHiding:false,size:220,cell:({row:{original:s}})=>{
const isSelected = selected.has(s.field_code);
const status = rowStatus.get(s.field_code) ?? "pending";

const isSavingRow = status === "saving";
const isSaved = status === "saved";

return <><Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleRow(s.field_code)}
                            disabled={isSaved || isSavingRow}
                            aria-label={`Select ${s.field_code}`}
                          /></>;}},{id:"field_code",header:"Field code",accessorFn:item=>loadedListValue(item,"field_code"),meta:{filter:{type:"text"}},enableHiding:false,size:180,cell:({row:{original:s}})=>{






return <><code className="font-mono text-[10px] text-muted-foreground break-all">
                            {s.field_code}
                          </code></>;}},{id:"field_label_en",header:"Label / AI hint",accessorFn:item=>loadedListValue(item,"field_label_en"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:s}})=>{const merged = getMergedRow(s);
const isSelected = selected.has(s.field_code);
const status = rowStatus.get(s.field_code) ?? "pending";

const isSavingRow = status === "saving";
const isSaved = status === "saved";

return <><Input
                            value={merged.field_label_en}
                            onChange={(e) =>
                              updateEdit(s.field_code, { field_label_en: e.target.value })
                            }
                            disabled={isSaved || isSavingRow || !isSelected}
                            className="h-7 text-xs px-2"
                            aria-label={`Field label for ${s.field_code}`}
                          />{merged.ai_field_hint && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1 pl-0.5">
                              {merged.ai_field_hint}
                            </p>
                          )}</>;}},{id:"field_type",header:"Type",accessorFn:item=>loadedListValue(item,"field_type"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:s}})=>{const merged = getMergedRow(s);
const isSelected = selected.has(s.field_code);
const status = rowStatus.get(s.field_code) ?? "pending";

const isSavingRow = status === "saving";
const isSaved = status === "saved";

return <><select
                            value={merged.field_type}
                            onChange={(e) =>
                              updateEdit(s.field_code, {
                                field_type: e.target.value as AiSuggestedField["field_type"],
                              })
                            }
                            disabled={isSaved || isSavingRow || !isSelected}
                            className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            aria-label={`Field type for ${s.field_code}`}
                          >
                            {AI_FIELD_TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select></>;}},{id:"is_required",header:"Required",accessorFn:item=>loadedListValue(item,"is_required"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:s}})=>{const merged = getMergedRow(s);
const isSelected = selected.has(s.field_code);
const status = rowStatus.get(s.field_code) ?? "pending";

const isSavingRow = status === "saving";
const isSaved = status === "saved";

return <><Switch
                            checked={merged.is_required}
                            onCheckedChange={(v) =>
                              updateEdit(s.field_code, { is_required: v })
                            }
                            disabled={isSaved || isSavingRow || !isSelected}
                            aria-label={`Required for ${s.field_code}`}
                          /></>;}},{id:"is_ai_extractable",header:"AI",accessorFn:item=>loadedListValue(item,"is_ai_extractable"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:s}})=>{const merged = getMergedRow(s);
const isSelected = selected.has(s.field_code);
const status = rowStatus.get(s.field_code) ?? "pending";

const isSavingRow = status === "saving";
const isSaved = status === "saved";

return <><Switch
                            checked={merged.is_ai_extractable}
                            onCheckedChange={(v) =>
                              updateEdit(s.field_code, { is_ai_extractable: v })
                            }
                            disabled={isSaved || isSavingRow || !isSelected}
                            aria-label={`AI extractable for ${s.field_code}`}
                          /></>;}},{id:"status",header:"Status",enableSorting:false,meta:{exportable:false},enableHiding:true,size:180,cell:({row:{original:s}})=>{

const status = rowStatus.get(s.field_code) ?? "pending";
const errorMsg = rowErrors.get(s.field_code);
const isSavingRow = status === "saving";
const isSaved = status === "saved";
const isFailed = status === "failed";
return <>{isSavingRow && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto text-muted-foreground" />
                          )}{isSaved && (
                            <CheckCircle2 className="h-3.5 w-3.5 mx-auto text-green-600" />
                          )}{isFailed && (
                            <XCircle className="h-3.5 w-3.5 mx-auto text-red-600" />
                          )}<span className="sr-only">{status}</span>{s.reasoning && <p className="text-xs">AI: {s.reasoning}</p>}{isFailed && errorMsg && <p role="alert" className="text-destructive">{errorMsg}</p>}</>;}}]} enableRowSelection={false} searchPlaceholder="Search loaded records…" initialPageSize={10} />
          </div>
        )}

        {/* Footer count */}
        <div className="flex items-center justify-between text-xs">
          <span
            className={cn(
              "font-medium",
              selectedCount > 0 ? "text-green-700 dark:text-green-400" : "text-muted-foreground"
            )}
          >
            {selectedCount} of {suggestions.length} fields selected
          </span>
          {hasFailed && (
            <Badge variant="destructive" className="text-[10px]">
              {[...selected].filter((c) => rowStatus.get(c) === "failed").length} failed
            </Badge>
          )}
        </div>
      </div>
  );

  if (embedded) {
    return (
      <div className="space-y-4">
        {bodyContent}
        <div className="flex items-center justify-end gap-2 border-t pt-3">
          {showRejectAction && (
            <Button
              type="button"
              variant="outline"
              onClick={handleReject}
              disabled={isSaving || isRejecting || uncertain}
            >
              {isRejecting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Dismiss All
            </Button>
          )}
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving || isRejecting || uncertain || selectedCount === 0}
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            {submitLabel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={(o) => {
        if (!isSaving) {
          if (!o) resetState();
          onOpenChange(o);
        }
      }}
      title={`AI-Suggested Fields for ${documentTypeName}`}
      subtitle="Review and accept fields. Suggestions are not saved until you click Accept."
      icon={<Sparkles className="h-5 w-5 text-purple-500" />}
      mode="add"
      size="xl"
      isSubmitting={isSaving}
      submitDisabled={uncertain || isRejecting}
      onSubmit={handleSubmit}
      submitLabel={submitLabel}
    >
      {bodyContent}
    </ERPChildDialogForm>
  );
}
