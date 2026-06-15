"use client";

/**
 * ERP GLOBAL UI.4D — PartiesTable
 *
 * Converted from drawer-based to workspace record-tab navigation.
 * Add / Edit / View now open workspace record tabs under /record/new and /record/{id}.
 * Drawer state (selected, isFormOpen, formMode) removed.
 */

import { useRouter } from "next/navigation";
import type { Party } from "@/features/master-data/parties/party-types";
import type { AuthContext } from "@/lib/rbac/check";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, MoreVertical, Eye, Edit, Power } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deactivateParty, reactivateParty } from "@/server/actions/master-data/parties";
import { toast } from "sonner";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchPartyFormData } from "./party-form-prefetch";
import { useWorkspace } from "@/hooks/use-workspace";

type PartiesTableProps = {
  parties: Party[];
  authContext: AuthContext;
  onRefresh?: () => void;
  defaultTypeCode?: string | null;
  pageTitle?: string | null;
};

// Maps party type codes to friendly "Add" labels
const PARTY_TYPE_CODE_LABELS: Record<string, string> = {
  CUSTOMER: "Customer",
  VENDOR: "Vendor",
  SUBCONTRACTOR: "Subcontractor",
  CONSULTANT: "Consultant",
  RECRUITMENT_AGENCY: "Recruitment Agency",
  GOVERNMENT_AUTHORITY: "Government Authority",
  INSURANCE_COMPANY: "Insurance Company",
  LICENSE_ISSUER: "License Issuer",
};

// Codes that are valid for defaultType param (excludes BANK per spec)
const ALLOWED_DEFAULT_TYPE_CODES = new Set(Object.keys(PARTY_TYPE_CODE_LABELS));

export function PartiesTable({ parties, authContext, onRefresh, defaultTypeCode, pageTitle }: PartiesTableProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { openTab } = useWorkspace();

  const canCreate = authContext.permissionCodes?.includes("master_data.parties.create");
  const canEdit = authContext.permissionCodes?.includes("master_data.parties.edit");
  const canDeactivate = authContext.permissionCodes?.includes("master_data.parties.deactivate");

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    else router.refresh();
  };

  // ── Open record workspace tab ──────────────────────────────────────────────

  const openAdd = () => {
    prefetchPartyFormData(queryClient).catch(() => {});
    const validCode = defaultTypeCode && ALLOWED_DEFAULT_TYPE_CODES.has(defaultTypeCode)
      ? defaultTypeCode
      : null;
    const friendlyLabel = validCode ? PARTY_TYPE_CODE_LABELS[validCode] : null;
    openTab({
      route: validCode
        ? `/admin/master-data/parties/record/new?defaultType=${validCode}`
        : "/admin/master-data/parties/record/new",
      title: friendlyLabel ? `New ${friendlyLabel}` : "New Party",
      tabKind: "record",
      entityType: "party",
      formMode: "add",
      closable: true,
    });
  };

  const openView = (item: Party) => {
    openTab({
      route: `/admin/master-data/parties/record/${item.id}?mode=view`,
      title: `Party — ${item.display_name ?? item.party_code}`,
      subtitle: item.party_code ?? undefined,
      tabKind: "record",
      entityType: "party",
      entityId: item.id,
      formMode: "view",
      closable: true,
    });
  };

  const openEdit = (item: Party) => {
    prefetchPartyFormData(queryClient).catch(() => {});
    openTab({
      route: `/admin/master-data/parties/record/${item.id}?mode=edit`,
      title: `Party — ${item.display_name ?? item.party_code}`,
      subtitle: item.party_code ?? undefined,
      tabKind: "record",
      entityType: "party",
      entityId: item.id,
      formMode: "edit",
      closable: true,
    });
  };

  // ── Columns ────────────────────────────────────────────────────────────────

  const columns: ColumnDef<Party>[] = [
    {
      accessorKey: "party_code",
      header: "Party Code",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.party_code}</span>
      ),
      meta: { exportable: true },
    },
    {
      accessorKey: "display_name",
      header: "Display Name",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.display_name}</span>
          {row.original.legal_name_en !== row.original.display_name && (
            <span className="text-xs text-muted-foreground">{row.original.legal_name_en}</span>
          )}
        </div>
      ),
      meta: { exportable: true },
    },
    {
      id: "party_types",
      header: "Party Types",
      cell: ({ row }) => {
        const typeCodes = row.original.assigned_type_codes ?? [];
        const primaryType = row.original.primary_type_name;
        return (
          <div className="flex flex-wrap gap-1">
            {primaryType && (
              <Badge variant="default" className="text-xs">{primaryType}</Badge>
            )}
            {typeCodes.length > 1 && (
              <Badge variant="outline" className="text-xs">+{typeCodes.length - 1}</Badge>
            )}
          </div>
        );
      },
      meta: { exportable: true },
    },
    {
      accessorKey: "party_status_name",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Badge variant={row.original.is_active ? "default" : "secondary"}>
            {row.original.party_status_name ?? (row.original.is_active ? "Active" : "Inactive")}
          </Badge>
        </div>
      ),
      meta: { exportable: true },
    },
    {
      accessorKey: "country_name",
      header: "Country",
      cell: ({ row }) => <span className="text-sm">{row.original.country_name ?? "—"}</span>,
      meta: { exportable: true },
    },
    {
      accessorKey: "emirate_name",
      header: "Emirate",
      cell: ({ row }) => <span className="text-sm">{row.original.emirate_name ?? "—"}</span>,
      meta: { exportable: true },
    },
    {
      accessorKey: "main_phone",
      header: "Phone",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.main_phone ?? row.original.main_mobile ?? "—"}</span>
      ),
      meta: { exportable: true },
    },
    {
      accessorKey: "main_email",
      header: "Email",
      cell: ({ row }) => <span className="text-sm">{row.original.main_email ?? "—"}</span>,
      meta: { exportable: true },
    },
    {
      accessorKey: "updated_at",
      header: "Updated",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {format(new Date(row.original.updated_at), "yyyy-MM-dd")}
        </span>
      ),
      meta: { exportable: true },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground p-0">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openView(item)}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </DropdownMenuItem>
              {canEdit && !item.is_locked && (
                <DropdownMenuItem onClick={() => openEdit(item)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {canDeactivate && !item.is_locked && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      const result = item.is_active
                        ? await deactivateParty(item.id)
                        : await reactivateParty(item.id);
                      if (result.success) {
                        toast.success(`Party ${item.is_active ? "deactivated" : "reactivated"}`);
                        handleRefresh();
                      } else {
                        toast.error(result.error ?? "Failed to toggle status");
                      }
                    }}
                  >
                    <Power className="mr-2 h-4 w-4" />
                    {item.is_active ? "Deactivate" : "Reactivate"}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      meta: { exportable: false },
    },
  ];

  return (
    <ERPDataTable<Party>
      tableId="parties_table"
      columns={columns}
      data={parties}
      enableSorting
      enableColumnResizing
      enableRowSelection
      enableColumnVisibility
      enablePreferences
      searchPlaceholder="Search by code, name, email, phone..."
      enableGlobalFilter
      initialPageSize={25}
      exportConfig={{
        title: "Party Master Data",
        subtitle: `${parties.length} part${parties.length !== 1 ? "ies" : "y"} registered`,
        filename: "party-master-data",
        orientation: "landscape",
      }}
      toolbarSlot={
        canCreate ? (
          <Button onClick={openAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Party
          </Button>
        ) : null
      }
    />
  );
}
