"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MoreHorizontal, Pencil, UserPlus, Ban, Eye, Trash2 } from "lucide-react";
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
import { AssignRoleDialog } from "./assign-role-dialog";
import { adminUpdateUserProfile, deleteUser } from "@/server/actions/users";
import { toast } from "sonner";

type UsersTableProps = {
  data: UserWithRoles[];
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

export function UsersTable({
  data,
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

  const handleStatusChange = async (userId: number, newStatus: "active" | "inactive" | "suspended") => {
    const result = await adminUpdateUserProfile({ id: userId, status: newStatus });
    if (result.success) {
      toast.success(`User ${newStatus}`);
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
        toast.success(`User "${deletingUser.display_name ?? deletingUser.full_name ?? deletingUser.email}" deleted`);
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
      header: "Role",
      cell: ({ row }) => {
        const primaryRole = row.original.roles?.[0];
        return primaryRole ? (
          <Badge variant="secondary" className="text-xs font-medium">
            {primaryRole.role_name}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">No role</span>
        );
      },
    },
    {
      id: "organization",
      header: "Organization",
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.owner_company?.legal_name_en ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge
            variant={status === "active" ? "default" : "secondary"}
            className={cn(
              "text-xs font-medium",
              status === "active" &&
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
              status === "inactive" &&
                "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-400"
            )}
          >
            {status ?? "Unknown"}
          </Badge>
        );
      },
    },
    {
      accessorKey: "created_at",
      header: "Joined",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {format(new Date(row.original.created_at), "d MMM yyyy")}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push(`/admin/users/record/${user.id}`)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push(`/admin/users/record/${user.id}?mode=edit`)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAssigningRoleUser(user)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Assign Role
                </DropdownMenuItem>
                {user.status === "active" && (
                  <DropdownMenuItem onClick={() => handleStatusChange(user.id, "inactive")}>
                    <Ban className="mr-2 h-4 w-4" />
                    Deactivate
                  </DropdownMenuItem>
                )}
                {user.status !== "active" && (
                  <DropdownMenuItem onClick={() => handleStatusChange(user.id, "active")}>
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
      <ERPDataTable
        tableId="admin.users"
        columns={columns}
        data={data}
        userProfileId={userProfileId}
        searchPlaceholder="Search users by name, email, or role..."
        emptyMessage="No users found. Sign up and run admin bootstrap after migration."
        enableSorting
        enableColumnResizing
        enableRowSelection
        enableColumnVisibility
        enablePreferences
        exportConfig={exportConfig}
        initialPageSize={25}
        pageSizeOptions={[10, 25, 50, 100]}
      />

      {assigningRoleUser && (
        <AssignRoleDialog
          user={assigningRoleUser}
          open={Boolean(assigningRoleUser)}
          onOpenChange={(open) => { if (!open) setAssigningRoleUser(null); }}
          roles={roles}
          companies={companies}
          branches={branches}
        />
      )}

      <AlertDialog
        open={Boolean(deletingUser)}
        onOpenChange={(open) => { if (!open && !isDeleting) setDeletingUser(null); }}
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
                {deletingUser?.display_name ?? deletingUser?.full_name ?? deletingUser?.email ?? "this user"}
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
