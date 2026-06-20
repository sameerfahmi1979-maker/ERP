"use client";

import { cn } from "@/lib/utils";
import type { DuplicateCandidateStatus, DuplicateCandidateType } from "@/lib/ai/common/duplicate-detection";

const STATUS_STYLES: Record<DuplicateCandidateStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  reviewed: "bg-sky-100 text-sky-800 border-sky-200",
  confirmed_duplicate: "bg-red-100 text-red-800 border-red-200",
  confirmed_conflict: "bg-orange-100 text-orange-800 border-orange-200",
  ignored: "bg-slate-100 text-slate-600 border-slate-200",
  resolved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  superseded: "bg-violet-100 text-violet-700 border-violet-200",
  failed: "bg-rose-100 text-rose-800 border-rose-200",
};

export function DuplicateCandidateStatusBadge({
  status,
  className,
}: {
  status: DuplicateCandidateStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
        STATUS_STYLES[status] ?? STATUS_STYLES.pending,
        className
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

const TYPE_LABELS: Partial<Record<DuplicateCandidateType, string>> = {
  duplicate_party_trn: "Party TRN",
  duplicate_party_iban: "Party IBAN",
  duplicate_party_license: "Party License",
  duplicate_party_email: "Party Email",
  duplicate_party_name: "Party Name",
  duplicate_company_name: "Company Name",
  duplicate_branch_license: "Branch License",
  duplicate_site_name: "Site Name",
  duplicate_document_hash: "Doc Hash",
  duplicate_document_link: "Doc Link",
  conflict_license_expiry: "Expiry Conflict",
  conflict_trn_value: "TRN Conflict",
  conflict_company_name: "Company Conflict",
  wrong_document_link: "Wrong Link",
  similar_name: "Similar Name",
};

export function DuplicateCandidateTypeBadge({
  type,
  className,
}: {
  type: DuplicateCandidateType;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800",
        className
      )}
    >
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}
