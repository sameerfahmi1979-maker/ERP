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
import type { CorrectionMode, CorrectionSourceData } from "@/lib/dms/apply-correction/types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  source:          CorrectionSourceData;
  value:           string;
  onChange:        (v: string) => void;
  mode:            CorrectionMode;
  onModeChange:    (m: CorrectionMode) => void;
  isSubmitting:    boolean;
  outcomeUncertain?: boolean;
  hideActions?: boolean;
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
  outcomeUncertain=false,
  hideActions=false,
  onSubmit,
  onCancel,
  error,
}: Props) {
  const [showModeB, setShowModeB] = useState(false);

  const handleUsePrevious = () => {
    if (!source.restorePreviousEnabled) return;
    onModeChange("restore_previous");
    onChange((source.reviewedRevision||source.reviewedSnapshot)?source.originalBeforeValue??'':source.originalBeforeSummary??'');
    setShowModeB(false);
  };

  const handleUseApplied = () => {
    onModeChange("reapply_ai_value");
    onChange((source.reviewedRevision||source.reviewedSnapshot)?source.originalAppliedValue??'':source.originalAppliedSummary??'');
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
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-foreground">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Human review required</p>
          <p className="mt-0.5">
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
            disabled={isSubmitting||outcomeUncertain}
          />
          {source.restorePreviousEnabled && (
            <ModeButton
              label="Use Previous Value"
              active={mode === "restore_previous"}
              onClick={handleUsePrevious}
              disabled={isSubmitting||outcomeUncertain}
              title="Prefill with value before original apply"
            />
          )}
          {source.originalAppliedSummary && source.reapplyAvailable!==false && (
            <ModeButton
              label="Use Applied Value"
              active={mode === "reapply_ai_value"}
              onClick={handleUseApplied}
              disabled={isSubmitting||outcomeUncertain}
              title="Prefill with the originally applied AI value"
            />
          )}
        </div>
      </div>

      {/* Restore previous warning */}
      {mode === "restore_previous" && source.restorePreviousWarning && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{source.restorePreviousWarning}</span>
        </div>
      )}

      {/* Correction value input */}
      <div className="space-y-1.5">
        <Label htmlFor="correction-value">
          Correction Value
          <span className="ml-1 text-destructive">*</span>
        </Label>
        <Input required
          id="correction-value"
          value={value}
          onChange={(e) => {
            if (mode !== "manual") onModeChange("manual");
            onChange(e.target.value);
          }}
          placeholder={`Enter ${source.valueType} value…`}
          disabled={isSubmitting||outcomeUncertain}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Expected type: <span className="font-mono">{source.valueType}</span>
          {source.valueType === "date" && " (format: YYYY-MM-DD)"}
          {source.valueType === "boolean" && " (true or false)"}
          {source.valueType === "bigint" && " (positive integer)"}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Footer actions */}
      {!hideActions && <div className="flex items-center justify-between border-t pt-4">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          disabled={isSubmitting || !value.trim()}
        >
          {isSubmitting ? "Saving…" : "Propose Correction"}
        </Button>
      </div>}

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
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      variant={active ? "default" : "outline"}
      aria-pressed={active}
      className="whitespace-normal text-left h-auto min-h-8 py-1.5"
    >
      {label}
    </Button>
  );
}
