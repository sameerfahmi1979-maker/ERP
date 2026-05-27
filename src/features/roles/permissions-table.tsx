"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/tables/data-table";
import type { Permission } from "@/types/database";

const columns: ColumnDef<Permission>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "permission_code", header: "Permission Code" },
  { accessorKey: "permission_name", header: "Name" },
  { accessorKey: "module_code", header: "Module" },
  { accessorKey: "action_code", header: "Action" },
  { accessorKey: "description", header: "Description" },
];

export function PermissionsTable({ data }: { data: Permission[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="permission_code"
      searchPlaceholder="Search permissions..."
    />
  );
}
