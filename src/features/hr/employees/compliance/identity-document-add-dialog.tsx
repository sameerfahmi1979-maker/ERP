"use client";

import { useCallback, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText, FolderOpen, PenLine, Loader2, ChevronRight, Search,
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

type Step = "source" | "pick-dms" | "review";
type PickMode = "employee" | "dms";

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
  const [selectedDmsId, setSelectedDmsId] = useState<number | null>(null);
  const [prefillMeta, setPrefillMeta] = useState<{
    documentTitle: string;
    documentNo: string;
    prefillSource: string;
    warning?: string | null;
    linkedToEmployee?: boolean;
  } | null>(null);
  const [isPrefilling, startPrefill] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  const resetState = useCallback(() => {
    setStep("source");
    setPickMode("employee");
    setDmsSearch("");
    setForm(createEmptyIdentityDocumentForm());
    setFieldConfidence({});
    setSelectedDmsId(null);
    setPrefillMeta(null);
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

  const handleBack = () => {
    if (step === "pick-dms") {
      setStep("source");
      setSelectedDmsId(null);
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
    if (!selectedDmsId) {
      toast.error("Select a DMS document");
      return;
    }
    startPrefill(async () => {
      const result = await prefillIdentityDocumentFromDms(employeeId, selectedDmsId);
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

  const title =
    step === "source" ? "Add Legal Document"
    : step === "pick-dms" ? "Choose DMS Document"
    : "Review & Save Legal Document";

  const subtitle =
    step === "source"
      ? "Start from the employee Documents tab, search DMS, or enter manually"
    : step === "pick-dms"
      ? pickMode === "employee"
        ? "Documents already linked to this employee (Documents tab)"
        : "Search DMS for a document — it will be linked to this employee on save"
    : "Confirm all fields before saving to the compliance record";

  const showSubmit = step === "review";
  const showContinue = step === "pick-dms";
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
      isSubmitting={isSubmitting || isPrefilling}
      onSubmit={showSubmit ? handleSave : showContinue ? handleContinueFromDms : undefined}
      submitLabel={
        showSubmit ? "Save Legal Document"
        : showContinue ? (isPrefilling ? "Prefilling…" : "Continue")
        : undefined
      }
    >
      {step !== "source" && (
        <div className="mb-4">
          <Button type="button" variant="ghost" size="sm" className="-ml-2 h-8" onClick={handleBack} disabled={isPrefilling || isSubmitting}>
            ← Back
          </Button>
        </div>
      )}

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
              Check employee Documents first, then search DMS. Unlinked files are added to the employee on save.
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

      {step === "pick-dms" && (
        <div className="space-y-4">
          <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
            <Button
              type="button"
              size="sm"
              variant={pickMode === "employee" ? "default" : "ghost"}
              onClick={() => { setPickMode("employee"); setSelectedDmsId(null); }}
            >
              Employee Documents
            </Button>
            <Button
              type="button"
              size="sm"
              variant={pickMode === "dms" ? "default" : "ghost"}
              onClick={() => { setPickMode("dms"); setSelectedDmsId(null); }}
            >
              Search DMS
            </Button>
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
                  selected={selectedDmsId === doc.document_id}
                  onSelect={() => setSelectedDmsId(doc.document_id)}
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
                  selected={selectedDmsId === doc.id}
                  onSelect={() => setSelectedDmsId(doc.id)}
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
        </div>
      )}

      {step === "review" && (
        <IdentityDocumentFormFields
          form={form}
          setForm={setForm}
          docTypeOptions={docTypeOptions}
          fieldConfidence={fieldConfidence}
          prefillBanner={prefillMeta}
        />
      )}
    </ERPChildDialogForm>
  );
}

function EmployeeDocPickRow({
  doc,
  selected,
  onSelect,
}: {
  doc: DmsEntityDocumentRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/40"
      )}
    >
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
  onSelect,
}: {
  doc: AvailableDmsDocumentOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/40"
      )}
    >
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
