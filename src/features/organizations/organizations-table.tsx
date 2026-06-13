"use client";

import { useEffect, useState } from "react";
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
import { MoreHorizontal, Pencil, Ban, CheckCircle, Trash2, Building2 } from "lucide-react";
import type { OwnerCompany } from "@/types/database";
import { OrganizationFormDialog } from "./organization-form-dialog";
import { updateOrganizationStatus, deleteOrganization } from "@/server/actions/organizations";
import { toast } from "sonner";
import { useOrganizationFormPrefetch } from "./hooks/use-organization-form-prefetch";

type OrganizationsTableProps = {
  data: OwnerCompany[];
  userProfileId?: number | string;
  exportConfig?: {
    title: string;
    subtitle?: string;
    filename: string;
    generatedBy?: string;
  };
};

export function OrganizationsTable({ 
  data, 
  userProfileId,
  exportConfig,  // Changed from exportSlot
}: OrganizationsTableProps) {
  const [editingOrg, setEditingOrg] = useState<OwnerCompany | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const prefetchOrgForm = useOrganizationFormPrefetch();
  useEffect(() => {
    prefetchOrgForm();
  }, [prefetchOrgForm]);

  const columns: ColumnDef<OwnerCompany>[] = [
    {
      id: "company",
      accessorKey: "legal_name_en",
      header: "Organization",
      cell: ({ row }) => {
        const org = row.original;
        return (
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{org.legal_name_en}</span>
              <span className="text-xs text-muted-foreground">{org.company_code}</span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "short_name",
      header: "Short Name",
      cell: ({ row }) => {
        const shortName = row.original.short_name;
        return <span className="text-sm">{shortName || "—"}</span>;
      },
    },
    {
      accessorKey: "emirate",
      header: "Emirate",
      cell: ({ row }) => {
        const org = row.original;
        // Phase 002F.3C.4B: Prefer joined emirate_rel over legacy text field
        const emirateName = org.emirate_rel?.name_en || org.emirate;
        return <span className="text-sm">{emirateName || "—"}</span>;
      },
    },
    {
      accessorKey: "default_currency",
      header: "Currency",
      cell: ({ row }) => {
        return <span className="text-sm font-mono">{row.original.default_currency}</span>;
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
        const org = row.original;

        const handleStatusChange = async (newStatus: "active" | "inactive" | "suspended") => {
          const result = await updateOrganizationStatus(org.id, newStatus);
          if (result.success) {
            toast.success(`Organization ${newStatus === "active" ? "activated" : newStatus === "inactive" ? "deactivated" : "suspended"}`);
          } else {
            toast.error(result.error || "Failed to update status");
          }
        };

        const handleDelete = async () => {
          if (!confirm(`Are you sure you want to delete "${org.legal_name_en}"? This action cannot be undone and may fail if there are related records.`)) {
            return;
          }

          const result = await deleteOrganization(org.id);
          if (result.success) {
            toast.success("Organization deleted");
          } else {
            toast.error(result.error || "Failed to delete organization");
          }
        };

        const handleEdit = () => {
          prefetchOrgForm();
          setEditingOrg(org);
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
                {org.status !== "active" && (
                  <DropdownMenuItem onClick={() => handleStatusChange("active")}>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Activate
                  </DropdownMenuItem>
                )}
                {org.status === "active" && (
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
        tableId="admin.organizations"
        columns={columns}
        data={data}
        userProfileId={userProfileId}
        searchPlaceholder="Search organizations..."
        emptyMessage="No organizations found matching your criteria."
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
        <OrganizationFormDialog
          organization={editingOrg}
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingOrg(null);
            }
          }}
        />
      )}
    </>
  );
}
