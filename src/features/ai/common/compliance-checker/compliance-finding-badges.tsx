"use client";

import { cn } from "@/lib/utils";
import type {
  ComplianceFindingStatus,
  ComplianceFindingType,
  ComplianceSeverity,
} from "@/lib/ai/common/compliance-checker";

const STATUS_STYLES: Record<ComplianceFindingStatus, string> = {
  open: "bg-amber-100 text-amber-800 border-amber-200",
  reviewed: "bg-sky-100 text-sky-800 border-sky-200",
  accepted: "bg-blue-100 text-blue-800 border-blue-200",
  waived: "bg-violet-100 text-violet-700 border-violet-200",
  resolved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  false_positive: "bg-slate-100 text-slate-600 border-slate-200",
  superseded: "bg-violet-100 text-violet-700 border-violet-200",
  failed: "bg-rose-100 text-rose-800 border-rose-200",
};

export function ComplianceFindingStatusBadge({
  status,
  className,
}: {
  status: ComplianceFindingStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
        STATUS_STYLES[status] ?? STATUS_STYLES.open,
        className
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

const SEVERITY_STYLES: Record<ComplianceSeverity, string> = {
  info: "bg-slate-100 text-slate-600 border-slate-200",
  low: "bg-sky-50 text-sky-700 border-sky-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200",
};

export function ComplianceSeverityBadge({
  severity,
  className,
}: {
  severity: ComplianceSeverity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
        SEVERITY_STYLES[severity],
        className
      )}
    >
      {severity}
    </span>
  );
}

const TYPE_LABELS: Partial<Record<ComplianceFindingType, string>> = {
  missing_required_document: "Missing Required",
  expired_document: "Expired",
  expiring_soon_document: "Expiring Soon",
  document_high_risk: "High Risk",
  document_critical_risk: "Critical Risk",
  document_incomplete: "Incomplete",
  missing_ocr: "Missing OCR",
  missing_ai_summary: "Missing Summary",
  missing_embedding: "Missing Embedding",
  duplicate_conflict_open: "Duplicate Open",
  field_suggestion_conflict_open: "Field Conflict",
  license_expiry_mismatch: "License Mismatch",
  trn_mismatch: "TRN Mismatch",
  open_renewal_request: "Open Renewal",
  blocks_activation_warning: "Blocks Activation",
  ai_compliance_note: "AI Note",
};

export function ComplianceFindingTypeBadge({
  type,
  className,
}: {
  type: ComplianceFindingType;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800",
        className
      )}
    >
      {TYPE_LABELS[type] ?? type.replace(/_/g, " ")}
    </span>
  );
}
