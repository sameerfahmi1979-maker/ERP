"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { saveRolePermissionDraftChanges } from "@/server/actions/permissions";
import { Button } from "@/components/ui/button";
import { getRolePermissionsAction } from "@/server/actions/roles";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Lock, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import { parsePermissionDraft, type PermissionDraft } from "./permission-draft";
import { permissionModuleLabel } from "@/lib/rbac/permission-taxonomy";

type Props = {
  roleId: number;
  isSystemRole: boolean;
  canManage: boolean;
  isGlobalAdmin: boolean;
  onDirtyChange?: (dirty: boolean) => void;
};

export function RolePermissionsSection({ roleId, isSystemRole, canManage, isGlobalAdmin, onDirtyChange }: Props) {
  const router = useRouter();
  const canEdit = canManage && (!isSystemRole || isGlobalAdmin);
  const { getDraftDefault, writeDraftField, clearDraft } = useWorkspaceFormDraft({
    formId: `role-permission-draft-${roleId}`, enabled: canEdit,
  });
  const [toggling, setToggling] = useState<number | null>(null);
  const [draft, setDraft] = useState<PermissionDraft>(() => parsePermissionDraft(getDraftDefault("permission_changes", "{}")));
  const [reviewing, setReviewing] = useState(false);

  const dirty = Object.keys(draft).length > 0;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const { data: groups = [], isFetching: isLoading, refetch, error } = useQuery({
    queryKey: ["role-permissions", roleId],
    queryFn: async () => {
      const result = await getRolePermissionsAction(roleId);
      if (!result.success || !result.data) throw new Error(result.error ?? "Failed to load role permissions");
      return result.data.groups;
    },
    retry: false, gcTime: 0, refetchOnWindowFocus: false,
  });
  useEffect(() => { if (error) toast.error(error.message); }, [error]);

  const handleToggle = (permId: number, originallyAssigned: boolean) => {
    if (!canEdit || toggling !== null) return;
    setReviewing(false);
    const next = { ...draft };
    const expectedAssigned = draft[permId]?.expectedAssigned ?? originallyAssigned;
    const assigned = !(draft[permId]?.assigned ?? originallyAssigned);
    if (assigned === expectedAssigned) delete next[permId]; else next[permId] = { assigned, expectedAssigned };
    writeDraftField("permission_changes", JSON.stringify(next));
    setDraft(next);
  };
  const handleApply = async () => {
    if (!canEdit) return;
    setToggling(-1);
    try {
      const result = await saveRolePermissionDraftChanges(Object.entries(draft).map(([id,change]) => ({
        permissionId: Number(id), roleId, action: change.assigned ? "grant" : "revoke", expectedAssigned: change.expectedAssigned, permissionCode: "", permissionName: "", roleCode: "", roleName: "",
      })));

      if (result.success) {
        toast.success("Reviewed permission changes applied");
        clearDraft(); setDraft({}); setReviewing(false);
        router.refresh();
        await refetch();
      } else {
        toast.error(result.error ?? "Failed to update permission");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setToggling(null);
    }
  };

  const totalAssigned = groups.reduce((n, g) => n + g.permissions.filter((p) => p.assigned).length, 0);
  const totalPerms = groups.reduce((n, g) => n + g.permissions.length, 0);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{totalAssigned} / {totalPerms} permissions assigned</span>
        </div>
        <a
          href="/admin/permissions"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Full Permissions Matrix
        </a>
      </div>

      {/* System role warning */}
      {isSystemRole && (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
          isGlobalAdmin
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-border bg-muted/30 text-muted-foreground"
        }`}>
          {isGlobalAdmin ? (
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          ) : (
            <Lock className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>
            {isGlobalAdmin
              ? "This is a system role. You have global admin access to edit permissions — proceed with caution."
              : "This is a system role. Only global administrators can modify its permissions."}
          </span>
        </div>
      )}

      {/* Permission groups */}
      {canEdit && Object.keys(draft).length > 0 && <div className="rounded-md border p-3 space-y-3">
        <p role="status">{Object.keys(draft).length} unsaved permission changes. Nothing is applied until you review and confirm.</p>
        {reviewing && <ul className="list-disc pl-5">{Object.entries(draft).map(([id,change]) => <li key={id}>{change.assigned ? "Grant" : "Revoke"}: {groups.flatMap(g => g.permissions).find(p => p.id === Number(id))?.permission_name ?? id}</li>)}</ul>}
        <div className="flex gap-2"><Button type="button" variant="outline" disabled={toggling !== null} onClick={() => { clearDraft(); setDraft({}); setReviewing(false); }}>Discard changes</Button>
          {reviewing ? <Button type="button" disabled={toggling !== null} onClick={handleApply}>Apply reviewed changes</Button> : <Button type="button" onClick={() => setReviewing(true)}>Review changes</Button>}
        </div>
      </div>}
      <div className="space-y-4">
        {groups.map((group) => {
          const assignedCount = group.permissions.filter((p) => p.assigned).length;
          return (
            <div key={group.module_code} className="rounded-lg border">
              <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold capitalize">
                    {permissionModuleLabel(group.module_code)}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {assignedCount}/{group.permissions.length}
                  </Badge>
                </div>
              </div>
              <div className="divide-y">
                {group.permissions.map((perm) => (
                  <div
                    key={perm.id}
                    className={`flex items-center gap-3 px-4 py-2.5 ${
                      !perm.is_active ? "opacity-50" : ""
                    }`}
                  >
                    <Checkbox
                      id={`perm-${perm.id}`}
                      checked={draft[perm.id]?.assigned ?? perm.assigned}
                      disabled={!canEdit || toggling !== null || !perm.is_active}
                      onCheckedChange={() => handleToggle(perm.id, perm.assigned)}
                      className="shrink-0"
                    />
                    <label
                      htmlFor={`perm-${perm.id}`}
                      className={`flex-1 cursor-pointer ${!canEdit ? "cursor-default" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{perm.permission_name}</span>
                        {!perm.is_active && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono text-muted-foreground">{perm.permission_code}</span>
                        {perm.description && (
                          <span className="text-xs text-muted-foreground">— {perm.description}</span>
                        )}
                      </div>
                    </label>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {perm.action_code}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {groups.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <Lock className="h-8 w-8 opacity-30" />
          <p className="text-sm">No permissions found</p>
        </div>
      )}
    </div>
  );
}
