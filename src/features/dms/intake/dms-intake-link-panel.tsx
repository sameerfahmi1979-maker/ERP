"use client";

/**
 * HR.DOCLINK.1A — "Link to ERP Records" panel on the AI Intake Review screen.
 *
 * Shows automatic suggestions (employees / dependents matched by identity
 * number or name, plus AI party matches) with checkboxes, and a manual
 * entity picker. Ticked links are applied on Approve — no auto-linking
 * without human confirmation (Phase 13 rule).
 *
 * Decision D2: only EXACT identity-number matches arrive pre-ticked.
 * Used by both the single-file intake path and the Review Queue / batch
 * draft path (both approve through this screen — decision D3).
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as LinkIcon, Plus, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ERPCombobox } from "@/components/erp/combobox";
import { DmsLinkEntitySelect } from "@/features/dms/documents/dms-link-entity-select";
import { DMS_ENTITY_TYPES } from "@/features/dms/documents/dms-document-constants";
import { getDmsEntityTypeLabel } from "@/lib/dms/dms-entity-types";
import { suggestIntakeEntityLinks } from "@/server/actions/dms/ai-intake";
import type { IntakeLinkSuggestion } from "@/lib/dms/entity-matching/intake-link-suggester";

export type IntakeLinkChip = {
  entityType: string;
  entityId: number;
  entityName: string;
};

const ENTITY_TYPE_OPTIONS = DMS_ENTITY_TYPES.map((t) => ({
  value: t,
  label: getDmsEntityTypeLabel(t),
}));

type DmsIntakeLinkPanelProps = {
  sessionCode: string;
  /** True while AI analysis is still running — suggestions load after it settles */
  aiReady: boolean;
  disabled?: boolean;
  value: IntakeLinkChip[];
  onChange: (links: IntakeLinkChip[]) => void;
};

export function DmsIntakeLinkPanel({
  sessionCode,
  aiReady,
  disabled = false,
  value,
  onChange,
}: DmsIntakeLinkPanelProps) {
  const [manualType, setManualType] = useState<string>("employee");
  const [manualId, setManualId] = useState<number | null>(null);
  const [manualLabel, setManualLabel] = useState<string>("");

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ["dms", "intake-link-suggestions", sessionCode],
    queryFn: async () => {
      const r = await suggestIntakeEntityLinks(sessionCode);
      return r.success ? r.data ?? [] : [];
    },
    enabled: aiReady,
    staleTime: 60_000,
  });

  // D2 — pre-tick exact identity-number matches ONCE when suggestions arrive.
  // If the reviewer unticks them afterwards, we never re-add.
  const preTickedRef = useRef(false);
  useEffect(() => {
    if (preTickedRef.current || suggestions.length === 0) return;
    preTickedRef.current = true;
    const preTicks = suggestions.filter(
      (s) => s.preTick && !value.some((v) => v.entityType === s.entityType && v.entityId === s.entityId)
    );
    if (preTicks.length > 0) {
      onChange([
        ...value,
        ...preTicks.map((s) => ({
          entityType: s.entityType,
          entityId: s.entityId,
          entityName: s.entityName,
        })),
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions]);

  const isTicked = (s: { entityType: string; entityId: number }) =>
    value.some((v) => v.entityType === s.entityType && v.entityId === s.entityId);

  const toggle = (s: IntakeLinkSuggestion) => {
    if (disabled) return;
    if (isTicked(s)) {
      onChange(value.filter((v) => !(v.entityType === s.entityType && v.entityId === s.entityId)));
    } else {
      onChange([...value, { entityType: s.entityType, entityId: s.entityId, entityName: s.entityName }]);
    }
  };

  const addManual = () => {
    if (manualId == null || disabled) return;
    if (value.some((v) => v.entityType === manualType && v.entityId === manualId)) {
      setManualId(null);
      setManualLabel("");
      return;
    }
    onChange([
      ...value,
      {
        entityType: manualType,
        entityId: manualId,
        entityName: manualLabel || `${getDmsEntityTypeLabel(manualType)} #${manualId}`,
      },
    ]);
    setManualId(null);
    setManualLabel("");
  };

  const removeChip = (chip: IntakeLinkChip) => {
    if (disabled) return;
    onChange(value.filter((v) => !(v.entityType === chip.entityType && v.entityId === chip.entityId)));
  };

  // Manual chips = ticked links that aren't in the suggestion list
  const manualChips = value.filter(
    (v) => !suggestions.some((s) => s.entityType === v.entityType && s.entityId === v.entityId)
  );

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <LinkIcon className="h-4 w-4 text-blue-500 shrink-0" />
        <span className="text-sm font-medium">Link to ERP Records</span>
        {value.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {value.length} selected
          </Badge>
        )}
      </div>
      <Separator />
      <p className="text-[11px] text-muted-foreground">
        Ticked records are linked to the document when you approve. Exact identity-number matches
        are pre-ticked automatically.
      </p>

      {/* Suggestions */}
      {aiReady && isLoading && <Skeleton className="h-14 w-full" />}
      {aiReady && !isLoading && suggestions.length > 0 && (
        <div className="space-y-1.5">
          {suggestions.map((s) => (
            <label
              key={`${s.entityType}-${s.entityId}`}
              className="flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs cursor-pointer hover:bg-muted/40"
            >
              <Checkbox
                checked={isTicked(s)}
                onCheckedChange={() => toggle(s)}
                disabled={disabled}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium truncate">{s.entityName}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    {getDmsEntityTypeLabel(s.entityType)}
                  </Badge>
                  {s.preTick && (
                    <Badge className="text-[9px] px-1 py-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
                      <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                      exact ID match
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.matchReason}</p>
              </div>
            </label>
          ))}
        </div>
      )}
      {aiReady && !isLoading && suggestions.length === 0 && (
        <p className="text-[11px] text-muted-foreground italic">
          No automatic matches found — you can link records manually below.
        </p>
      )}

      {/* Manually added links */}
      {manualChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {manualChips.map((chip) => (
            <span
              key={`${chip.entityType}-${chip.entityId}`}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 pl-2 pr-1 py-0.5 text-[11px]"
            >
              {chip.entityName}
              <Badge variant="outline" className="text-[9px] px-1 py-0">
                {getDmsEntityTypeLabel(chip.entityType)}
              </Badge>
              <button
                type="button"
                onClick={() => removeChip(chip)}
                disabled={disabled}
                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label={`Remove link to ${chip.entityName}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Manual add */}
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-4">
          <Label className="text-[10px] text-muted-foreground">Entity Type</Label>
          <ERPCombobox
            value={manualType}
            onValueChange={(v) => {
              setManualType(String(v ?? "employee"));
              setManualId(null);
              setManualLabel("");
            }}
            options={ENTITY_TYPE_OPTIONS}
            placeholder="Type..."
            disabled={disabled}
            triggerClassName="h-8 text-xs"
          />
        </div>
        <div className="col-span-6">
          <Label className="text-[10px] text-muted-foreground">Record</Label>
          <DmsLinkEntitySelect
            entityType={manualType}
            value={manualId}
            onValueChange={setManualId}
            onOptionSelected={(opt) => setManualLabel(opt?.label ?? "")}
            disabled={disabled}
          />
        </div>
        <div className="col-span-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full text-xs"
            onClick={addManual}
            disabled={disabled || manualId == null}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
