"use client";

import { useState } from "react";
import Link from "next/link";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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
import { MoreHorizontal, Pencil, PowerOff, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateDesignation, softDeleteDesignation } from "@/server/actions/common-master-data/designations";
import type { DesignationRow } from "@/server/actions/common-master-data/designations";

interface Props {
  designations: DesignationRow[];
  canManage: boolean;
}

export function DesignationsListClient({ designations: initial, canManage }: Props) {
  const router = useRouter();
  const [designations, setDesignations] = useState(initial);
  const [snapshot, setSnapshot] = useState(initial);
  if (snapshot !== initial) { setSnapshot(initial); setDesignations(initial); }
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DesignationRow | null>(null);

  const handleToggleActive = async (d: DesignationRow) => {
    setPendingId(d.id);
    try {
      const result = await updateDesignation({ id: d.id, is_active: !d.is_active });
      if (result.success) {
        setDesignations((prev) =>
          prev.map((item) => (item.id === d.id ? { ...item, is_active: !d.is_active } : item))
        );
        toast.success(d.is_active ? "Designation deactivated" : "Designation activated");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to update");
      }
    } finally {
      setPendingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setPendingId(deleteTarget.id);
    try {
      const result = await softDeleteDesignation(deleteTarget.id);
      if (result.success) {
        setDesignations((prev) => prev.filter((d) => d.id !== deleteTarget.id));
        toast.success("Designation deleted");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to delete");
      }
    } finally {
      setPendingId(null);
      setDeleteTarget(null);
    }
  };

  const columns: ColumnDef<DesignationRow>[] = [
    {accessorKey:"designation_name_en",header:"Designation",enableHiding:false,cell:({row})=><Link className="font-medium underline" href={`/admin/common-master-data/designations/record/${row.original.id}`}>{row.original.designation_name_en}</Link>},
    {accessorKey:"designation_code",header:"Code"},
    {accessorKey:"management_level",header:"Management level"},
    {id:"company",header:"Company",accessorFn:d=>(d.owner_company as {legal_name_en?:string}|null)?.legal_name_en ?? ""},
    {accessorKey:"is_active",header:"Active",cell:({row})=><Badge variant={row.original.is_active?"outline":"destructive"}>{row.original.is_active?"Active":"Inactive"}</Badge>},
    ...(canManage ? [{id:"actions",header:"Actions",enableSorting:false,enableHiding:false,cell:({row}: {row: {original: DesignationRow}})=>{ const d=row.original; return (<DropdownMenu>
                <DropdownMenuTrigger
                  disabled={pendingId === d.id}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors shrink-0"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => router.push(`/admin/common-master-data/designations/record/${d.id}?mode=edit`)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleToggleActive(d)}
                    disabled={pendingId === d.id}
                  >
                    {d.is_active ? (
                      <>
                        <PowerOff className="mr-2 h-3.5 w-3.5 text-amber-600" />
                        <span className="text-amber-700">Deactivate</span>
                      </>
                    ) : (
                      <>
                        <Power className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Activate</span>
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleteTarget(d)}
                    disabled={pendingId === d.id}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>);}}] : []),
  ];

  return (
    <>
      <ERPDataTable tableId="common.designations" resultsLabel="Designations" data={designations} columns={columns} enableRowSelection={false} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Designation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.designation_name_en}</strong>?
              This may affect employees and HR records linked to this designation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
