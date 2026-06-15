"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Country } from "@/features/master-data/geography/types";
import type { AuthContext } from "@/lib/rbac/check";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye,
  Pencil,
  Power,
  Trash2,
  MoreHorizontal,
  Plus,
  Lock,
  Unlock,
  Shield,
} from "lucide-react";
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
import { toggleCountryStatus, deleteCountry, toggleCountryLock } from "@/features/master-data/geography/actions";
import { toast } from "sonner";
import { format } from "date-fns";

type CountriesTableProps = {
  countries: Country[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/geography/countries";

export function CountriesTable({ countries, authContext, onRefresh }: CountriesTableProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [countryToDelete, setCountryToDelete] = useState<Country | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRefresh = () => {
    if (onRefresh) { onRefresh(); } else { router.refresh(); }
  };

  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (country: Country) => router.push(`${BASE}/record/${country.id}`);
  const handleEdit = (country: Country) => router.push(`${BASE}/record/${country.id}?mode=edit`);

  const handleToggleActive = async (country: Country) => {
    const result = await toggleCountryStatus({
      id: country.id,
      is_active: !country.is_active,
    });
    if (result.success) {
      toast.success(`Country ${country.is_active ? "deactivated" : "activated"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle country status");
    }
  };

  const handleToggleLock = async (country: Country) => {
    const result = await toggleCountryLock(country.id, !country.is_locked);
    if (result.success) {
      toast.success(`Country ${country.is_locked ? "unlocked" : "locked"} successfully`);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to toggle country lock");
    }
  };

  const handleDeleteClick = (country: Country) => {
    setCountryToDelete(country);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!countryToDelete) return;

    setIsDeleting(true);
    const result = await deleteCountry(countryToDelete.id);
    setIsDeleting(false);

    if (result.success) {
      toast.success("Country deleted successfully");
      setDeleteDialogOpen(false);
      setCountryToDelete(null);
      handleRefresh();
    } else {
      toast.error(result.error ?? "Failed to delete country");
    }
  };


  const columns: ColumnDef<Country>[] = [
    {
      accessorKey: "country_code",
      accessorFn: (row) => `${row.name_en} ${row.country_code} ${row.iso3_code}`,
      header: "Country",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.name_en}</span>
            {row.original.is_system && (
              <Shield className="h-3 w-3 text-amber-600" />
            )}
            {row.original.is_locked && (
              <Lock className="h-3 w-3 text-destructive" />
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {row.original.country_code} / {row.original.iso3_code}
          </span>
        </div>
      ),
      meta: {
        exportable: true,
        exportHeader: "Country Code",
        exportValue: (row) => row.country_code,
      },
    },
    {
      accessorKey: "nationality_en",
      header: "Nationality",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.nationality_en}</span>
      ),
      meta: {
        exportable: true,
        exportHeader: "Nationality",
        exportValue: (row) => row.nationality_en,
      },
    },
    {
      accessorKey: "phone_code",
      header: "Phone",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.phone_code || "—"}</span>
      ),
      meta: {
        exportable: true,
        exportHeader: "Phone Code",
        exportValue: (row) => row.phone_code || "",
      },
    },
    {
      accessorKey: "default_currency_code",
      header: "Currency",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.default_currency_code || "—"}</span>
      ),
      meta: {
        exportable: true,
        exportHeader: "Currency",
        exportValue: (row) => row.default_currency_code || "",
      },
    },
    {
      id: "classifications",
      header: "Classification",
      cell: ({ row }) => {
        const country = row.original;
        return (
          <div className="flex gap-1 flex-wrap">
            {country.is_gcc && (
              <Badge variant="outline" className="text-xs">
                GCC
              </Badge>
            )}
            {country.is_uae && (
              <Badge variant="default" className="text-xs">
                UAE
              </Badge>
            )}
          </div>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "GCC",
        exportValue: (row) => row.is_gcc ? "Yes" : "No",
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
      meta: {
        exportable: true,
        exportHeader: "Status",
        exportValue: (row) => row.is_active ? "Active" : "Inactive",
      },
    },
    {
      accessorKey: "updated_at",
      header: "Updated",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {format(new Date(row.original.updated_at), "yyyy-MM-dd HH:mm")}
        </span>
      ),
      meta: {
        exportable: true,
        exportHeader: "Updated At",
        exportValue: (row) => row.updated_at,
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const country = row.original;
        return (
          <CountryActionsCell
            country={country}
            authContext={authContext}
            onView={() => handleView(country)}
            onEdit={() => handleEdit(country)}
            onToggleActive={() => handleToggleActive(country)}
            onToggleLock={() => handleToggleLock(country)}
            onDelete={() => handleDeleteClick(country)}
          />
        );
      },
      meta: {
        exportable: false,
      },
    },
  ];

  return (
    <>
      <ERPDataTable<Country>
        tableId="countries_table"
        columns={columns}
        data={countries}
        enableSorting={true}
        enableColumnResizing={true}
        enableRowSelection={true}
        enableColumnVisibility={true}
        enablePreferences={true}
        searchPlaceholder="Search countries by code, name, or nationality..."
        enableGlobalFilter={true}
        initialPageSize={25}
        exportConfig={{
          title: "Countries Master Data",
          subtitle: `${countries.length} countr${countries.length !== 1 ? "ies" : "y"} configured`,
          filename: "countries-master-data",
          orientation: "landscape",
        }}
        toolbarSlot={
          <Button onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Country
          </Button>
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Country</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="space-y-2 block">
                <span className="block">
                  Are you sure you want to permanently delete{" "}
                  <strong>{countryToDelete?.name_en}</strong> ({countryToDelete?.country_code})?
                </span>
                <span className="block text-destructive font-semibold">
                  This action cannot be undone. All related data (emirates, cities, areas, ports) must be removed first.
                </span>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CountryActionsCell({
  country,
  authContext,
  onView,
  onEdit,
  onToggleActive,
  onToggleLock,
  onDelete,
}: {
  country: Country;
  authContext: AuthContext;
  onView: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
}) {
  const isSystemAdmin = authContext.roleCodes.includes("system_admin");
  const hasManagePermission = authContext.permissionCodes.includes("master_data.geography.manage");
  const hasLockPermission = authContext.permissionCodes.includes("master_data.lookups.lock");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onView}>
            <Eye className="h-4 w-4 mr-2" />
            View Details
          </DropdownMenuItem>
          {hasManagePermission && (
            <DropdownMenuItem
              onClick={onEdit}
              disabled={country.is_locked && !isSystemAdmin}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        {hasManagePermission && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={onToggleActive}
                disabled={country.is_locked && !isSystemAdmin}
              >
                <Power className="h-4 w-4 mr-2" />
                {country.is_active ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
              {(isSystemAdmin || hasLockPermission) && (
                <DropdownMenuItem onClick={onToggleLock}>
                  {country.is_locked ? (
                    <>
                      <Unlock className="h-4 w-4 mr-2" />
                      Unlock
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 mr-2" />
                      Lock
                    </>
                  )}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </>
        )}
        {isSystemAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Permanently
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
