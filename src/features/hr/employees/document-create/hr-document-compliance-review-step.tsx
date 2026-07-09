"use client";

import { Shield, AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { HrComplianceRecordSuggestion } from "@/lib/hr/document-to-record/types";
import { HrDocumentConfidenceBadge } from "./hr-document-confidence-badge";

type Props = {
  suggestions: HrComplianceRecordSuggestion[];
  onChange: (updated: HrComplianceRecordSuggestion[]) => void;
  onNext: () => void;
  onBack: () => void;
};

function FieldRow({
  label,
  value,
  confidence,
  onChange,
}: {
  label: string;
  value: string | number | boolean | null;
  confidence?: number;
  onChange: (v: string) => void;
}) {
  const displayValue = value == null ? "" : String(value);
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Label className="text-xs font-medium">{label}</Label>
        {confidence != null && <HrDocumentConfidenceBadge confidence={confidence} />}
      </div>
      <Input
        value={displayValue}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs"
      />
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onToggle,
  onFieldChange,
}: {
  suggestion: HrComplianceRecordSuggestion;
  onToggle: () => void;
  onFieldChange: (fieldName: string, value: string) => void;
}) {
  const confidenceColor =
    suggestion.confidence >= 0.8
      ? "border-green-200 dark:border-green-800"
      : suggestion.confidence >= 0.55
        ? "border-yellow-200 dark:border-yellow-800"
        : "border-red-200 dark:border-red-800";

  // Which fields to show per kind
  const showFields: string[] = [];
  if (suggestion.kind === "identity_document") {
    showFields.push("document_number", "issue_date", "expiry_date", "issuing_authority");
  } else if (suggestion.kind === "medical_insurance") {
    showFields.push("insurance_provider", "policy_number", "expiry_date", "network_class");
  } else if (suggestion.kind === "training_certificate") {
    showFields.push("certificate_number", "provider", "issue_date", "expiry_date");
  }

  const fieldLabels: Record<string, string> = {
    document_number: "Document Number",
    issue_date: "Issue Date",
    expiry_date: "Expiry Date",
    issuing_authority: "Issuing Authority",
    insurance_provider: "Insurance Provider",
    policy_number: "Policy Number",
    network_class: "Network Class",
    certificate_number: "Certificate Number",
    provider: "Provider",
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-3 transition-colors",
        suggestion.included ? confidenceColor : "border-border opacity-60",
        suggestion.included && "bg-muted/20"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] h-5">
            {suggestion.label}
          </Badge>
          <HrDocumentConfidenceBadge confidence={suggestion.confidence} />
          <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">
            {suggestion.sourceDocumentTitle}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors",
            suggestion.included
              ? "border-green-400 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
              : "border-border bg-background text-muted-foreground hover:bg-muted/40"
          )}
        >
          {suggestion.included ? (
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Include</span>
          ) : (
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" />Excluded</span>
          )}
        </button>
      </div>

      {/* Warnings */}
      {suggestion.warnings.length > 0 && (
        <div className="space-y-0.5">
          {suggestion.warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px] text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Fields (only shown when included) */}
      {suggestion.included && (
        <div className="grid grid-cols-2 gap-2">
          {showFields.map((f) => (
            <FieldRow
              key={f}
              label={fieldLabels[f] ?? f}
              value={suggestion.fields[f] ?? null}
              confidence={suggestion.fieldConfidence[f]}
              onChange={(v) => onFieldChange(f, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function HrDocumentComplianceReviewStep({
  suggestions,
  onChange,
  onNext,
  onBack,
}: Props) {
  const toggle = (tempId: string) => {
    onChange(
      suggestions.map((s) =>
        s.tempId === tempId ? { ...s, included: !s.included } : s
      )
    );
  };

  const fieldChange = (tempId: string, fieldName: string, value: string) => {
    onChange(
      suggestions.map((s) =>
        s.tempId === tempId
          ? { ...s, fields: { ...s.fields, [fieldName]: value } }
          : s
      )
    );
  };

  const includedCount = suggestions.filter((s) => s.included).length;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Review Compliance Suggestions</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          These compliance records were extracted from the selected documents. Toggle each one to
          include or exclude. Edit fields as needed. Only included records will be created.
        </p>
      </div>

      {suggestions.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-6 py-8 text-center">
          <Shield className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No compliance records detected.</p>
          <p className="text-xs text-muted-foreground mt-1">
            You can add compliance records after the employee is created.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[460px] overflow-y-auto pr-0.5">
          {suggestions.map((s) => (
            <SuggestionCard
              key={s.tempId}
              suggestion={s}
              onToggle={() => toggle(s.tempId)}
              onFieldChange={(f, v) => fieldChange(s.tempId, f, v)}
            />
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {includedCount} of {suggestions.length} records included
        </p>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button size="sm" onClick={onNext}>
          Review & Confirm
        </Button>
      </div>
    </div>
  );
}
