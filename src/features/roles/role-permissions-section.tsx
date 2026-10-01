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
import { useEffect, useRef, useState } from "react";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
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
  const saving = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    if (!canEdit || saving.current || !reviewing || !Object.keys(draft).length) return;
    saving.current = true;
    setSaveError(null);
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
        setSaveError("Permission changes could not be applied. Your draft is retained; reload the current permissions and review before retrying.");
        toast.error(result.error ?? "Failed to update permission");
      }
    } catch {
      setSaveError("The save could not be confirmed. Your draft is retained; reload the current permissions and review before retrying.");
      toast.error("An unexpected error occurred");
    } finally {
      saving.current = false;
      setToggling(null);
    }
  };

  const totalAssigned = groups.reduce((n, g) => n + g.permissions.filter((p) => p.assigned).length, 0);
  const totalPerms = groups.reduce((n, g) => n + g.permissions.length, 0);
  const rows = groups.flatMap(group => group.permissions.map(permission => ({ ...permission, moduleLabel: permissionModuleLabel(group.module_code) })));
  type PermissionRow = typeof rows[number];
  const columns: ColumnDef<PermissionRow>[] = [
    { id: "permission", header: "Permission", size: 300, accessorFn: p => `${p.permission_name} ${p.permission_code}`, cell: ({ row }) => <div><p className="font-medium">{row.original.permission_name}</p><p className="text-xs text-muted-foreground">{row.original.permission_code}</p></div> },
    { accessorKey: "moduleLabel", header: "Module" },
    { accessorKey: "description", header: "Description", size: 300 },
    { accessorKey: "action_code", header: "Action" },
    { id: "status", header: "Status", accessorFn: p => p.is_active ? "Active" : "Inactive" },
    { id: "actions", header: "Assigned / draft", accessorFn: p => (draft[p.id]?.assigned ?? p.assigned) ? "Assigned" : "Not assigned", cell: ({ row }) => <div className="flex items-center gap-2"><Checkbox aria-label={`Assign ${row.original.permission_name}`} checked={draft[row.original.id]?.assigned ?? row.original.assigned} disabled={!canEdit || toggling !== null || !row.original.is_active} onCheckedChange={() => handleToggle(row.original.id, row.original.assigned)}/>{draft[row.original.id] && <Badge variant="outline">Unsaved</Badge>}</div> },
  ];

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
      <div className="flex flex-wrap items-center justify-between gap-3">
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
      {(error || saveError) && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <p>{saveError ?? "Role permissions could not be loaded. No changes have been applied."}</p>
        <Button type="button" variant="outline" disabled={toggling !== null} onClick={() => { setReviewing(false); void refetch(); }}>Reload permissions</Button>
      </div>}
      {!error && <ERPDataTable tableId={`role.permissions:${roleId}`} resultsLabel="Role permissions" data={rows} columns={columns} enableRowSelection={false}/>}
    </div>
  );
}
