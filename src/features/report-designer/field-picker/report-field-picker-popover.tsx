"use client";

import { useState, useCallback } from "react";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ReportFieldPicker } from "./report-field-picker";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface ReportFieldPickerPopoverProps {
  /** Called when a field is selected */
  onInsert: (fieldPath: string) => void;
  /** Trigger button label (default: "Insert Field") */
  label?: string;
  /** Custom trigger button class */
  className?: string;
  /** Show locked restricted/confidential fields (default: true) */
  showLocked?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ReportFieldPickerPopover({
  onInsert,
  label = "Insert Field",
  className,
  showLocked = true,
}: ReportFieldPickerPopoverProps) {
  const [open, setOpen] = useState(false);

  const handleInsert = useCallback(
    (fieldPath: string) => {
      onInsert(fieldPath);
      setOpen(false);
    },
    [onInsert]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-7 text-xs gap-1.5", className)}
        >
          <Layers className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-80 p-3"
        style={{ zIndex: 9999 }}
      >
        <div className="mb-2">
          <p className="text-xs font-semibold text-foreground">Insert Field</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Click an active field to insert it into the editor.
          </p>
        </div>
        <ReportFieldPicker
          onInsert={handleInsert}
          showLocked={showLocked}
          className="max-h-64 overflow-y-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
