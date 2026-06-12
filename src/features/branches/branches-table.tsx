"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Ban, CheckCircle, Trash2, GitBranch } from "lucide-react";
import type { BranchWithCompany } from "@/types/database";
import { BranchFormDialog } from "./branch-form-dialog";
import { updateBranchStatus, deleteBranch } from "@/server/actions/branches";
import { toast } from "sonner";
import type { OwnerCompany } from "@/types/database";

type BranchesTableProps = {
  data: BranchWithCompany[];
  companies?: OwnerCompany[];
  userProfileId?: number | string;
  exportConfig?: {
    title: string;
    subtitle?: string;
    filename: string;
    generatedBy?: string;
  };
};

export function BranchesTable({ 
  data, 
  companies = [],
  userProfileId,
  exportConfig,  // Changed from toolbarSlot/exportSlot
}: BranchesTableProps) {
  const [editingBranch, setEditingBranch] = useState<BranchWithCompany | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const columns: ColumnDef<BranchWithCompany>[] = [
    {
      id: "branch",
      accessorKey: "branch_name_en",
      header: "Branch",
      cell: ({ row }) => {
        const branch = row.original;
        return (
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <GitBranch className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{branch.branch_name_en}</span>
              <span className="text-xs text-muted-foreground">{branch.branch_code}</span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "owner_company",
      header: "Organization",
      cell: ({ row }) => {
        const company = row.original.owner_company;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{company?.legal_name_en || "—"}</span>
            <span className="text-xs text-muted-foreground">{company?.company_code || ""}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "emirate",
      header: "Emirate",
      cell: ({ row }) => {
        const emirate = row.original.emirate;
        return <span className="text-sm">{emirate || "—"}</span>;
      },
    },
    {
      accessorKey: "area",
      header: "Area",
      cell: ({ row }) => {
        const area = row.original.area;
        return <span className="text-sm">{area || "—"}</span>;
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge
            variant={
              status === "active" ? "default" : status === "inactive" ? "secondary" : "destructive"
            }
            className="text-xs font-medium"
          >
            {status}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const branch = row.original;

        const handleStatusChange = async (newStatus: "active" | "inactive" | "suspended") => {
          const result = await updateBranchStatus(branch.id, newStatus);
          if (result.success) {
            toast.success(`Branch ${newStatus === "active" ? "activated" : newStatus === "inactive" ? "deactivated" : "suspended"}`);
          } else {
            toast.error(result.error || "Failed to update status");
          }
        };

        const handleDelete = async () => {
          if (!confirm(`Are you sure you want to delete "${branch.branch_name_en}"? This action cannot be undone and may fail if there are related records.`)) {
            return;
          }

          const result = await deleteBranch(branch.id);
          if (result.success) {
            toast.success("Branch deleted");
          } else {
            toast.error(result.error || "Failed to delete branch");
          }
        };

        const handleEdit = () => {
          setEditingBranch(branch);
          setIsDialogOpen(true);
        };

        return (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {branch.status !== "active" && (
                  <DropdownMenuItem onClick={() => handleStatusChange("active")}>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Activate
                  </DropdownMenuItem>
                )}
                {branch.status === "active" && (
                  <DropdownMenuItem onClick={() => handleStatusChange("inactive")}>
                    <Ban className="mr-2 h-4 w-4" />
                    Deactivate
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <>
      <ERPDataTable
        tableId="admin.branches"
        columns={columns}
        data={data}
        userProfileId={userProfileId}
        searchPlaceholder="Search branches..."
        emptyMessage="No branches found matching your criteria."
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
        <BranchFormDialog
          branch={editingBranch}
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingBranch(null);
            }
          }}
          companies={companies}
        />
      )}
    </>
  );
}
