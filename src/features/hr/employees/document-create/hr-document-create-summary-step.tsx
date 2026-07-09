"use client";

import { CheckCircle2, FileText, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { HrComplianceRecordSuggestion } from "@/lib/hr/document-to-record/types";
import type { HrDmsDocumentSelection } from "@/lib/hr/document-to-record/types";
import type { EmployeeFormState } from "./hr-document-employee-review-step";

type Props = {
  form: EmployeeFormState;
  selectedDocuments: HrDmsDocumentSelection[];
  complianceSuggestions: HrComplianceRecordSuggestion[];
  isSubmitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
};

export function HrDocumentCreateSummaryStep({
  form,
  selectedDocuments,
  complianceSuggestions,
  isSubmitting,
  onBack,
  onSubmit,
}: Props) {
  const includedCompliance = complianceSuggestions.filter((s) => s.included);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold">Confirm &amp; Save</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Review the summary below. Click Save to create the employee record. No data is saved
          until you confirm.
        </p>
      </div>

      {/* Employee summary */}
      <div className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold">Employee Record</span>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          <SummaryField label="Full Name" value={form.full_name_en} />
          {form.full_name_ar && <SummaryField label="Arabic Name" value={form.full_name_ar} />}
          <SummaryField label="Gender" value={form.gender} />
          <SummaryField label="Date of Birth" value={form.date_of_birth} />
          <SummaryField label="Mobile" value={form.mobile_number} />
          {form.personal_email && <SummaryField label="Email" value={form.personal_email} />}
          <SummaryField label="Joining Date" value={form.joining_date} />
          <SummaryField label="Emergency Contact" value={`${form.emergency_contact_name} · ${form.emergency_contact_mobile}`} />
        </div>
      </div>

      {/* Source documents */}
      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold">
            Source Documents ({selectedDocuments.length})
          </span>
        </div>
        <div className="space-y-1">
          {selectedDocuments.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{d.title}</span>
              <span>·</span>
              <span>{d.document_no}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Compliance records */}
      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold">
            Compliance Records ({includedCompliance.length} will be created)
          </span>
        </div>
        {includedCompliance.length === 0 ? (
          <p className="text-xs text-muted-foreground">No compliance records included.</p>
        ) : (
          <div className="space-y-1">
            {includedCompliance.map((s) => (
              <div key={s.tempId} className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                <span className="text-xs">
                  <Badge variant="outline" className="text-[10px] h-4 px-1 mr-1">
                    {s.label}
                  </Badge>
                  {s.fields.document_number
                    ? String(s.fields.document_number)
                    : s.fields.policy_number
                      ? String(s.fields.policy_number)
                      : s.sourceDocumentTitle}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground bg-muted/30 rounded px-3 py-2">
        After saving, you will be taken to the new employee profile where you can add more details.
      </p>

      <div className="flex justify-between pt-2">
        <Button variant="outline" size="sm" onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={isSubmitting} className="gap-1.5 min-w-[120px]">
          {isSubmitting ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving...
            </>
          ) : (
            "Save Employee"
          )}
        </Button>
      </div>
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}
