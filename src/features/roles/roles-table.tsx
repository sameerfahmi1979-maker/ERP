"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, CheckCircle, Ban, Trash2, Shield, Eye } from "lucide-react";
import type { Role } from "@/types/database";
import { RoleFormDialog } from "./role-form-dialog";
import { RoleDetailDrawer } from "./role-detail-drawer";
import { updateRoleStatus, deleteRole } from "@/server/actions/roles";
import { toast } from "sonner";

type RolesTableProps = {
  data: Role[];
  userProfileId?: number | string;
  exportConfig?: {
    title: string;
    subtitle?: string;
    filename: string;
    generatedBy?: string;
  };
};

export function RolesTable({ 
  data,
  userProfileId,
  exportConfig,  // Changed from toolbarSlot/exportSlot
}: RolesTableProps) {
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleViewDetails = (roleId: number) => {
    setSelectedRoleId(roleId);
    setIsDrawerOpen(true);
  };

  const columns: ColumnDef<Role>[] = [
    {
      accessorKey: "role_name",
      header: "Role",
      cell: ({ row }) => {
        const role = row.original;
        return (
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Shield className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{role.role_name}</span>
              <span className="text-xs text-muted-foreground">{role.role_code}</span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => {
        const desc = row.original.description;
        return <span className="text-sm text-muted-foreground">{desc || "—"}</span>;
      },
    },
    {
      accessorKey: "is_system_role",
      header: "Type",
      cell: ({ row }) => {
        const isSystem = row.original.is_system_role;
        return (
          <Badge variant={isSystem ? "default" : "secondary"} className="text-xs">
            {isSystem ? "System" : "Custom"}
          </Badge>
        );
      },
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => {
        const isActive = row.original.is_active;
        return (
          <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
            {isActive ? "Active" : "Inactive"}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const role = row.original;

        const handleStatusChange = async () => {
          const result = await updateRoleStatus(role.id, !role.is_active);
          if (result.success) {
            toast.success(`Role ${!role.is_active ? "activated" : "deactivated"}`);
          } else {
            toast.error(result.error || "Failed to update status");
          }
        };

        const handleDelete = async () => {
          if (!confirm(`Are you sure you want to delete "${role.role_name}"?`)) return;
          const result = await deleteRole(role.id);
          if (result.success) {
            toast.success("Role deleted");
          } else {
            toast.error(result.error || "Failed to delete role");
          }
        };

        const handleEdit = () => {
          setEditingRole(role);
          setIsDialogOpen(true);
        };

        return (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleViewDetails(role.id)}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleStatusChange}>
                {role.is_active ? <Ban className="mr-2 h-4 w-4" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                {role.is_active ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
              {!role.is_system_role && (
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <>
      <ERPDataTable
        tableId="admin.roles"
        columns={columns}
        data={data}
        userProfileId={userProfileId}
        searchPlaceholder="Search roles..."
        emptyMessage="No roles found."
        enableSorting
        enableColumnResizing
        enableRowSelection
        enableColumnVisibility
        enablePreferences
        exportConfig={exportConfig}  // Changed from toolbarSlot/exportSlot
        initialPageSize={25}
        pageSizeOptions={[10, 25, 50, 100]}
      />
      {isDialogOpen && (
        <RoleFormDialog
          role={editingRole}
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setEditingRole(null);
          }}
        />
      )}
      <RoleDetailDrawer
        roleId={selectedRoleId}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
      />
    </>
  );
}
