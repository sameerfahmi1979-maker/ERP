"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MoreHorizontal, Pencil, UserPlus, Ban } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserWithRoles, Role, OwnerCompany, Branch } from "@/types/database";
import { cn } from "@/lib/utils";
import { UserEditDialog } from "./user-edit-dialog";
import { AssignRoleDialog } from "./assign-role-dialog";
import { adminUpdateUserProfile } from "@/server/actions/users";
import { toast } from "sonner";

type UsersTableProps = {
  data: UserWithRoles[];
  roles?: Role[];
  companies?: OwnerCompany[];
  branches?: Branch[];
};

export function UsersTable({ data, roles = [], companies = [], branches = [] }: UsersTableProps) {
  const [editingUser, setEditingUser] = useState<UserWithRoles | null>(null);
  const [assigningRoleUser, setAssigningRoleUser] = useState<UserWithRoles | null>(null);

  const handleStatusChange = async (userId: number, newStatus: "active" | "inactive" | "suspended") => {
    const result = await adminUpdateUserProfile({ id: userId, status: newStatus });
    if (result.success) {
      toast.success(`User ${newStatus}`);
    } else {
      toast.error(result.error || "Failed to update status");
    }
  };

  const columns: ColumnDef<UserWithRoles>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
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
                <DropdownMenuItem onClick={() => setEditingUser(user)}>
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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        searchKey="full_name"
        searchPlaceholder="Search users by name, email, or role..."
        emptyMessage="No users found. Sign up and run admin bootstrap after migration."
      />
      
      {editingUser && (
        <UserEditDialog
          user={editingUser}
          open={Boolean(editingUser)}
          onOpenChange={(open) => {
            if (!open) setEditingUser(null);
          }}
          companies={companies}
          branches={branches}
        />
      )}

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
    </>
  );
}
