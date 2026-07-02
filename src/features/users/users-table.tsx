"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MoreHorizontal, Pencil, UserPlus, Ban, Eye, Trash2, ShieldAlert, CheckCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { UserWithRoles, Role, OwnerCompany, Branch } from "@/types/database";
import { cn } from "@/lib/utils";
import { formatRoleScopeLabel } from "@/lib/users/role-scope";
import { AssignRoleDialog } from "./assign-role-dialog";
import { UsersListToolbar } from "./users-list-toolbar";
import { adminUpdateUserProfile, deleteUser } from "@/server/actions/users";
import { toast } from "sonner";

function StatusBadge({ status }: { status: string | null | undefined }) {
  return (
    <Badge
      variant={status === "active" ? "default" : "secondary"}
      className={cn(
        "text-xs font-medium capitalize",
        status === "active" &&
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
        status === "inactive" &&
          "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-400",
        status === "suspended" &&
          "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400",
      )}
    >
      {status ?? "Unknown"}
    </Badge>
  );
}

type StatusChangeTarget = {
  user: UserWithRoles;
  newStatus: "active" | "inactive" | "suspended";
};

type UsersTableProps = {
  data: UserWithRoles[];
  totalCount: number;
  page: number;
  pageSize: number;
  search: string;
  statusFilter: string;
  companyFilter: string;
  branchFilter: string;
  roleFilter: string;
  mcpFilter?: string;
  noRoleFilter?: boolean;
  roles?: Role[];
  companies?: OwnerCompany[];
  branches?: Branch[];
  userProfileId?: number | string;
  exportConfig?: {
    title: string;
    subtitle?: string;
    filename: string;
    generatedBy?: string;
  };
};

const STATUS_CHANGE_COPY: Record<"active" | "inactive" | "suspended", { title: string; description: (name: string) => string }> = {
  active: {
    title: "Activate User?",
    description: (name) => `Activate ${name}? Their account will be restored and they will regain access.`,
  },
  inactive: {
    title: "Deactivate User?",
    description: (name) => `Deactivate ${name}? Their account will be locked and they will lose access immediately.`,
  },
  suspended: {
    title: "Suspend User?",
    description: (name) => `Suspend ${name}? They will be prevented from accessing the ERP until reactivated. This action is audited.`,
  },
};

export function UsersTable({
  data,
  totalCount,
  page,
  pageSize,
  search,
  statusFilter,
  companyFilter,
  branchFilter,
  roleFilter,
  mcpFilter = "",
  noRoleFilter = false,
  roles = [],
  companies = [],
  branches = [],
  userProfileId,
  exportConfig,
}: UsersTableProps) {
  const router = useRouter();
  const [assigningRoleUser, setAssigningRoleUser] = useState<UserWithRoles | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserWithRoles | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusChangeTarget, setStatusChangeTarget] = useState<StatusChangeTarget | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  // Client-side "No Role" filter
  const displayData = noRoleFilter
    ? data.filter((u) => !u.roles || u.roles.length === 0)
    : data;

  const handleStatusChangeConfirm = async () => {
    if (!statusChangeTarget) return;
    setIsChangingStatus(true);
    const result = await adminUpdateUserProfile({
      id: statusChangeTarget.user.id,
      status: statusChangeTarget.newStatus,
    });
    setIsChangingStatus(false);
    if (result.success) {
      toast.success(`User marked as ${statusChangeTarget.newStatus}`);
      setStatusChangeTarget(null);
      router.refresh();
    } else {
      toast.error(result.error || "Failed to update status");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    try {
      const result = await deleteUser(deletingUser.id);
      if (result.success) {
        toast.success(
          `User "${deletingUser.display_name ?? deletingUser.full_name ?? deletingUser.email}" deleted`,
        );
        setDeletingUser(null);
        router.refresh();
      } else {
        toast.error(result.error || "Failed to delete user");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: ColumnDef<UserWithRoles>[] = [
    {
      id: "user",
      header: "User",
      size: 220,
      cell: ({ row }) => {
        const initials = (row.original.display_name ?? row.original.full_name ?? "U")
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);

        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {row.original.display_name ?? row.original.full_name ?? "Unnamed"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {row.original.email ?? row.original.user_code ?? "—"}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: "roles",
      header: "Roles",
      size: 220,
      cell: ({ row }) => {
        const userRoles = row.original.roles ?? [];
        if (userRoles.length === 0) {
          return <span className="text-xs text-amber-600 font-medium">No role</span>;
        }
        return (
          <div className="flex flex-wrap gap-1 max-w-[220px]">
            {userRoles.map((r) => (
              <Badge key={r.user_role_id} variant="secondary" className="text-[10px] font-medium">
                {r.role_name}
                <span className="ml-1 opacity-60">
                  ({formatRoleScopeLabel(r.scope, r.scope_company_name, r.scope_branch_name)})
                </span>
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      id: "organization",
      header: "Organization",
      size: 160,
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.owner_company?.legal_name_en ?? "—"}
        </span>
      ),
    },
    {
      id: "branch",
      header: "Branch",
      size: 130,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.branch?.branch_name_en ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 110,
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <StatusBadge status={row.original.status} />
          {row.original.must_change_password && (
            <span className="text-[10px] text-amber-600 font-medium">⚠ Must change pwd</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Joined",
      size: 100,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {format(new Date(row.original.created_at), "d MMM yyyy")}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      size: 60,
      cell: ({ row }) => {
        const user = row.original;
        const userName = user.display_name ?? user.full_name ?? user.email ?? "this user";
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
                aria-label="Open user actions"
              >
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push(`/admin/users/record/${user.id}`)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push(`/admin/users/record/${user.id}?mode=edit`)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAssigningRoleUser(user)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Assign Role
                </DropdownMenuItem>
                {user.status === "active" && (
                  <>
                    <DropdownMenuItem
                      onClick={() => setStatusChangeTarget({ user, newStatus: "inactive" })}
                    >
                      <Ban className="mr-2 h-4 w-4" />
                      Deactivate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setStatusChangeTarget({ user, newStatus: "suspended" })}
                    >
                      <ShieldAlert className="mr-2 h-4 w-4" />
                      Suspend
                    </DropdownMenuItem>
                  </>
                )}
                {user.status !== "active" && (
                  <DropdownMenuItem
                    onClick={() => setStatusChangeTarget({ user, newStatus: "active" })}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Activate
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeletingUser(user)}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete User
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <UsersListToolbar
        totalCount={noRoleFilter ? displayData.length : totalCount}
        page={page}
        pageSize={pageSize}
        search={search}
        status={statusFilter}
        companyId={companyFilter}
        branchId={branchFilter}
        roleId={roleFilter}
        mcpFilter={mcpFilter}
        noRoleFilter={noRoleFilter}
        roles={roles}
        companies={companies}
        branches={branches}
      />

      <ERPDataTable
        tableId="admin.users"
        columns={columns}
        data={displayData}
        userProfileId={userProfileId}
        searchPlaceholder="Search users..."
        emptyMessage="No users match your filters."
        enableSorting
        enableColumnResizing
        enableRowSelection
        enableColumnVisibility
        enablePreferences
        enableGlobalFilter={false}
        exportConfig={exportConfig}
        initialPageSize={pageSize}
        pageSizeOptions={[10, 25, 50, 100]}
      />

      {assigningRoleUser && (
        <AssignRoleDialog
          user={assigningRoleUser}
          open={Boolean(assigningRoleUser)}
          onOpenChange={(open) => {
            if (!open) setAssigningRoleUser(null);
          }}
          roles={roles}
          companies={companies}
          branches={branches}
        />
      )}

      {/* Status change confirmation */}
      <AlertDialog
        open={Boolean(statusChangeTarget)}
        onOpenChange={(open) => {
          if (!open && !isChangingStatus) setStatusChangeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusChangeTarget ? STATUS_CHANGE_COPY[statusChangeTarget.newStatus].title : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusChangeTarget
                ? STATUS_CHANGE_COPY[statusChangeTarget.newStatus].description(
                    statusChangeTarget.user.display_name ??
                      statusChangeTarget.user.full_name ??
                      statusChangeTarget.user.email ??
                      "this user",
                  )
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isChangingStatus}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleStatusChangeConfirm();
              }}
              disabled={isChangingStatus}
              className={
                statusChangeTarget?.newStatus === "suspended" ||
                statusChangeTarget?.newStatus === "inactive"
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : undefined
              }
            >
              {isChangingStatus
                ? "Updating…"
                : statusChangeTarget?.newStatus === "active"
                  ? "Activate"
                  : statusChangeTarget?.newStatus === "suspended"
                    ? "Suspend"
                    : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={Boolean(deletingUser)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeletingUser(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete User
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete{" "}
              <span className="font-semibold text-foreground">
                {deletingUser?.display_name ??
                  deletingUser?.full_name ??
                  deletingUser?.email ??
                  "this user"}
              </span>
              ?
              <br />
              <br />
              This action <span className="font-semibold text-red-600">cannot be undone</span>. The
              user account, profile, and all associated role assignments will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white"
            >
              {isDeleting ? "Deleting…" : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
