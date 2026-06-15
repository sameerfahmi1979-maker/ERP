"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UnsavedChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStay: () => void;
  onDiscard: () => void;
  /** Override dialog title. Defaults to "Unsaved changes". */
  title?: string;
  /** Override dialog description. Defaults to the form-close message. */
  description?: string;
  /** Override the Stay button label. Defaults to "Stay on Form". */
  stayLabel?: string;
  /** Override the Discard button label. Defaults to "Discard Changes". */
  discardLabel?: string;
}

export function UnsavedChangesDialog({
  open,
  onOpenChange,
  onStay,
  onDiscard,
  title = "Unsaved changes",
  description = "You have unsaved changes. If you close this form, your changes will be lost.",
  stayLabel = "Stay on Form",
  discardLabel = "Discard Changes",
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStay}>
            {stayLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onDiscard}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {discardLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
