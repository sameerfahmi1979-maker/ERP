"use client";

/**
 * ERP GLOBAL UI.4C — ERPRecordHeader
 *
 * Fixed header for ERPRecordWorkspaceForm.
 * Displays: title, subtitle, record code, status, mode badge, type badges,
 * dirty indicator, optional extra actions, and a close/request-close button.
 */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X, Printer } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ERPRecordStatusVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "muted";

export type ERPRecordWorkspaceFormMode = "add" | "edit" | "view";

export interface ERPRecordHeaderProps {
  mode: ERPRecordWorkspaceFormMode;
  title: string;
  subtitle?: string;
  recordCode?: string;
  statusLabel?: string;
  statusVariant?: ERPRecordStatusVariant;
  typeBadges?: string[];
  isDirty?: boolean;
  /** Slot for extra header actions (e.g. Print, Export) */
  actions?: React.ReactNode;
  /** Called when the header X / Close button is clicked */
  onRequestClose?: () => void;
}

// ── Status badge color map ────────────────────────────────────────────────────

const STATUS_CLASSES: Record<ERPRecordStatusVariant, string> = {
  default:  "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  success:  "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  warning:  "bg-amber-500/10 text-amber-500 border-amber-500/20",
  danger:   "bg-red-500/10 text-red-500 border-red-500/20",
  muted:    "bg-muted text-muted-foreground border-border",
};

const MODE_CLASSES: Record<ERPRecordWorkspaceFormMode, string> = {
  add:  "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  edit: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  view: "bg-muted text-muted-foreground border-border",
};

const MODE_LABELS: Record<ERPRecordWorkspaceFormMode, string> = {
  add:  "New Record",
  edit: "Editing",
  view: "View",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ERPRecordHeader({
  mode,
  title,
  subtitle,
  recordCode,
  statusLabel,
  statusVariant = "default",
  typeBadges,
  isDirty = false,
  actions,
  onRequestClose,
}: ERPRecordHeaderProps) {
  return (
    <div className="shrink-0 px-6 py-3.5 border-b border-border bg-card flex items-center justify-between gap-4 shadow-xs">
      {/* Left: title + meta */}
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <h1 className="text-base md:text-lg font-bold text-foreground tracking-tight leading-none truncate">
            {title}
          </h1>

          {/* Mode badge */}
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] py-0 px-2 font-medium shrink-0",
              MODE_CLASSES[mode]
            )}
          >
            {MODE_LABELS[mode]}
          </Badge>

          {/* Record code */}
          {recordCode && (
            <Badge
              variant="outline"
              className="bg-muted text-muted-foreground border-border text-[10px] py-0 px-2 font-mono shrink-0"
            >
              {recordCode}
            </Badge>
          )}

          {/* Status */}
          {statusLabel && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] py-0 px-2 font-medium capitalize shrink-0",
                STATUS_CLASSES[statusVariant]
              )}
            >
              {statusLabel}
            </Badge>
          )}

          {/* Type badges */}
          {typeBadges?.map((t) => (
            <Badge
              key={t}
              variant="outline"
              className="bg-muted text-muted-foreground border-border text-[10px] py-0 px-2 font-medium shrink-0"
            >
              {t}
            </Badge>
          ))}

          {/* Dirty dot */}
          {isDirty && (
            <span
              className="flex items-center gap-1 text-xs text-amber-500 font-semibold shrink-0"
              title="Unsaved changes"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="hidden sm:inline">Unsaved</span>
            </span>
          )}
        </div>

        {subtitle && (
          <p className="text-xs text-muted-foreground leading-tight truncate">
            {subtitle}
          </p>
        )}
      </div>

      {/* Right: extra actions + close */}
      <div className="flex items-center gap-2 shrink-0">
        {actions ?? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            className="h-8 text-xs gap-1.5 px-3 opacity-60 cursor-not-allowed"
            title="Export and print actions will be enabled in a future phase"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Actions</span>
          </Button>
        )}

        {onRequestClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRequestClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md focus:ring-1 focus:ring-ring"
            title="Close tab"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
