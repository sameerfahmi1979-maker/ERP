"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Country } from "@/features/master-data/geography/types";
import type { AuthContext } from "@/lib/rbac/check";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {Plus,Lock,Shield} from "lucide-react";
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
import {hasGlobalPermission} from "@/lib/rbac/scope";
import {useGeographyLifecycle,GeographyLifecycleNotice,GeographyActionsCell} from "./geography-lifecycle";
import { format } from "date-fns";

type CountriesTableProps = {
  countries: Country[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/geography/countries";

export function CountriesTable(props:CountriesTableProps){
 return <CountriesTableSession key={props.authContext.profile?.id??'none'} {...props}/>;
}
function CountriesTableSession({ countries, authContext, onRefresh }: CountriesTableProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [countryToDelete, setCountryToDelete] = useState<Country | null>(null);
  const lifecycle=useGeographyLifecycle('countries',()=>{setDeleteDialogOpen(false);setCountryToDelete(null);if(onRefresh)onRefresh();else router.refresh();});
  const isDeleting=lifecycle.busy;


  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (country: Country) => router.push(`${BASE}/record/${country.id}`);
  const handleEdit = (country: Country) => router.push(`${BASE}/record/${country.id}?mode=edit`);

  const handleToggleActive=(country:Country)=>lifecycle.change(country,'active');
  const handleToggleLock=(country:Country)=>lifecycle.change(country,'lock');
  const handleDeleteClick=(country:Country)=>{setCountryToDelete(country);setDeleteDialogOpen(true);};
  const handleDeleteConfirm=()=>countryToDelete?lifecycle.change(countryToDelete,'retire'):Promise.resolve(false);

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
          <GeographyActionsCell disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError}
            row={country}
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
      {!deleteDialogOpen&&<GeographyLifecycleNotice state={lifecycle}/>}
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
          <Button disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError||!hasGlobalPermission(authContext,'master_data.geography.manage')} onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Country
          </Button>
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire Country</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="space-y-2 block">
                <span className="block">
                  Are you sure you want to retire{" "}
                  <strong>{countryToDelete?.name_en}</strong> ({countryToDelete?.country_code})?
                </span>
                <span className="block text-destructive font-semibold">
                  The record, references and audit history will be retained. Active dependencies must be resolved before retirement.
                </span>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <GeographyLifecycleNotice state={lifecycle}/>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting||lifecycle.unconfirmed}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={e=>{e.preventDefault();void handleDeleteConfirm();}}
              disabled={isDeleting||lifecycle.unconfirmed||lifecycle.refreshError}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Retiring..." : "Retire; keep history"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
