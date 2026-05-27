"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import type { Role } from "@/types/database";

const columns: ColumnDef<Role>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "role_code", header: "Role Code" },
  { accessorKey: "role_name", header: "Role Name" },
  { accessorKey: "description", header: "Description" },
  {
    accessorKey: "is_system_role",
    header: "System",
    cell: ({ row }) => (
      <Badge variant={row.original.is_system_role ? "default" : "outline"}>
        {row.original.is_system_role ? "Yes" : "No"}
      </Badge>
    ),
  },
  {
    accessorKey: "is_active",
    header: "Active",
    cell: ({ row }) => (
      <Badge variant={row.original.is_active ? "default" : "secondary"}>
        {row.original.is_active ? "Active" : "Inactive"}
      </Badge>
    ),
  },
];

export function RolesTable({ data }: { data: Role[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="role_name"
      searchPlaceholder="Search roles..."
    />
  );
}
