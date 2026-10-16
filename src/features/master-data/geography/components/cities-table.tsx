"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CityWithEmirate } from "@/features/master-data/geography/types";
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

type CitiesTableProps = {
  cities: CityWithEmirate[];
  authContext: AuthContext;
  onRefresh?: () => void;
};

const BASE = "/admin/master-data/geography/cities";

export function CitiesTable(props:CitiesTableProps){
 return <CitiesTableSession key={props.authContext.profile?.id??'none'} {...props}/>;
}
function CitiesTableSession({ cities, authContext, onRefresh }: CitiesTableProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cityToDelete, setCityToDelete] = useState<CityWithEmirate | null>(null);
  const lifecycle=useGeographyLifecycle('cities',()=>{setDeleteDialogOpen(false);setCityToDelete(null);if(onRefresh)onRefresh();else router.refresh();});
  const isDeleting=lifecycle.busy;


  const handleAdd = () => router.push(`${BASE}/record/new`);
  const handleView = (city: CityWithEmirate) => router.push(`${BASE}/record/${city.id}`);
  const handleEdit = (city: CityWithEmirate) => router.push(`${BASE}/record/${city.id}?mode=edit`);

  const handleToggleActive=(city:CityWithEmirate)=>lifecycle.change(city,'active');
  const handleToggleLock=(city:CityWithEmirate)=>lifecycle.change(city,'lock');
  const handleDeleteClick=(city:CityWithEmirate)=>{setCityToDelete(city);setDeleteDialogOpen(true);};
  const handleDeleteConfirm=()=>cityToDelete?lifecycle.change(cityToDelete,'retire'):Promise.resolve(false);

  const columns: ColumnDef<CityWithEmirate>[] = [
    {
      accessorKey: "city_code",
      accessorFn: (row) => `${row.name_en} ${row.city_code}`,
      header: "City",
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
            {row.original.city_code}
          </span>
        </div>
      ),
      meta: {
        exportable: true,
        exportHeader: "City Code",
        exportValue: (row) => row.city_code,
      },
    },
    {
      id: "emirate",
      header: "Region / Emirate",
      cell: ({ row }) => {
        const emirate = row.original.emirate;
        return (
          <span className="text-sm">
            {emirate?.name_en || "—"}
          </span>
        );
      },
      meta: {
        exportable: true,
        exportHeader: "Region / Emirate",
        exportValue: (row) => {
          const emirate = row.emirate;
          return emirate?.name_en || "";
        },
      },
    },
    {
      accessorKey: "name_ar",
      header: "Arabic Name",
      cell: ({ row }) => (
        <span className="text-sm" dir="rtl">{row.original.name_ar || "—"}</span>
      ),
      meta: {
        exportable: true,
        exportHeader: "Arabic Name",
        exportValue: (row) => row.name_ar || "",
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
        const city = row.original;
        return (
          <GeographyActionsCell disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError}
            row={city}
            authContext={authContext}
            onView={() => handleView(city)}
            onEdit={() => handleEdit(city)}
            onToggleActive={() => handleToggleActive(city)}
            onToggleLock={() => handleToggleLock(city)}
            onDelete={() => handleDeleteClick(city)}
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
      <ERPDataTable<CityWithEmirate>
        tableId="cities_table"
        columns={columns}
        data={cities}
        enableSorting={true}
        enableColumnResizing={true}
        enableRowSelection={true}
        enableColumnVisibility={true}
        enablePreferences={true}
        searchPlaceholder="Search cities by code or name..."
        enableGlobalFilter={true}
        initialPageSize={25}
        exportConfig={{
          title: "Cities Master Data",
          subtitle: `${cities.length} cit${cities.length !== 1 ? "ies" : "y"} configured`,
          filename: "cities-master-data",
          orientation: "landscape",
        }}
        toolbarSlot={
          <Button disabled={lifecycle.busy||lifecycle.unconfirmed||lifecycle.refreshError||!hasGlobalPermission(authContext,'master_data.geography.manage')} onClick={handleAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add City
          </Button>
        }
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire City</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="space-y-2 block">
                <span className="block">
                  Are you sure you want to retire{" "}
                  <strong>{cityToDelete?.name_en}</strong> ({cityToDelete?.city_code})?
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
