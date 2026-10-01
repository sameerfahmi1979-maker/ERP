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
import { X } from "lucide-react";

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
  compact?: boolean;
  /** Slot for extra header actions (e.g. Print, Export) */
  actions?: React.ReactNode;
  /** Called when the header X / Close button is clicked */
  onRequestClose?: () => void;
}

// ── Status badge color map ────────────────────────────────────────────────────

const STATUS_CLASSES: Record<ERPRecordStatusVariant, string> = {
  default:  "bg-blue-500/10 text-blue-800 dark:text-blue-300 border-indigo-500/20",
  success:  "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20",
  warning:  "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20",
  danger:   "bg-red-500/10 text-red-800 dark:text-red-300 border-red-500/20",
  muted:    "bg-muted text-muted-foreground border-border",
};

const MODE_CLASSES: Record<ERPRecordWorkspaceFormMode, string> = {
  add:  "bg-blue-500/10 text-blue-800 dark:text-blue-300 border-indigo-500/20",
  edit: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20",
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
  compact = false,
  actions,
  onRequestClose,
}: ERPRecordHeaderProps) {
  return (
    <div data-record-identity data-compact={compact} className="shrink-0 px-4 md:px-6 py-4 border-b border-border bg-card flex items-center justify-between gap-4 shadow-xs">
      {/* Left: title + meta */}
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <h1 className="font-semibold text-foreground tracking-tight leading-6 truncate text-xl md:text-[22px]" style={compact ? { transform: "scale(.9)", transformOrigin: "left center" } : undefined}>
            {title}
          </h1>

          {/* Mode badge */}
          <Badge
            variant="outline"
            className={cn(
              "text-xs py-0 px-2 font-medium shrink-0",
              MODE_CLASSES[mode]
            )}
          >
            {MODE_LABELS[mode]}
          </Badge>

          {/* Record code */}
          {recordCode && (
            <Badge
              variant="outline"
              className="bg-muted text-muted-foreground border-border text-xs py-0 px-2 font-mono shrink-0"
            >
              {recordCode}
            </Badge>
          )}

          {/* Status */}
          {statusLabel && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs py-0 px-2 font-medium capitalize shrink-0",
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
              className="bg-muted text-muted-foreground border-border text-xs py-0 px-2 font-medium shrink-0"
            >
              {t}
            </Badge>
          ))}

          {/* Dirty dot */}
          {isDirty && (
            <span
              className="flex items-center gap-1 text-xs text-amber-800 dark:text-amber-300 font-semibold shrink-0"
              title="Unsaved changes"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <span className="hidden sm:inline">Unsaved</span>
            </span>
          )}
        </div>

        {subtitle && (
          <p aria-hidden={compact || undefined} className={cn("text-xs text-muted-foreground leading-tight truncate", compact && "invisible")}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Right: extra actions + close */}
      <div className="flex items-center gap-2 shrink-0">
        {actions}

        {onRequestClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRequestClose}
            className="h-11 w-11 sm:h-9 sm:w-9 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md focus:ring-1 focus:ring-ring"
            title="Close record" aria-label="Close record"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
