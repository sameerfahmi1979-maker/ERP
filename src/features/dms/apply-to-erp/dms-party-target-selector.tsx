"use client";

import { useState, useEffect, useCallback } from "react";
import { Building2, FileText, CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPartyApplyTargetRows } from "@/server/actions/dms/apply-to-erp";
import type { PartyApplyTargetKind, PartyLicenseRow, PartyTaxRow } from "@/lib/dms/apply-to-erp/types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  documentId:     number;
  partyId:        number;
  partyName?:     string | null;
  targetKind:     PartyApplyTargetKind;
  /** Called when the user explicitly selects (or deselects) a row. */
  onRowSelected?: (rowId: number | null) => void;
  /** Currently selected row ID (controlled from parent). */
  selectedRowId?: number | null;
  disabled?:      boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsPartyTargetSelector({
  documentId, partyId, partyName, targetKind,
  onRowSelected, selectedRowId, disabled,
}: Props) {
  const [rows, setRows] = useState<PartyLicenseRow[] | PartyTaxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getPartyApplyTargetRows({ documentId, partyId, targetKind });
    if (result.success && result.data) {
      setRows(result.data as PartyLicenseRow[] | PartyTaxRow[]);
    } else {
      setError(result.error ?? "Failed to load rows");
    }
    setLoading(false);
  }, [documentId, partyId, targetKind]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const tableLabel = targetKind === "party_licenses" ? "License" : "Tax Registration";
  const icon = targetKind === "party_licenses"
    ? <FileText className="h-4 w-4 text-sky-600" />
    : <Building2 className="h-4 w-4 text-sky-600" />;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold text-sky-900">
          Select Target {tableLabel}
        </span>
        {partyName && (
          <span className="text-xs text-sky-600 font-normal">— {partyName}</span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading {tableLabel.toLowerCase()} rows…
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
          <Button variant="ghost" size="sm" onClick={load} className="ml-auto h-6 text-xs">
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && rows.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="font-semibold mb-0.5">No existing {tableLabel} records found</div>
          <div className="text-xs text-amber-700">
            To apply AI-suggested values, create a {tableLabel.toLowerCase()} record
            for this party in Party Master first.
          </div>
        </div>
      )}

      {/* Row list */}
      {!loading && !error && rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Select the specific {tableLabel.toLowerCase()} record to update:
          </p>
          {targetKind === "party_licenses"
            ? (rows as PartyLicenseRow[]).map((row) => (
                <LicenseRowCard
                  key={row.id}
                  row={row}
                  selected={selectedRowId === row.id}
                  onSelect={() => onRowSelected?.(selectedRowId === row.id ? null : row.id)}
                  disabled={disabled}
                />
              ))
            : (rows as PartyTaxRow[]).map((row) => (
                <TaxRowCard
                  key={row.id}
                  row={row}
                  selected={selectedRowId === row.id}
                  onSelect={() => onRowSelected?.(selectedRowId === row.id ? null : row.id)}
                  disabled={disabled}
                />
              ))
          }
        </div>
      )}
    </div>
  );
}

// ── License row card ──────────────────────────────────────────────────────────

function LicenseRowCard({
  row, selected, onSelect, disabled,
}: { row: PartyLicenseRow; selected: boolean; onSelect: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "w-full text-left rounded-md border p-3 text-sm transition-colors",
        "hover:bg-sky-50 hover:border-sky-300 cursor-pointer",
        selected && "border-sky-400 bg-sky-50 ring-1 ring-sky-400",
        !selected && "border-border bg-background",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          {row.license_number && (
            <div className="font-mono text-xs text-sky-700 font-semibold">
              {row.license_code ? `[${row.license_code}] ` : ""}{row.license_number}
            </div>
          )}
          {row.license_name && (
            <div className="text-sm font-medium text-foreground">{row.license_name}</div>
          )}
          <div className="flex gap-3 text-xs text-muted-foreground">
            {row.issue_date && <span>Issued: {row.issue_date}</span>}
            {row.expiry_date && <span>Expires: {row.expiry_date}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {row.is_active
            ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                <CheckCircle className="h-3 w-3" /> Active
              </span>
            : <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                <XCircle className="h-3 w-3" /> Inactive
              </span>
          }
          {selected && (
            <CheckCircle className="h-4 w-4 text-sky-600 shrink-0" />
          )}
        </div>
      </div>
    </button>
  );
}

// ── Tax row card ──────────────────────────────────────────────────────────────

function TaxRowCard({
  row, selected, onSelect, disabled,
}: { row: PartyTaxRow; selected: boolean; onSelect: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "w-full text-left rounded-md border p-3 text-sm transition-colors",
        "hover:bg-sky-50 hover:border-sky-300 cursor-pointer",
        selected && "border-sky-400 bg-sky-50 ring-1 ring-sky-400",
        !selected && "border-border bg-background",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          {row.tax_registration_number_masked && (
            <div className="font-mono text-xs text-sky-700 font-semibold">
              {row.tax_registration_code ? `[${row.tax_registration_code}] ` : ""}
              TRN: {row.tax_registration_number_masked}
            </div>
          )}
          <div className="flex gap-3 text-xs text-muted-foreground">
            {row.effective_from && <span>From: {row.effective_from}</span>}
            {row.effective_to && <span>To: {row.effective_to}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {row.is_active
            ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                <CheckCircle className="h-3 w-3" /> Active
              </span>
            : <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                <XCircle className="h-3 w-3" /> Inactive
              </span>
          }
          {selected && (
            <CheckCircle className="h-4 w-4 text-sky-600 shrink-0" />
          )}
        </div>
      </div>
    </button>
  );
}
