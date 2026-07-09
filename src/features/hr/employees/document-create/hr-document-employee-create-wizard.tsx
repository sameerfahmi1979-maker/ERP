"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import type { HrDmsDocumentSelection, HrDocumentToEmployeeReviewPayload, HrComplianceRecordSuggestion, HrDocumentConflict } from "@/lib/hr/document-to-record/types";
import type { DuplicateCheckResult } from "@/lib/hr/document-to-record/duplicate-checks";
import { createEmployeeFromDmsDocuments } from "@/server/actions/hr/document-to-employee";
import type { ComplianceChildInput } from "@/lib/hr/document-to-record/types";
import { HrDocumentPickerStep } from "./hr-document-picker-step";
import { HrDocumentEmployeeReviewStep } from "./hr-document-employee-review-step";
import type { EmployeeFormState } from "./hr-document-employee-review-step";
import { HrDocumentComplianceReviewStep } from "./hr-document-compliance-review-step";
import { HrDocumentCreateSummaryStep } from "./hr-document-create-summary-step";

type Step = "pick" | "employee-review" | "compliance-review" | "confirm";

const STEP_LABELS: Record<Step, string> = {
  pick: "1. Select Documents",
  "employee-review": "2. Employee Draft",
  "compliance-review": "3. Compliance",
  confirm: "4. Confirm",
};

const STEPS: Step[] = ["pick", "employee-review", "compliance-review", "confirm"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChildOpen?: (open: boolean) => void;
};

const EMPTY_FORM: EmployeeFormState = {
  full_name_en: "",
  full_name_ar: "",
  gender: "",
  date_of_birth: "",
  nationality_id: null,
  mobile_number: "",
  personal_email: "",
  owner_company_id: null,
  branch_id: null,
  department_id: null,
  designation_id: null,
  employee_category_id: null,
  employment_type_id: null,
  joining_date: "",
  emergency_contact_name: "",
  emergency_contact_mobile: "",
};

export function HrDocumentEmployeeCreateWizard({ open, onOpenChange, onChildOpen }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("pick");
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<HrDmsDocumentSelection[]>([]);
  const [reviewPayload, setReviewPayload] = useState<(HrDocumentToEmployeeReviewPayload & { duplicates: DuplicateCheckResult[] }) | null>(null);
  const [form, setFormState] = useState<EmployeeFormState>(EMPTY_FORM);
  const [conflicts, setConflicts] = useState<HrDocumentConflict[]>([]);
  const [complianceSuggestions, setComplianceSuggestions] = useState<HrComplianceRecordSuggestion[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCheckResult[]>([]);
  const [identityDocDuplicates, setIdentityDocDuplicates] = useState<DuplicateCheckResult[]>([]);
  const [isSubmitting, startSubmit] = useTransition();

  const setForm = useCallback((patch: Partial<EmployeeFormState>) => {
    setFormState((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setStep("pick");
      setSelectedDocIds([]);
      setSelectedDocs([]);
      setReviewPayload(null);
      setFormState(EMPTY_FORM);
      setConflicts([]);
      setComplianceSuggestions([]);
      setDuplicates([]);
      setIdentityDocDuplicates([]);
    }
    onOpenChange(next);
    onChildOpen?.(next);
  }, [onOpenChange, onChildOpen]);

  const toggleDoc = useCallback((doc: HrDmsDocumentSelection) => {
    setSelectedDocIds((prev) =>
      prev.includes(doc.id) ? prev.filter((id) => id !== doc.id) : [...prev, doc.id]
    );
    setSelectedDocs((prev) =>
      prev.some((d) => d.id === doc.id)
        ? prev.filter((d) => d.id !== doc.id)
        : [...prev, doc]
    );
  }, []);

  const handleAggregated = useCallback(
    (payload: HrDocumentToEmployeeReviewPayload & { duplicates: DuplicateCheckResult[] }) => {
      setReviewPayload(payload);
      // Pre-populate form from draft suggestions
      const d = payload.employeeDraft;
      setFormState({
        full_name_en: d.full_name_en?.userValue ?? "",
        full_name_ar: d.full_name_ar?.userValue ?? "",
        gender: (d.gender?.userValue as "male" | "female" | "") ?? "",
        date_of_birth: d.date_of_birth?.userValue ?? "",
        nationality_id: null,
        mobile_number: d.mobile_number?.userValue ?? "",
        personal_email: d.personal_email?.userValue ?? "",
        owner_company_id: null,
        branch_id: null,
        department_id: null,
        designation_id: null,
        employee_category_id: null,
        employment_type_id: null,
        joining_date: "",
        emergency_contact_name: "",
        emergency_contact_mobile: "",
      });
      setConflicts(d.conflicts ?? []);
      setComplianceSuggestions(payload.complianceSuggestions);
      setDuplicates(payload.duplicates);
      setIdentityDocDuplicates(payload.identityDocDuplicates ?? []);
      setStep("employee-review");
    },
    []
  );

  const handleResolveConflict = useCallback(
    (fieldName: string, value: string, docId: number) => {
      setConflicts((prev) =>
        prev.map((c) =>
          c.fieldName === fieldName
            ? { ...c, resolvedValue: value, resolvedSourceDocumentId: docId }
            : c
        )
      );
      // Apply resolved value to the form
      setFormState((prev) => ({ ...prev, [fieldName]: value }));
    },
    []
  );

  const handleSubmit = useCallback(() => {
    if (!reviewPayload) return;
    if (!form.gender || !(form.gender === "male" || form.gender === "female")) {
      toast.error("Gender is required");
      return;
    }

    startSubmit(async () => {
      const includedRecords: ComplianceChildInput[] = complianceSuggestions
        .filter((s) => s.included)
        .map((s) => {
          if (s.kind === "identity_document") {
            return {
              kind: "identity_document" as const,
              tempId: s.tempId,
              sourceDocumentId: s.sourceDocumentId,
              document_type_id: (s.fields.document_type_id as number) ?? 0,
              document_number: (s.fields.document_number as string) ?? "",
              issue_date: (s.fields.issue_date as string) ?? null,
              expiry_date: (s.fields.expiry_date as string) ?? null,
              issuing_authority: (s.fields.issuing_authority as string) ?? null,
              issuing_authority_party_id: null,
              issue_country_id: null,
              issuing_emirate_id: null,
              status: ((s.fields.status as string) ?? "active") as "active" | "expired" | "cancelled" | "pending",
              verification_status: "unverified" as const,
              renewal_status: "not_required" as const,
              emirates_id_application_no: (s.fields.emirates_id_application_no as string) ?? null,
              visa_file_number: (s.fields.visa_file_number as string) ?? null,
              uid_number: (s.fields.uid_number as string) ?? null,
              labour_card_number: (s.fields.labour_card_number as string) ?? null,
              work_permit_number: (s.fields.work_permit_number as string) ?? null,
              mohre_person_code: (s.fields.mohre_person_code as string) ?? null,
              profession_on_document: (s.fields.profession_on_document as string) ?? null,
              sponsor_company_id: null,
              place_of_issue: null,
              notes: null,
              dms_document_id: s.sourceDocumentId,
            };
          } else if (s.kind === "medical_insurance") {
            return {
              kind: "medical_insurance" as const,
              tempId: s.tempId,
              sourceDocumentId: s.sourceDocumentId,
              insurance_provider: (s.fields.insurance_provider as string) ?? "",
              policy_number: (s.fields.policy_number as string) ?? "",
              tpa: null,
              insurance_card_number: (s.fields.insurance_card_number as string) ?? null,
              network_class: (s.fields.network_class as string) ?? null,
              issue_date: (s.fields.issue_date as string) ?? null,
              expiry_date: (s.fields.expiry_date as string) ?? "",
              employee_covered: true,
              dependent_coverage_included: false,
              status: "active" as const,
              verification_status: "unverified" as const,
              renewal_status: "pending" as const,
              notes: null,
              dms_document_id: s.sourceDocumentId,
            };
          } else {
            return {
              kind: "training_certificate" as const,
              tempId: s.tempId,
              sourceDocumentId: s.sourceDocumentId,
              training_type_id: (s.fields.training_type_id as number) ?? 0,
              training_category_id: null,
              provider: (s.fields.provider as string) ?? null,
              certificate_number: (s.fields.certificate_number as string) ?? null,
              issue_date: (s.fields.issue_date as string) ?? null,
              expiry_date: (s.fields.expiry_date as string) ?? null,
              status: "valid" as const,
              verification_status: "unverified" as const,
              renewal_status: "not_required" as const,
              notes: null,
              dms_document_id: s.sourceDocumentId,
            };
          }
        })
        .filter((r) => {
          if (r.kind === "identity_document" && (!r.document_type_id || !r.document_number)) return false;
          if (r.kind === "medical_insurance" && (!r.insurance_provider || !r.policy_number || !r.expiry_date)) return false;
          return true;
        });

      const result = await createEmployeeFromDmsDocuments({
        selectedDocumentIds: selectedDocIds,
        full_name_en: form.full_name_en,
        full_name_ar: form.full_name_ar || null,
        gender: form.gender as "male" | "female",
        date_of_birth: form.date_of_birth,
        nationality_id: form.nationality_id,
        mobile_number: form.mobile_number,
        personal_email: form.personal_email || null,
        owner_company_id: form.owner_company_id!,
        branch_id: form.branch_id,
        department_id: form.department_id,
        designation_id: form.designation_id,
        employee_category_id: form.employee_category_id,
        employment_type_id: form.employment_type_id,
        joining_date: form.joining_date,
        employee_status: "active",
        reporting_manager_id: null,
        emergency_contact_name: form.emergency_contact_name,
        emergency_contact_mobile: form.emergency_contact_mobile,
        emergency_contact_relationship_type_id: null,
        complianceRecords: includedRecords,
        conflictsReviewed: conflicts.filter((c) => c.resolvedValue).length,
        totalDocumentsSelected: selectedDocIds.length,
      });

      if (!result.success) {
        toast.error(result.error ?? "Failed to create employee");
        return;
      }

      const { employeeId, employeeCode, complianceRecordsCreated, documentsLinked, warnings } = result.data!;

      if (warnings?.length) {
        for (const w of warnings) toast.warning(w);
      }

      toast.success(
        `Employee ${employeeCode} created. ${complianceRecordsCreated} compliance record${complianceRecordsCreated !== 1 ? "s" : ""} created. ${documentsLinked} document${documentsLinked !== 1 ? "s" : ""} linked.`
      );

      handleOpenChange(false);
      router.push(`/admin/hr/employees/record/${employeeId}`);
    });
  }, [
    reviewPayload,
    form,
    complianceSuggestions,
    selectedDocIds,
    conflicts,
    handleOpenChange,
    router,
  ]);

  const currentStepIndex = STEPS.indexOf(step);

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleOpenChange}
      title="Add Employee from Documents"
      subtitle="Create a new employee using existing DMS documents"
      icon={<FileText className="h-5 w-5" />}
      mode="add"
      size="xl"
      isSubmitting={isSubmitting}
      submitLabel={step === "confirm" ? "Save Employee" : undefined}
      onSubmit={step === "confirm" ? handleSubmit : undefined}
    >
      {/* Step indicator */}
      <div className="mb-5 flex items-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors ${
                i < currentStepIndex
                  ? "bg-green-500 text-white"
                  : i === currentStepIndex
                    ? "bg-blue-500 text-white"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i < currentStepIndex ? "✓" : i + 1}
            </div>
            <span
              className={`ml-1.5 text-[11px] whitespace-nowrap ${
                i === currentStepIndex
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {STEP_LABELS[s].replace(/^\d+\. /, "")}
            </span>
            {i < STEPS.length - 1 && (
              <div className="mx-2 h-px w-6 bg-border" />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {step === "pick" && (
        <HrDocumentPickerStep
          selectedIds={selectedDocIds}
          onToggle={toggleDoc}
          onNext={handleAggregated}
        />
      )}

      {step === "employee-review" && reviewPayload && (
        <HrDocumentEmployeeReviewStep
          draft={reviewPayload.employeeDraft}
          form={form}
          setForm={setForm}
          conflicts={conflicts}
          onResolveConflict={handleResolveConflict}
          duplicates={duplicates}
          identityDocDuplicates={identityDocDuplicates}
          onNext={() => setStep("compliance-review")}
          onBack={() => setStep("pick")}
        />
      )}

      {step === "compliance-review" && (
        <HrDocumentComplianceReviewStep
          suggestions={complianceSuggestions}
          onChange={setComplianceSuggestions}
          onNext={() => setStep("confirm")}
          onBack={() => setStep("employee-review")}
        />
      )}

      {step === "confirm" && reviewPayload && (
        <HrDocumentCreateSummaryStep
          form={form}
          selectedDocuments={selectedDocs}
          complianceSuggestions={complianceSuggestions}
          isSubmitting={isSubmitting}
          onBack={() => setStep("compliance-review")}
          onSubmit={handleSubmit}
        />
      )}
    </ERPChildDialogForm>
  );
}
