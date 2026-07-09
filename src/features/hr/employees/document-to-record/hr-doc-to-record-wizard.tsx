"use client";

/**
 * HR.14B — Document-to-Record Wizard
 *
 * A shared wizard used from Employee Profile → Compliance tab sections
 * to create identity documents, medical insurance, or dependent records
 * from already-uploaded DMS documents.
 *
 * Supported target types:
 *   identity_document | medical_insurance | dependent
 *
 * Flow:
 *   Step 1 (pick)   — Select existing DMS document(s)
 *   Step 2 (review) — Review & edit draft fields extracted from DMS
 *   (save)          — Calls the appropriate server action
 */

import { useState, useTransition, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileStack, CheckCircle2, AlertCircle, Clock, Search,
  FileText, Heart, Users, Link2, ShieldAlert,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { CountrySelect } from "@/components/erp/geography/country-select";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query/query-keys";
import { invalidateDmsEntityDocuments } from "@/lib/query/invalidation";
import type { Hr14bTargetType, HrDmsDocForRecord } from "@/lib/hr/document-to-record/types";
import {
  getDmsDocumentsForEmployeeRecord,
  aggregateIdentityDocumentFromDms,
  createIdentityDocumentFromDms,
  aggregateMedicalInsuranceFromDms,
  createMedicalInsuranceFromDms,
  aggregateDependentFromDms,
  createDependentFromDms,
} from "@/server/actions/hr/document-to-record";
import type {
  HrIdentityDocDraft,
  HrInsuranceDraft,
  HrDependentDraft,
} from "@/lib/hr/document-to-record/types";
import {
  listHrIdentityDocumentTypes,
  listHrRelationshipTypes,
} from "@/server/actions/hr/settings";
import type { HrIdentityDocTypeRow, HrSettingsRow } from "@/server/actions/hr/settings";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  employeeId: number;
  targetType: Hr14bTargetType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onChildOpen?: (open: boolean) => void;
};

type Step = "pick" | "review";

// ─────────────────────────────────────────────────────────────────────────────
// Wizard title / icon helpers
// ─────────────────────────────────────────────────────────────────────────────

function wizardTitle(targetType: Hr14bTargetType) {
  switch (targetType) {
    case "identity_document": return "Add Identity Document from DMS";
    case "medical_insurance": return "Add Medical Insurance from DMS";
    case "dependent": return "Add Dependent from DMS";
  }
}

function wizardIcon(targetType: Hr14bTargetType) {
  switch (targetType) {
    case "identity_document": return <FileText className="h-5 w-5" />;
    case "medical_insurance": return <Heart className="h-5 w-5" />;
    case "dependent": return <Users className="h-5 w-5" />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Document picker step (shared for all types)
// ─────────────────────────────────────────────────────────────────────────────

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

function PickerStep({
  employeeId,
  targetType,
  selectedIds,
  onToggle,
  onNext,
  isAggregating,
}: {
  employeeId: number;
  targetType: Hr14bTargetType;
  selectedIds: number[];
  onToggle: (doc: HrDmsDocForRecord) => void;
  onNext: () => void;
  isAggregating: boolean;
}) {
  const [search, setSearch] = useState("");
  const [accessError, setAccessError] = useState<string | null>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["hr14b", "dms-docs-for-record", employeeId, targetType, search],
    queryFn: async () => {
      const r = await getDmsDocumentsForEmployeeRecord(employeeId, { search, targetType, limit: 60 });
      if (!r.success) {
        setAccessError(r.error ?? "Failed to load documents");
        return [];
      }
      setAccessError(null);
      return r.data ?? [];
    },
    staleTime: 30_000,
  });

  const allowMultiple = targetType === "dependent";

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          className="pl-8 h-8 text-sm"
          placeholder="Search documents by title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {allowMultiple && (
        <p className="text-[11px] text-muted-foreground">
          You may select multiple documents — their data will be merged.
        </p>
      )}

      {isLoading && <Skeleton className="h-40 w-full" />}

      {!isLoading && accessError && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/50 bg-destructive/10 text-sm text-destructive">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{accessError}</span>
        </div>
      )}

      {!isLoading && !accessError && docs.length === 0 && (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
          No documents found. Upload documents in the DMS module first.
        </div>
      )}

      {!isLoading && !accessError && docs.length > 0 && (
        <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
          {docs.map((doc) => {
            const selected = selectedIds.includes(doc.id);
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => onToggle(doc)}
                className={cn(
                  "w-full flex items-start gap-3 p-2.5 rounded-lg border text-left transition-colors",
                  selected
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                    : "border-border bg-card hover:bg-muted/40"
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {selected ? (
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium truncate">{doc.title}</span>
                    {doc.is_linked_to_employee && (
                      <Badge variant="secondary" className="text-[10px] flex items-center gap-0.5">
                        <Link2 className="h-2.5 w-2.5" /> Linked
                      </Badge>
                    )}
                    {doc.has_extraction ? (
                      <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> AI ready
                      </Badge>
                    ) : doc.has_ocr ? (
                      <Badge variant="outline" className="text-[10px] text-yellow-700 border-yellow-300">
                        <Clock className="h-2.5 w-2.5 mr-0.5" /> OCR only
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> No extraction
                      </Badge>
                    )}
                  </div>
                  {doc.document_type_name && (
                    <span className="text-[10px] text-muted-foreground">{doc.document_type_name}</span>
                  )}
                  {doc.expiry_date && (
                    <span
                      className={cn(
                        "text-[10px] ml-2",
                        isExpired(doc.expiry_date)
                          ? "text-red-600 dark:text-red-400 font-medium"
                          : "text-muted-foreground"
                      )}
                    >
                      {isExpired(doc.expiry_date) ? "Expired" : "Exp"}: {doc.expiry_date}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button
          size="sm"
          onClick={onNext}
          disabled={selectedIds.length === 0 || isAggregating || !!accessError}
        >
          {isAggregating ? "Loading..." : "Review Draft"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Identity Document Review Step
// ─────────────────────────────────────────────────────────────────────────────

function IdentityDocReview({
  draft,
  onSubmit,
  onBack,
  isSubmitting,
}: {
  draft: HrIdentityDocDraft;
  onSubmit: (form: HrIdentityDocDraft) => void;
  onBack: () => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<HrIdentityDocDraft>({ ...draft });

  const { data: docTypes } = useQuery({
    queryKey: queryKeys.hr.identityDocumentTypes(),
    queryFn: async () => {
      const r = await listHrIdentityDocumentTypes({ is_active: true, page: 1, page_size: 100 });
      return r.success && r.data ? (r.data.data as HrIdentityDocTypeRow[]) : [];
    },
  });

  const docTypeOptions = (docTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }));

  const isValid = !!form.document_type_id && form.document_number.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/30 border px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          Source: <span className="font-medium text-foreground">{draft.documentTitle}</span>
        </p>
        {!draft.document_type_id && (
          <p className="text-[11px] text-yellow-700 dark:text-yellow-400 mt-0.5">
            Document type could not be resolved automatically — please select manually.
          </p>
        )}
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">
            Document Type <span className="text-destructive">*</span>
          </Label>
          <ERPCombobox
            value={form.document_type_id}
            onValueChange={(v) => setForm((p) => ({ ...p, document_type_id: v == null ? null : Number(v) }))}
            options={docTypeOptions}
            placeholder="Select document type..."
            required
          />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">
            Document Number <span className="text-destructive">*</span>
          </Label>
          <Input
            value={form.document_number}
            onChange={(e) => setForm((p) => ({ ...p, document_number: e.target.value }))}
            className="h-8 text-sm"
            placeholder="e.g. A12345678"
          />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium mb-1 block">Issue Date</Label>
          <Input
            type="date"
            value={form.issue_date}
            onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium mb-1 block">Expiry Date</Label>
          <Input
            type="date"
            value={form.expiry_date}
            onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium mb-1 block">Issuing Country</Label>
          <CountrySelect
            value={form.issue_country_id}
            onValueChange={(v) => setForm((p) => ({ ...p, issue_country_id: v }))}
          />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">Issuing Authority</Label>
          <Input
            value={form.issuing_authority}
            onChange={(e) => setForm((p) => ({ ...p, issuing_authority: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">Profession on Document</Label>
          <Input
            value={form.profession_on_document}
            onChange={(e) => setForm((p) => ({ ...p, profession_on_document: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
        {/* Special fields — only shown if relevant */}
        {(form.uid_number || form.document_type_code === "EMIRATES_ID") && (
          <>
            <div className="col-span-6">
              <Label className="text-xs font-medium mb-1 block">UID Number</Label>
              <Input value={form.uid_number} onChange={(e) => setForm((p) => ({ ...p, uid_number: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="col-span-6">
              <Label className="text-xs font-medium mb-1 block">EID Application No.</Label>
              <Input value={form.emirates_id_application_no} onChange={(e) => setForm((p) => ({ ...p, emirates_id_application_no: e.target.value }))} className="h-8 text-sm" />
            </div>
          </>
        )}
        {(form.visa_file_number || form.document_type_code === "RESIDENCE_VISA") && (
          <div className="col-span-6">
            <Label className="text-xs font-medium mb-1 block">Visa File Number</Label>
            <Input value={form.visa_file_number} onChange={(e) => setForm((p) => ({ ...p, visa_file_number: e.target.value }))} className="h-8 text-sm" />
          </div>
        )}
        {(form.labour_card_number || form.work_permit_number) && (
          <>
            <div className="col-span-6">
              <Label className="text-xs font-medium mb-1 block">Labour Card Number</Label>
              <Input value={form.labour_card_number} onChange={(e) => setForm((p) => ({ ...p, labour_card_number: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="col-span-6">
              <Label className="text-xs font-medium mb-1 block">Work Permit Number</Label>
              <Input value={form.work_permit_number} onChange={(e) => setForm((p) => ({ ...p, work_permit_number: e.target.value }))} className="h-8 text-sm" />
            </div>
          </>
        )}
        <div className="col-span-12">
          <Label className="text-xs font-medium mb-1 block">Notes</Label>
          <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="h-8 text-sm" />
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" size="sm" onClick={onBack}>Back</Button>
        <Button size="sm" onClick={() => onSubmit(form)} disabled={!isValid || isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Identity Document"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Medical Insurance Review Step
// ─────────────────────────────────────────────────────────────────────────────

function InsuranceReview({
  draft,
  onSubmit,
  onBack,
  isSubmitting,
}: {
  draft: HrInsuranceDraft;
  onSubmit: (form: HrInsuranceDraft) => void;
  onBack: () => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<HrInsuranceDraft>({ ...draft });
  const isValid = form.insurance_provider.trim().length > 0 && form.policy_number.trim().length > 0 && form.expiry_date.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/30 border px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          Source: <span className="font-medium text-foreground">{draft.documentTitle}</span>
        </p>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">
            Insurance Provider <span className="text-destructive">*</span>
          </Label>
          <Input value={form.insurance_provider} onChange={(e) => setForm((p) => ({ ...p, insurance_provider: e.target.value }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">TPA</Label>
          <Input value={form.tpa} onChange={(e) => setForm((p) => ({ ...p, tpa: e.target.value }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">
            Policy Number <span className="text-destructive">*</span>
          </Label>
          <Input value={form.policy_number} onChange={(e) => setForm((p) => ({ ...p, policy_number: e.target.value }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">Insurance Card Number</Label>
          <Input value={form.insurance_card_number} onChange={(e) => setForm((p) => ({ ...p, insurance_card_number: e.target.value }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">Network / Class</Label>
          <Input value={form.network_class} onChange={(e) => setForm((p) => ({ ...p, network_class: e.target.value }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-3">
          <Label className="text-xs font-medium mb-1 block">Issue Date</Label>
          <Input type="date" value={form.issue_date} onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-3">
          <Label className="text-xs font-medium mb-1 block">
            Expiry Date <span className="text-destructive">*</span>
          </Label>
          <Input type="date" value={form.expiry_date} onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-4 flex items-center gap-2 pt-5">
          <Switch checked={form.employee_covered} onCheckedChange={(v) => setForm((p) => ({ ...p, employee_covered: v }))} />
          <Label className="text-xs">Employee Covered</Label>
        </div>
        <div className="col-span-4 flex items-center gap-2 pt-5">
          <Switch checked={form.dependent_coverage_included} onCheckedChange={(v) => setForm((p) => ({ ...p, dependent_coverage_included: v }))} />
          <Label className="text-xs">Dependent Coverage</Label>
        </div>
        <div className="col-span-4">
          <Label className="text-xs font-medium mb-1 block">Dependents Covered</Label>
          <Input type="number" min={0} value={form.dependent_count_covered ?? ""} onChange={(e) => setForm((p) => ({ ...p, dependent_count_covered: e.target.value ? parseInt(e.target.value) : null }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-12">
          <Label className="text-xs font-medium mb-1 block">Notes</Label>
          <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="h-8 text-sm" />
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" size="sm" onClick={onBack}>Back</Button>
        <Button size="sm" onClick={() => onSubmit(form)} disabled={!isValid || isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Medical Insurance"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependent Review Step
// ─────────────────────────────────────────────────────────────────────────────

function DependentReview({
  draft,
  onSubmit,
  onBack,
  isSubmitting,
}: {
  draft: HrDependentDraft;
  onSubmit: (form: HrDependentDraft) => void;
  onBack: () => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<HrDependentDraft>({ ...draft });

  const { data: relTypes } = useQuery({
    queryKey: queryKeys.hr.relationshipTypes(),
    queryFn: async () => {
      const r = await listHrRelationshipTypes({ is_active: true, page: 1, page_size: 100 });
      return r.success && r.data ? (r.data.data as HrSettingsRow[]) : [];
    },
  });

  const relTypeOptions = (relTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }));

  const isValid = form.dependent_name_en.trim().length > 0 && !!form.relationship_type_id;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/30 border px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          Sources: <span className="font-medium text-foreground">{draft.documentTitles.join(", ")}</span>
        </p>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">
            Name (English) <span className="text-destructive">*</span>
          </Label>
          <Input value={form.dependent_name_en} onChange={(e) => setForm((p) => ({ ...p, dependent_name_en: e.target.value }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">Name (Arabic)</Label>
          <Input value={form.dependent_name_ar} onChange={(e) => setForm((p) => ({ ...p, dependent_name_ar: e.target.value }))} className="h-8 text-sm" dir="rtl" />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">
            Relationship <span className="text-destructive">*</span>
          </Label>
          <ERPCombobox
            value={form.relationship_type_id}
            onValueChange={(v) => setForm((p) => ({ ...p, relationship_type_id: v == null ? null : Number(v) }))}
            options={relTypeOptions}
            placeholder="Select relationship..."
            required
          />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">Date of Birth</Label>
          <Input type="date" value={form.date_of_birth} onChange={(e) => setForm((p) => ({ ...p, date_of_birth: e.target.value }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">Nationality</Label>
          <CountrySelect value={form.nationality_id} onValueChange={(v) => setForm((p) => ({ ...p, nationality_id: v }))} />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">Passport Number</Label>
          <Input value={form.passport_number} onChange={(e) => setForm((p) => ({ ...p, passport_number: e.target.value }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">Passport Expiry</Label>
          <Input type="date" value={form.passport_expiry} onChange={(e) => setForm((p) => ({ ...p, passport_expiry: e.target.value }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">Emirates ID</Label>
          <Input value={form.emirates_id_number} onChange={(e) => setForm((p) => ({ ...p, emirates_id_number: e.target.value }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">EID Expiry</Label>
          <Input type="date" value={form.emirates_id_expiry} onChange={(e) => setForm((p) => ({ ...p, emirates_id_expiry: e.target.value }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">Residence Visa No.</Label>
          <Input value={form.residence_visa_number} onChange={(e) => setForm((p) => ({ ...p, residence_visa_number: e.target.value }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-6">
          <Label className="text-xs font-medium mb-1 block">Visa Expiry</Label>
          <Input type="date" value={form.residence_visa_expiry} onChange={(e) => setForm((p) => ({ ...p, residence_visa_expiry: e.target.value }))} className="h-8 text-sm" />
        </div>
        <div className="col-span-12">
          <Label className="text-xs font-medium mb-1 block">Notes</Label>
          <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="h-8 text-sm" />
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" size="sm" onClick={onBack}>Back</Button>
        <Button size="sm" onClick={() => onSubmit(form)} disabled={!isValid || isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Dependent"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Wizard Component
// ─────────────────────────────────────────────────────────────────────────────

export function HrDocumentToRecordWizard({
  employeeId,
  targetType,
  open,
  onOpenChange,
  onSaved,
  onChildOpen,
}: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("pick");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<HrDmsDocForRecord | null>(null);
  const [identityDraft, setIdentityDraft] = useState<HrIdentityDocDraft | null>(null);
  const [insuranceDraft, setInsuranceDraft] = useState<HrInsuranceDraft | null>(null);
  const [dependentDraft, setDependentDraft] = useState<HrDependentDraft | null>(null);
  const [isAggregating, startAggregate] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setStep("pick");
      setSelectedIds([]);
      setSelectedDoc(null);
      setIdentityDraft(null);
      setInsuranceDraft(null);
      setDependentDraft(null);
    }
    onOpenChange(next);
    onChildOpen?.(next);
  }, [onOpenChange, onChildOpen]);

  const toggleDoc = (doc: HrDmsDocForRecord) => {
    if (targetType === "dependent") {
      setSelectedIds((prev) =>
        prev.includes(doc.id) ? prev.filter((id) => id !== doc.id) : [...prev, doc.id]
      );
    } else {
      setSelectedIds([doc.id]);
      setSelectedDoc(doc);
    }
  };

  const handleNext = () => {
    if (selectedIds.length === 0) return;

    startAggregate(async () => {
      if (targetType === "identity_document") {
        const r = await aggregateIdentityDocumentFromDms(employeeId, selectedIds[0]!);
        if (r.success && r.data) {
          setIdentityDraft(r.data);
          setStep("review");
        } else {
          toast.error(r.error ?? "Failed to load document data");
        }
      } else if (targetType === "medical_insurance") {
        const r = await aggregateMedicalInsuranceFromDms(employeeId, selectedIds[0]!);
        if (r.success && r.data) {
          setInsuranceDraft(r.data);
          setStep("review");
        } else {
          toast.error(r.error ?? "Failed to load document data");
        }
      } else if (targetType === "dependent") {
        const r = await aggregateDependentFromDms(employeeId, selectedIds);
        if (r.success && r.data) {
          setDependentDraft(r.data);
          setStep("review");
        } else {
          toast.error(r.error ?? "Failed to load document data");
        }
      }
    });
  };

  const handleIdentitySubmit = (form: HrIdentityDocDraft) => {
    startSubmit(async () => {
      const r = await createIdentityDocumentFromDms({
        employee_id: employeeId,
        dms_document_id: form.documentId,
        document_type_id: form.document_type_id!,
        document_number: form.document_number,
        issue_date: form.issue_date || undefined,
        expiry_date: form.expiry_date || undefined,
        issuing_authority: form.issuing_authority || undefined,
        issue_country_id: form.issue_country_id ?? undefined,
        issuing_emirate_id: form.issuing_emirate_id ?? undefined,
        uid_number: form.uid_number || undefined,
        visa_file_number: form.visa_file_number || undefined,
        labour_card_number: form.labour_card_number || undefined,
        work_permit_number: form.work_permit_number || undefined,
        mohre_person_code: form.mohre_person_code || undefined,
        profession_on_document: form.profession_on_document || undefined,
        emirates_id_application_no: form.emirates_id_application_no || undefined,
        status: "active",
        notes: form.notes || undefined,
        totalDocumentsSelected: 1,
      });

      if (r.success) {
        toast.success("Identity document created from DMS document");
        void qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.identityDocuments(employeeId) });
        invalidateDmsEntityDocuments(qc, "employee", employeeId);
        onSaved();
        handleOpenChange(false);
      } else {
        toast.error(r.error ?? "Failed to save");
      }
    });
  };

  const handleInsuranceSubmit = (form: HrInsuranceDraft) => {
    startSubmit(async () => {
      const r = await createMedicalInsuranceFromDms({
        employee_id: employeeId,
        dms_document_id: form.documentId,
        insurance_provider: form.insurance_provider,
        tpa: form.tpa || undefined,
        policy_number: form.policy_number,
        insurance_card_number: form.insurance_card_number || undefined,
        network_class: form.network_class || undefined,
        issue_date: form.issue_date || undefined,
        expiry_date: form.expiry_date,
        employee_covered: form.employee_covered,
        dependent_coverage_included: form.dependent_coverage_included,
        dependent_count_covered: form.dependent_count_covered,
        status: "active",
        notes: form.notes || undefined,
        totalDocumentsSelected: 1,
      });

      if (r.success) {
        toast.success("Medical insurance created from DMS document");
        void qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.medicalInsurances(employeeId) });
        invalidateDmsEntityDocuments(qc, "employee", employeeId);
        onSaved();
        handleOpenChange(false);
      } else {
        toast.error(r.error ?? "Failed to save");
      }
    });
  };

  const handleDependentSubmit = (form: HrDependentDraft) => {
    startSubmit(async () => {
      const r = await createDependentFromDms({
        employee_id: employeeId,
        dms_document_ids: form.documentIds,
        dependent_name_en: form.dependent_name_en,
        dependent_name_ar: form.dependent_name_ar || undefined,
        relationship_type_id: form.relationship_type_id!,
        date_of_birth: form.date_of_birth || undefined,
        nationality_id: form.nationality_id ?? undefined,
        passport_number: form.passport_number || undefined,
        passport_expiry: form.passport_expiry || undefined,
        emirates_id_number: form.emirates_id_number || undefined,
        emirates_id_expiry: form.emirates_id_expiry || undefined,
        residence_visa_number: form.residence_visa_number || undefined,
        residence_visa_expiry: form.residence_visa_expiry || undefined,
        medical_insurance_provider: form.medical_insurance_provider || undefined,
        medical_insurance_policy: form.medical_insurance_policy || undefined,
        medical_insurance_card: form.medical_insurance_card || undefined,
        medical_insurance_expiry: form.medical_insurance_expiry || undefined,
        sponsored_by: form.sponsored_by || undefined,
        is_active: true,
        notes: form.notes || undefined,
        totalDocumentsSelected: form.documentIds.length,
      });

      if (r.success) {
        toast.success("Dependent created from DMS documents");
        void qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.dependents(employeeId) });
        invalidateDmsEntityDocuments(qc, "employee", employeeId);
        onSaved();
        handleOpenChange(false);
      } else {
        toast.error(r.error ?? "Failed to save");
      }
    });
  };

  const stepLabel = step === "pick"
    ? `Step 1 of 2 — Select DMS Document${targetType === "dependent" ? "s" : ""}`
    : "Step 2 of 2 — Review & Confirm Draft";

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleOpenChange}
      title={wizardTitle(targetType)}
      subtitle={stepLabel}
      icon={wizardIcon(targetType)}
      mode="add"
      size="lg"
      isSubmitting={isSubmitting}
      /* Footer buttons are handled inside each step — we suppress the default footer */
      submitLabel={undefined}
      onSubmit={undefined}
    >
      {step === "pick" && (
        <PickerStep
          employeeId={employeeId}
          targetType={targetType}
          selectedIds={selectedIds}
          onToggle={toggleDoc}
          onNext={handleNext}
          isAggregating={isAggregating}
        />
      )}

      {step === "review" && targetType === "identity_document" && identityDraft && (
        <IdentityDocReview
          draft={identityDraft}
          onSubmit={handleIdentitySubmit}
          onBack={() => setStep("pick")}
          isSubmitting={isSubmitting}
        />
      )}

      {step === "review" && targetType === "medical_insurance" && insuranceDraft && (
        <InsuranceReview
          draft={insuranceDraft}
          onSubmit={handleInsuranceSubmit}
          onBack={() => setStep("pick")}
          isSubmitting={isSubmitting}
        />
      )}

      {step === "review" && targetType === "dependent" && dependentDraft && (
        <DependentReview
          draft={dependentDraft}
          onSubmit={handleDependentSubmit}
          onBack={() => setStep("pick")}
          isSubmitting={isSubmitting}
        />
      )}
    </ERPChildDialogForm>
  );
}
