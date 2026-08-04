"use client";

/**
 * DMS.BROWSER.1 — "Understood as" intent banner
 *
 * Displays a compact row of coloured chips below the search bar when the AI
 * intent layer has fired, showing the user what the AI extracted from their
 * query (date of birth, nationality, document type, keyword, etc.).
 *
 * Helps users immediately see if the AI misunderstood and lets them refine.
 */

import type { DmsSearchIntent } from "@/lib/dms/ai/types";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  FileText,
  User,
  Building2,
  Tag,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Hash,
  Filter,
} from "lucide-react";

// ── Individual chip ───────────────────────────────────────────────────────────

type ChipVariant = "date" | "type" | "person" | "company" | "keyword" | "filter" | "expiry" | "risk";

const CHIP_STYLES: Record<ChipVariant, string> = {
  date:    "bg-violet-50 border-violet-200 text-violet-700",
  type:    "bg-blue-50 border-blue-200 text-blue-700",
  person:  "bg-emerald-50 border-emerald-200 text-emerald-700",
  company: "bg-amber-50 border-amber-200 text-amber-700",
  keyword: "bg-slate-50 border-slate-200 text-slate-600",
  filter:  "bg-indigo-50 border-indigo-200 text-indigo-700",
  expiry:  "bg-rose-50 border-rose-200 text-rose-700",
  risk:    "bg-orange-50 border-orange-200 text-orange-700",
};

const CHIP_ICONS: Record<ChipVariant, React.ReactNode> = {
  date:    <CalendarDays className="h-3 w-3" />,
  type:    <FileText className="h-3 w-3" />,
  person:  <User className="h-3 w-3" />,
  company: <Building2 className="h-3 w-3" />,
  keyword: <Hash className="h-3 w-3" />,
  filter:  <Filter className="h-3 w-3" />,
  expiry:  <Clock className="h-3 w-3" />,
  risk:    <ShieldAlert className="h-3 w-3" />,
};

type Chip = { label: string; variant: ChipVariant };

function IntentChip({ label, variant }: Chip) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        CHIP_STYLES[variant]
      )}
    >
      {CHIP_ICONS[variant]}
      {label}
    </span>
  );
}

// ── DOB display helper ─────────────────────────────────────────────────────────

const MONTHS = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDobHint(hint: string): string {
  if (hint.startsWith("--")) {
    const parts = hint.slice(2).split("-");
    const month = parseInt(parts[0] ?? "0", 10);
    const day = parseInt(parts[1] ?? "0", 10);
    if (month && day) return `Born ${day} ${MONTHS[month] ?? ""}`;
    if (month) return `Born in ${MONTHS[month] ?? "Month " + month}`;
    return `DOB: ${hint}`;
  }
  // Full ISO date — show as readable
  const [year, mm, dd] = hint.split("-");
  const month = parseInt(mm ?? "0", 10);
  return `Born ${parseInt(dd ?? "0", 10)} ${MONTHS[month] ?? ""} ${year}`;
}

// ── Metadata filter label helper ──────────────────────────────────────────────

const FIELD_CODE_LABELS: Record<string, string> = {
  nationality:        "Nationality",
  gender:             "Gender",
  blood_group:        "Blood Group",
  emirates_id_number: "Emirates ID",
  passport_number:    "Passport No.",
  visa_number:        "Visa No.",
  labour_card_number: "Labour Card",
  uid_number:         "UID",
  document_number:    "Doc. No.",
  license_number:     "License No.",
  result:             "Result",
  medical_center:     "Medical Center",
};

// ── Main banner ───────────────────────────────────────────────────────────────

type Props = {
  intent: DmsSearchIntent | null;
  resultCount: number | null;
  isLoading?: boolean;
  className?: string;
};

export function DmsBrowserIntentBanner({ intent, resultCount, isLoading, className }: Props) {
  if (!intent) return null;

  const chips: Chip[] = [];

  // Date of birth
  if (intent.person_dob_hint) {
    chips.push({ label: formatDobHint(intent.person_dob_hint), variant: "date" });
  }

  // Date range on issue date
  if (intent.date_from && intent.date_to) {
    chips.push({ label: `Issued ${intent.date_from} – ${intent.date_to}`, variant: "date" });
  } else if (intent.date_from) {
    chips.push({ label: `Issued from ${intent.date_from}`, variant: "date" });
  } else if (intent.date_to) {
    chips.push({ label: `Issued until ${intent.date_to}`, variant: "date" });
  }

  // Document type
  if (intent.document_type_hint) {
    chips.push({
      label: intent.document_type_hint.charAt(0).toUpperCase() + intent.document_type_hint.slice(1),
      variant: "type",
    });
  }

  // Category
  if (intent.category_hint) {
    chips.push({ label: intent.category_hint, variant: "type" });
  }

  // Person name
  if (intent.person_name_hint) {
    chips.push({ label: intent.person_name_hint, variant: "person" });
  }

  // Company/party
  if (intent.party_name_hint) {
    chips.push({ label: intent.party_name_hint, variant: "company" });
  }

  // Metadata filters (nationality, blood group, etc.)
  for (const mf of intent.metadata_filters ?? []) {
    const label = `${FIELD_CODE_LABELS[mf.field_code] ?? mf.field_code}: ${mf.value}`;
    chips.push({ label, variant: "filter" });
  }

  // Outcome
  if (intent.outcome_hint) {
    chips.push({ label: `Outcome: ${intent.outcome_hint}`, variant: "keyword" });
  }

  // Expiry state
  if (intent.expiry_state) {
    const labels: Record<string, string> = {
      expired: "Expired",
      expiring_soon: "Expiring soon",
      valid: "Valid",
    };
    chips.push({ label: labels[intent.expiry_state] ?? intent.expiry_state, variant: "expiry" });
  }

  // Risk
  if (intent.risk_hint) {
    chips.push({ label: `Risk: ${intent.risk_hint}`, variant: "risk" });
  }

  // Keywords (only show first 3 to avoid clutter)
  const displayKeywords = (intent.keywords ?? []).slice(0, 3);
  for (const kw of displayKeywords) {
    chips.push({ label: kw, variant: "keyword" });
  }

  if (chips.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2 px-1 py-1", className)}>
      <span className="text-xs text-muted-foreground font-medium shrink-0">
        AI understood:
      </span>
      {chips.map((c, i) => (
        <IntentChip key={`${c.variant}-${i}`} label={c.label} variant={c.variant} />
      ))}
      {isLoading && (
        <span className="text-xs text-muted-foreground animate-pulse ml-1">Searching…</span>
      )}
      {!isLoading && resultCount !== null && (
        <span className="ml-auto text-xs text-muted-foreground shrink-0">
          {resultCount === 0 ? "No matches" : `${resultCount} match${resultCount !== 1 ? "es" : ""}`}
        </span>
      )}
      {resultCount === 0 && !isLoading && (
        <span className="flex items-center gap-1 text-xs text-amber-600">
          <AlertTriangle className="h-3 w-3" />
          Try rephrasing or check the spelling
        </span>
      )}
    </div>
  );
}
