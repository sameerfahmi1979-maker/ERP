"use client";

import { AlertTriangle, Check, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { PermissionDraftChange } from "./permission-command-center";

type ReviewSaveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changes: PermissionDraftChange[];
  onConfirm: () => Promise<void>;
  isSaving: boolean;
  failedKeys: Set<string>;
};

type GroupedByPermission = {
  permissionId: number;
  permissionCode: string;
  permissionName: string;
  grants: PermissionDraftChange[];
  revokes: PermissionDraftChange[];
};

export function PermissionReviewSaveDialog({
  open,
  onOpenChange,
  changes,
  onConfirm,
  isSaving,
  failedKeys,
}: ReviewSaveDialogProps) {
  const grantCount = changes.filter((c) => c.action === "grant").length;
  const revokeCount = changes.filter((c) => c.action === "revoke").length;
  const hasSystemRoleChanges = changes.some((c) => c.roleIsSystem);
  const hasSystemPermChanges = changes.some((c) => c.permissionIsSystem);

  // Group by permission
  const byPermission = changes.reduce(
    (acc, c) => {
      const key = `${c.permissionId}`;
      if (!acc[key]) {
        acc[key] = {
          permissionId: c.permissionId,
          permissionCode: c.permissionCode,
          permissionName: c.permissionName,
          grants: [],
          revokes: [],
        };
      }
      if (c.action === "grant") acc[key].grants.push(c);
      else acc[key].revokes.push(c);
      return acc;
    },
    {} as Record<string, GroupedByPermission>,
  );

  const groupedList = Object.values(byPermission);

  return (
    <AlertDialog open={open} onOpenChange={isSaving ? undefined : onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
        <AlertDialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <AlertDialogTitle className="text-lg">Review Permission Changes</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 mt-1">
              {/* Summary strip */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground font-medium">
                  {changes.length} pending change{changes.length !== 1 ? "s" : ""}
                </span>
                {grantCount > 0 && (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    {grantCount} grant{grantCount !== 1 ? "s" : ""}
                  </Badge>
                )}
                {revokeCount > 0 && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
                    <X className="h-3 w-3 mr-1" />
                    {revokeCount} revoke{revokeCount !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>

              {/* Warnings */}
              {(hasSystemRoleChanges || hasSystemPermChanges) && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800">
                    <strong>Warning:</strong> These changes include{" "}
                    {hasSystemRoleChanges && "system roles"}
                    {hasSystemRoleChanges && hasSystemPermChanges && " and "}
                    {hasSystemPermChanges && "system permissions"} that affect all users with those
                    roles. Review carefully before saving.
                  </p>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Changes affect user access immediately after saving.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Change list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4 space-y-4">
            {groupedList.map((group) => (
              <div key={group.permissionId} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{group.permissionName}</span>
                  <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {group.permissionCode}
                  </span>
                </div>

                {group.grants.length > 0 && (
                  <div className="ml-3 space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Grant to:</p>
                    {group.grants.map((c) => {
                      const key = `${c.permissionId}:${c.roleId}`;
                      const failed = failedKeys.has(key);
                      return (
                        <div key={c.roleId} className={cn("flex items-center gap-2 text-sm", failed && "text-destructive")}>
                          <Check className={cn("h-3 w-3", failed ? "text-destructive" : "text-emerald-600")} />
                          <span>{c.roleName}</span>
                          {c.roleIsSystem && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1 border-blue-300 text-blue-700">
                              System
                            </Badge>
                          )}
                          {failed && <span className="text-xs text-destructive ml-auto">Failed</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {group.revokes.length > 0 && (
                  <div className="ml-3 space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Revoke from:</p>
                    {group.revokes.map((c) => {
                      const key = `${c.permissionId}:${c.roleId}`;
                      const failed = failedKeys.has(key);
                      return (
                        <div key={c.roleId} className={cn("flex items-center gap-2 text-sm", failed && "text-destructive")}>
                          <X className={cn("h-3 w-3", failed ? "text-destructive" : "text-amber-500")} />
                          <span>{c.roleName}</span>
                          {c.roleIsSystem && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1 border-blue-300 text-blue-700">
                              System
                            </Badge>
                          )}
                          {failed && <span className="text-xs text-destructive ml-auto">Failed</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <AlertDialogFooter className="px-6 py-4 border-t shrink-0">
          <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isSaving || changes.length === 0}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="min-w-[120px]"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Saving…
              </span>
            ) : (
              "Confirm & Save"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
