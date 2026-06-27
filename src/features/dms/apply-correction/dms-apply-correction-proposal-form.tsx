"use client";

/**
 * DMS Apply Correction — Proposal Form
 *
 * Form for entering a correction value.
 *
 * Modes:
 *   - manual:          user enters value from scratch
 *   - restore_previous: prefills from originalBeforeSummary (with warning)
 *   - reapply_ai_value: prefills from originalAppliedSummary
 *
 * UI labels allowed:
 *   Propose Correction, Use Previous Value, Use Applied Value, Enter Correction Manually
 *
 * FORBIDDEN labels: Undo, Rollback, Auto Revert, Restore Automatically, One-click Revert
 */

import { useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CorrectionMode, CorrectionSourceData } from "@/lib/dms/apply-correction/types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  source:          CorrectionSourceData;
  value:           string;
  onChange:        (v: string) => void;
  mode:            CorrectionMode;
  onModeChange:    (m: CorrectionMode) => void;
  isSubmitting:    boolean;
  onSubmit:        () => void;
  onCancel:        () => void;
  error?:          string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsApplyCorrectionProposalForm({
  source,
  value,
  onChange,
  mode,
  onModeChange,
  isSubmitting,
  onSubmit,
  onCancel,
  error,
}: Props) {
  const [showModeB, setShowModeB] = useState(false);

  const handleUsePrevious = () => {
    if (!source.restorePreviousEnabled) return;
    onModeChange("restore_previous");
    onChange(source.originalBeforeSummary ?? "");
    setShowModeB(false);
  };

  const handleUseApplied = () => {
    onModeChange("reapply_ai_value");
    onChange(source.originalAppliedSummary ?? "");
    setShowModeB(false);
  };

  const handleManual = () => {
    onModeChange("manual");
    onChange("");
    setShowModeB(false);
  };

  return (
    <div className="space-y-5">
      {/* Human responsibility warning */}
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Human review required</p>
          <p className="mt-0.5 text-amber-800">
            You are responsible for reviewing the correction value before applying.
            This correction will overwrite the current field value after confirmation.
            This action is not automatic — it requires your explicit approval.
          </p>
        </div>
      </div>

      {/* Mode buttons */}
      <div className="space-y-2">
        <Label>Correction Mode</Label>
        <div className="flex flex-wrap gap-2">
          <ModeButton
            label="Enter Correction Manually"
            active={mode === "manual"}
            onClick={handleManual}
            disabled={isSubmitting}
          />
          {source.restorePreviousEnabled && (
            <ModeButton
              label="Use Previous Value"
              active={mode === "restore_previous"}
              onClick={handleUsePrevious}
              disabled={isSubmitting}
              title="Prefill with value before original apply"
            />
          )}
          {source.originalAppliedSummary && (
            <ModeButton
              label="Use Applied Value"
              active={mode === "reapply_ai_value"}
              onClick={handleUseApplied}
              disabled={isSubmitting}
              title="Prefill with the originally applied AI value"
            />
          )}
        </div>
      </div>

      {/* Restore previous warning */}
      {mode === "restore_previous" && source.restorePreviousWarning && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{source.restorePreviousWarning}</span>
        </div>
      )}

      {/* Correction value input */}
      <div className="space-y-1.5">
        <Label htmlFor="correction-value">
          Correction Value
          <span className="ml-1 text-red-500">*</span>
        </Label>
        <Input
          id="correction-value"
          value={value}
          onChange={(e) => {
            if (mode !== "manual") onModeChange("manual");
            onChange(e.target.value);
          }}
          placeholder={`Enter ${source.valueType} value…`}
          disabled={isSubmitting}
          className="font-mono text-sm"
        />
        <p className="text-xs text-slate-500">
          Expected type: <span className="font-mono">{source.valueType}</span>
          {source.valueType === "date" && " (format: YYYY-MM-DD)"}
          {source.valueType === "boolean" && " (true or false)"}
          {source.valueType === "bigint" && " (positive integer)"}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          disabled={isSubmitting || !value.trim()}
        >
          {isSubmitting ? "Saving…" : "Propose Correction"}
        </Button>
      </div>

      {void showModeB}
    </div>
  );
}

// ── Mode button ───────────────────────────────────────────────────────────────

function ModeButton({
  label,
  active,
  onClick,
  disabled,
  title,
}: {
  label:     string;
  active:    boolean;
  onClick:   () => void;
  disabled?: boolean;
  title?:    string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        disabled && "pointer-events-none opacity-50"
      )}
    >
      {label}
    </button>
  );
}
