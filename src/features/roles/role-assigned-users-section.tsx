"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Users, ExternalLink, UserMinus } from "lucide-react";
import { getRoleWithUsersAction, type AssignedUserRow } from "@/server/actions/roles";
import { removeRoleFromUser } from "@/server/actions/users";
import { useWorkspace } from "@/hooks/use-workspace";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  inactive: "outline",
  suspended: "destructive",
  terminated: "destructive",
};

type Props = {
  roleId: number;
  roleName: string;
  canManageUsers: boolean;
};

export function RoleAssignedUsersSection({ roleId, roleName, canManageUsers }: Props) {
  const router = useRouter();
  const { openTab } = useWorkspace();
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<AssignedUserRow[]>([]);
  const [deassignTarget, setDeassignTarget] = useState<AssignedUserRow | null>(null);
  const [isDeassigning, setIsDeassigning] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await getRoleWithUsersAction(roleId);
    if (result.success && result.data) {
      setUsers(result.data.assigned_users);
    }
    setIsLoading(false);
  }, [roleId]);

  useEffect(() => { load(); }, [load]);

  const handleDeassign = async () => {
    if (!deassignTarget) return;
    setIsDeassigning(true);
    try {
      const result = await removeRoleFromUser({ user_role_id: deassignTarget.user_role_id });
      if (result.success) {
        toast.success("Role removed from user");
        router.refresh();
        await load();
      } else {
        toast.error(result.error ?? "Failed to remove role");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsDeassigning(false);
      setDeassignTarget(null);
    }
  };

  const handleOpenUser = (u: AssignedUserRow) => {
    openTab({
      route: `/admin/users/record/${u.user_profile_id}?mode=view`,
      title: u.full_name ?? u.user_code ?? `User ${u.user_profile_id}`,
      subtitle: u.user_code ?? undefined,
      tabKind: "record",
      entityType: "user",
      entityId: u.user_profile_id,
      formMode: "view",
      closable: true,
    });
  };

  const displayed = showInactive ? users : users.filter((u) => u.is_active);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{users.length} assignment{users.length !== 1 ? "s" : ""} total</span>
        </div>
        {users.some((u) => !u.is_active) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setShowInactive((v) => !v)}
          >
            {showInactive ? "Hide inactive" : `Show inactive (${users.filter((u) => !u.is_active).length})`}
          </Button>
        )}
      </div>

      {displayed.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <Users className="h-8 w-8 opacity-30" />
          <p className="text-sm">
            {users.length === 0
              ? `No users are assigned the "${roleName}" role`
              : "No active assignments to show"}
          </p>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Assigned At</TableHead>
                <TableHead>Assigned By</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.map((u) => (
                <TableRow key={u.user_role_id} className={!u.is_active ? "opacity-60" : undefined}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-sm">{u.full_name ?? u.display_name ?? "—"}</span>
                      {u.user_code && (
                        <span className="text-xs font-mono text-muted-foreground">{u.user_code}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.email ?? "—"}
                  </TableCell>
                  <TableCell>
                    {u.status ? (
                      <Badge
                        variant={STATUS_VARIANT[u.status] ?? "secondary"}
                        className="text-xs capitalize"
                      >
                        {u.status}
                      </Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{u.scope_label}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {u.assigned_at
                      ? new Date(u.assigned_at).toLocaleDateString("en-GB", {
                          day: "2-digit", month: "short", year: "numeric",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.assigned_by_name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleOpenUser(u)}
                        title="Open user record"
                        aria-label="Open user record"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      {canManageUsers && u.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => setDeassignTarget(u)}
                          title="Remove role from user"
                          aria-label="Remove role from user"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!deassignTarget} onOpenChange={(o) => !o && setDeassignTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Role Assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove the <strong>{roleName}</strong> role from{" "}
              <strong>{deassignTarget?.full_name ?? deassignTarget?.user_code}</strong>?
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeassigning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeassign}
              disabled={isDeassigning}
            >
              {isDeassigning ? "Removing..." : "Remove Role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
