"use client";

/**
 * IdentityDocumentAddDialog — 3-step wizard for adding Legal Documents
 * (employee_identity_documents) from DMS.
 *
 * Multi-select behaviour (HR.DOCLINK.1 enhancement):
 *   - 1 document selected → existing prefill → review → save flow.
 *   - Multiple documents selected → batch create: prefill + save each,
 *     show a progress / results screen. No per-document review in batch mode.
 */

import { useCallback, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText, FolderOpen, PenLine, Loader2, ChevronRight, Search,
  CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DmsDocumentStatusBadge } from "@/features/dms/documents/dms-document-status-badge";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getDmsDocumentsByEntity,
  getAvailableDmsDocumentsForLink,
  type DmsEntityDocumentRow,
  type AvailableDmsDocumentOption,
} from "@/server/actions/dms/entity-documents";
import { createEmployeeIdentityDocument } from "@/server/actions/hr/compliance";
import { prefillIdentityDocumentFromDms } from "@/server/actions/hr/ai/identity-document-ai-fill";
import {
  createEmptyIdentityDocumentForm,
  identityDocumentFormToPayload,
  type IdentityDocumentFormState,
} from "@/lib/hr/compliance/identity-document-form";
import { IdentityDocumentFormFields } from "./identity-document-form-fields";
import type { HrIdentityDocTypeRow } from "@/server/actions/hr/settings";
import { cn } from "@/lib/utils";

type Step = "source" | "pick-dms" | "review" | "batch";
type PickMode = "employee" | "dms";

type BatchResultItem = {
  documentNo: string;
  title: string;
  status: "ok" | "error";
  error?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: number;
  docTypes: HrIdentityDocTypeRow[];
  onSaved: (opts?: { dmsLinkCreated?: boolean; hasDmsDocument?: boolean }) => void;
};

export function IdentityDocumentAddDialog({
  open,
  onOpenChange,
  employeeId,
  docTypes,
  onSaved,
}: Props) {
  const [step, setStep] = useState<Step>("source");
  const [pickMode, setPickMode] = useState<PickMode>("employee");
  const [dmsSearch, setDmsSearch] = useState("");
  const [form, setForm] = useState<IdentityDocumentFormState>(() => createEmptyIdentityDocumentForm());
  const [fieldConfidence, setFieldConfidence] = useState<Record<string, number>>({});
  // Multi-select: Set of selected document IDs
  const [selectedDmsIds, setSelectedDmsIds] = useState<Set<number>>(new Set());
  const [prefillMeta, setPrefillMeta] = useState<{
    documentTitle: string;
    documentNo: string;
    prefillSource: string;
    warning?: string | null;
    linkedToEmployee?: boolean;
  } | null>(null);
  const [isPrefilling, startPrefill] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  // Batch state
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [batchResults, setBatchResults] = useState<BatchResultItem[]>([]);
  const [batchDone, setBatchDone] = useState(false);

  const resetState = useCallback(() => {
    setStep("source");
    setPickMode("employee");
    setDmsSearch("");
    setForm(createEmptyIdentityDocumentForm());
    setFieldConfidence({});
    setSelectedDmsIds(new Set());
    setPrefillMeta(null);
    setBatchProgress(null);
    setBatchResults([]);
    setBatchDone(false);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) resetState();
    onOpenChange(next);
  }, [onOpenChange, resetState]);

  const { data: employeeDocs, isLoading: employeeDocsLoading } = useQuery({
    queryKey: queryKeys.dms.entityDocuments("employee", employeeId),
    queryFn: async () => {
      const r = await getDmsDocumentsByEntity("employee", employeeId);
      return r.success ? r.data ?? [] : [];
    },
    enabled: open && step === "pick-dms" && pickMode === "employee",
  });

  const { data: libraryDocs, isLoading: libraryDocsLoading } = useQuery({
    queryKey: queryKeys.dms.attachableDocuments("employee", employeeId, dmsSearch),
    queryFn: async () => {
      const r = await getAvailableDmsDocumentsForLink("employee", employeeId, dmsSearch);
      return r.success ? r.data ?? [] : [];
    },
    enabled: open && step === "pick-dms" && pickMode === "dms",
  });

  const docTypeOptions = docTypes.map((t) => ({ value: t.id, label: t.name_en }));

  const toggleDoc = (id: number) => {
    setSelectedDmsIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBack = () => {
    if (step === "pick-dms") {
      setStep("source");
      setSelectedDmsIds(new Set());
      setPickMode("employee");
      setDmsSearch("");
    } else if (step === "review") {
      if (form.dms_document_id) {
        setStep("pick-dms");
      } else {
        setStep("source");
      }
      setPrefillMeta(null);
      setFieldConfidence({});
    }
  };

  const handleManual = () => {
    setForm(createEmptyIdentityDocumentForm());
    setPrefillMeta(null);
    setFieldConfidence({});
    setStep("review");
  };

  const handleDmsSource = () => {
    setPickMode("employee");
    setStep("pick-dms");
  };

  const handleContinueFromDms = () => {
    if (selectedDmsIds.size === 0) {
      toast.error("Select at least one document");
      return;
    }

    const ids = [...selectedDmsIds];

    if (ids.length === 1) {
      // Single document: existing prefill → review flow
      startPrefill(async () => {
        const result = await prefillIdentityDocumentFromDms(employeeId, ids[0]);
        if (!result.success) {
          toast.error(result.error ?? "Failed to prefill from document");
          return;
        }
        setForm(result.data.form);
        setFieldConfidence(result.data.fieldConfidence);
        setPrefillMeta({
          documentTitle: result.data.sourceDocument.title,
          documentNo: result.data.sourceDocument.document_no,
          prefillSource: result.data.prefillSource,
          warning: result.data.warning,
          linkedToEmployee: result.data.linkedToEmployee,
        });
        setStep("review");
      });
    } else {
      // Multiple documents: batch create flow
      setStep("batch");
      setBatchProgress({ current: 0, total: ids.length });
      setBatchResults([]);
      setBatchDone(false);

      const allDocs = [
        ...(employeeDocs ?? []).map((d) => ({ id: d.document_id, title: d.title, no: d.document_no })),
        ...(libraryDocs ?? []).map((d) => ({ id: d.id, title: d.title, no: d.document_no })),
      ];

      startSubmit(async () => {
        const results: BatchResultItem[] = [];
        let savedCount = 0;
        let dmsLinked = false;

        for (let i = 0; i < ids.length; i++) {
          const docId = ids[i];
          setBatchProgress({ current: i + 1, total: ids.length });

          const docInfo = allDocs.find((d) => d.id === docId);
          const docLabel = docInfo?.title ?? `Document ${docId}`;
          const docNo = docInfo?.no ?? `#${docId}`;

          try {
            const prefillRes = await prefillIdentityDocumentFromDms(employeeId, docId);
            if (!prefillRes.success) {
              results.push({ documentNo: docNo, title: docLabel, status: "error", error: prefillRes.error ?? "Prefill failed" });
              continue;
            }

            const filledForm = prefillRes.data.form;

            // Validate
            if (!filledForm.document_type_id) {
              results.push({ documentNo: docNo, title: docLabel, status: "error", error: "Could not determine document type — add manually" });
              continue;
            }
            if (!filledForm.document_number?.trim()) {
              results.push({ documentNo: docNo, title: docLabel, status: "error", error: "Document number not found — add manually" });
              continue;
            }

            const payload = identityDocumentFormToPayload(filledForm);
            const saveRes = await createEmployeeIdentityDocument(employeeId, payload);
            if (!saveRes.success) {
              results.push({ documentNo: docNo, title: docLabel, status: "error", error: saveRes.error ?? "Save failed" });
              continue;
            }

            if (saveRes.data?.dmsLinkCreated) dmsLinked = true;
            savedCount++;
            results.push({ documentNo: docNo, title: docLabel, status: "ok" });
          } catch (err) {
            results.push({ documentNo: docNo, title: docLabel, status: "error", error: String(err) });
          }
        }

        setBatchResults(results);
        setBatchDone(true);

        if (savedCount > 0) {
          onSaved({ dmsLinkCreated: dmsLinked, hasDmsDocument: true });
          toast.success(
            savedCount === ids.length
              ? `${savedCount} Legal Document${savedCount !== 1 ? "s" : ""} created`
              : `${savedCount} of ${ids.length} Legal Documents created`
          );
        }
      });
    }
  };

  const handleSave = () => {
    if (!form.document_type_id) {
      toast.error("Document type is required");
      return;
    }
    if (!form.document_number.trim()) {
      toast.error("Document number is required");
      return;
    }
    startSubmit(async () => {
      const payload = identityDocumentFormToPayload(form);
      const result = await createEmployeeIdentityDocument(employeeId, payload);
      if (result.success) {
        if (result.data?.dmsLinkCreated) {
          toast.success("Legal document saved and linked to employee Documents tab");
        } else {
          toast.success("Legal document saved");
        }
        onSaved({ dmsLinkCreated: result.data?.dmsLinkCreated, hasDmsDocument: !!form.dms_document_id });
        handleOpenChange(false);
      } else {
        toast.error(result.error ?? "Failed to save document");
      }
    });
  };

  const selectedCount = selectedDmsIds.size;

  const title =
    step === "source" ? "Add Legal Document"
    : step === "pick-dms" ? "Choose DMS Documents"
    : step === "batch" ? "Creating Legal Documents…"
    : "Review & Save Legal Document";

  const subtitle =
    step === "source"
      ? "Start from the employee Documents tab, search DMS, or enter manually"
    : step === "pick-dms"
      ? pickMode === "employee"
        ? "Tick one or more documents — each creates its own Legal Document record"
        : "Search DMS — tick one or more documents to link and process"
    : step === "batch"
      ? batchDone
        ? `Processed ${selectedCount} document${selectedCount !== 1 ? "s" : ""}`
        : "Running AI prefill and saving each record…"
    : "Confirm all fields before saving to the compliance record";

  const showSubmit = step === "review";
  const showContinue = step === "pick-dms";
  const showClose = step === "batch" && batchDone;
  const docsLoading = pickMode === "employee" ? employeeDocsLoading : libraryDocsLoading;

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      subtitle={subtitle}
      icon={<FileText className="h-5 w-5" />}
      mode="add"
      size="xl"
      isSubmitting={(isSubmitting && step !== "batch") || isPrefilling}
      onSubmit={
        showSubmit ? handleSave
        : showContinue ? handleContinueFromDms
        : showClose ? () => handleOpenChange(false)
        : undefined
      }
      submitLabel={
        showSubmit ? "Save Legal Document"
        : showContinue
          ? isPrefilling
            ? "Prefilling…"
            : selectedCount > 1
              ? `Create ${selectedCount} Records`
              : "Continue"
        : showClose ? "Done"
        : undefined
      }
      cancelLabel={step === "batch" && !batchDone ? undefined : "Cancel"}
    >
      {(step === "pick-dms" || step === "review") && (
        <div className="mb-4">
          <Button type="button" variant="ghost" size="sm" className="-ml-2 h-8" onClick={handleBack} disabled={isPrefilling || isSubmitting}>
            ← Back
          </Button>
        </div>
      )}

      {/* ── Step: Source ─────────────────────────────────────────── */}
      {step === "source" && (
        <div className="grid grid-cols-12 gap-4">
          <button
            type="button"
            onClick={handleDmsSource}
            className={cn(
              "col-span-12 sm:col-span-6 flex flex-col items-start gap-2 rounded-lg border-2 border-dashed p-6 text-left",
              "hover:border-primary hover:bg-primary/5 transition-colors"
            )}
          >
            <FolderOpen className="h-8 w-8 text-primary" />
            <span className="font-semibold">From DMS Document</span>
            <span className="text-sm text-muted-foreground">
              Select one or multiple documents. Each creates its own Legal Document record, pre-filled by AI.
            </span>
            <span className="text-xs text-primary flex items-center gap-1 mt-1">
              Recommended <ChevronRight className="h-3 w-3" />
            </span>
          </button>
          <button
            type="button"
            onClick={handleManual}
            className={cn(
              "col-span-12 sm:col-span-6 flex flex-col items-start gap-2 rounded-lg border p-6 text-left",
              "hover:border-muted-foreground/40 hover:bg-muted/30 transition-colors"
            )}
          >
            <PenLine className="h-8 w-8 text-muted-foreground" />
            <span className="font-semibold">Enter Manually</span>
            <span className="text-sm text-muted-foreground">
              Type document details without linking to DMS.
            </span>
          </button>
        </div>
      )}

      {/* ── Step: Pick DMS (multi-select) ────────────────────────── */}
      {step === "pick-dms" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
              <Button
                type="button"
                size="sm"
                variant={pickMode === "employee" ? "default" : "ghost"}
                onClick={() => { setPickMode("employee"); setSelectedDmsIds(new Set()); }}
              >
                Employee Documents
              </Button>
              <Button
                type="button"
                size="sm"
                variant={pickMode === "dms" ? "default" : "ghost"}
                onClick={() => { setPickMode("dms"); setSelectedDmsIds(new Set()); }}
              >
                Search DMS
              </Button>
            </div>
            {selectedCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-md bg-primary/10 text-primary text-xs px-2.5 py-1.5 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {selectedCount} selected
                {selectedCount > 1 && (
                  <span className="text-[11px] font-normal ml-0.5">→ {selectedCount} records will be created</span>
                )}
              </div>
            )}
          </div>

          {pickMode === "dms" && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={dmsSearch}
                onChange={(e) => setDmsSearch(e.target.value)}
                placeholder="Search by document no or title..."
                className="pl-9"
              />
            </div>
          )}

          {docsLoading && (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {!docsLoading && pickMode === "employee" && (!employeeDocs || employeeDocs.length === 0) && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              <p>No documents on this employee&apos;s Documents tab yet.</p>
              <p className="mt-2">Switch to <strong>Search DMS</strong> to pick an existing file — it will be linked to this employee when you save.</p>
            </div>
          )}

          {!docsLoading && pickMode === "employee" && employeeDocs && employeeDocs.length > 0 && (
            <div className="space-y-2 max-h-[360px] overflow-y-auto">
              {employeeDocs.map((doc) => (
                <EmployeeDocPickRow
                  key={doc.document_id}
                  doc={doc}
                  selected={selectedDmsIds.has(doc.document_id)}
                  onToggle={() => toggleDoc(doc.document_id)}
                />
              ))}
            </div>
          )}

          {!docsLoading && pickMode === "dms" && (!libraryDocs || libraryDocs.length === 0) && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {dmsSearch.trim() ? "No matching DMS documents found." : "Type to search DMS documents not yet on this employee."}
            </div>
          )}

          {!docsLoading && pickMode === "dms" && libraryDocs && libraryDocs.length > 0 && (
            <div className="space-y-2 max-h-[360px] overflow-y-auto">
              {libraryDocs.map((doc) => (
                <LibraryDocPickRow
                  key={doc.id}
                  doc={doc}
                  selected={selectedDmsIds.has(doc.id)}
                  onToggle={() => toggleDoc(doc.id)}
                />
              ))}
            </div>
          )}

          {isPrefilling && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Running AI prefill…
            </div>
          )}

          {selectedCount > 1 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
              <strong>{selectedCount} documents selected.</strong> Each will be AI-prefilled and saved as its own Legal Document record automatically — no per-document review step.
              You can edit individual records afterwards.
            </p>
          )}
        </div>
      )}

      {/* ── Step: Review (single doc) ────────────────────────────── */}
      {step === "review" && (
        <IdentityDocumentFormFields
          form={form}
          setForm={setForm}
          docTypeOptions={docTypeOptions}
          fieldConfidence={fieldConfidence}
          prefillBanner={prefillMeta}
        />
      )}

      {/* ── Step: Batch progress/results ─────────────────────────── */}
      {step === "batch" && (
        <div className="space-y-4">
          {!batchDone && batchProgress && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Processing {batchProgress.current} of {batchProgress.total}…
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {batchResults.length > 0 && (
            <div className="space-y-2 max-h-[360px] overflow-y-auto">
              {batchResults.map((r, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
                    r.status === "ok"
                      ? "border-green-200 bg-green-50/60 dark:bg-green-950/20"
                      : "border-red-200 bg-red-50/60 dark:bg-red-950/20"
                  )}
                >
                  {r.status === "ok"
                    ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                    : <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />}
                  <div className="min-w-0 flex-1">
                    <span className="font-medium truncate block">{r.title}</span>
                    <span className="text-xs text-muted-foreground">{r.documentNo}</span>
                    {r.status === "error" && (
                      <div className="flex items-start gap-1 mt-1 text-xs text-red-600">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        {r.error}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {batchDone && (
            <p className="text-xs text-muted-foreground">
              {batchResults.filter((r) => r.status === "ok").length} created · {batchResults.filter((r) => r.status === "error").length} failed.
              {batchResults.some((r) => r.status === "error") && " Failed records could not be auto-filled — add them manually using the single-document flow."}
            </p>
          )}
        </div>
      )}
    </ERPChildDialogForm>
  );
}

// ── Row components ────────────────────────────────────────────────────────────

function TickBox({ selected }: { selected: boolean }) {
  return (
    <div
      className={cn(
        "mt-0.5 h-4 w-4 shrink-0 rounded border transition-colors flex items-center justify-center",
        selected ? "border-primary bg-primary" : "border-border bg-background"
      )}
    >
      {selected && (
        <svg className="h-2.5 w-2.5 text-primary-foreground" fill="none" viewBox="0 0 12 12">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function EmployeeDocPickRow({
  doc,
  selected,
  onToggle,
}: {
  doc: DmsEntityDocumentRow;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "hover:bg-muted/40 border-border"
      )}
    >
      <TickBox selected={selected} />
      <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{doc.title || doc.document_no}</span>
          <DmsDocumentStatusBadge status={doc.status} />
          <Badge variant="secondary" className="text-xs">On employee file</Badge>
          {doc.document_type_name && (
            <Badge variant="outline" className="text-xs">{doc.document_type_name}</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {doc.document_no}
          {doc.expiry_date && (
            <span className="ml-2">· Expires {new Date(doc.expiry_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function LibraryDocPickRow({
  doc,
  selected,
  onToggle,
}: {
  doc: AvailableDmsDocumentOption;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "hover:bg-muted/40 border-border"
      )}
    >
      <TickBox selected={selected} />
      <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{doc.title || doc.document_no}</span>
          <DmsDocumentStatusBadge status={doc.status} />
          <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50">
            Will link on save
          </Badge>
          {doc.document_type_name && (
            <Badge variant="outline" className="text-xs">{doc.document_type_name}</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {doc.document_no}
          {doc.expiry_date && (
            <span className="ml-2">· Expires {new Date(doc.expiry_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
          )}
        </div>
      </div>
    </button>
  );
}
