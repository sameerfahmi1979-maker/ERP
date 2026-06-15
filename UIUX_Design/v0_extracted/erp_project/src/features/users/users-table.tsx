"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { DataTable } from "@/components/tables/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import type { UserWithRoles } from "@/types/database";

const columns: ColumnDef<UserWithRoles>[] = [
  { accessorKey: "id", header: "Profile ID" },
  { accessorKey: "user_code", header: "User Code", cell: ({ row }) => row.original.user_code ?? "—" },
  {
    id: "email",
    header: "Email",
    cell: ({ row }) => row.original.email ?? "—",
  },
  { accessorKey: "full_name", header: "Full Name", cell: ({ row }) => row.original.full_name ?? "—" },
  {
    accessorKey: "display_name",
    header: "Display Name",
    cell: ({ row }) => row.original.display_name ?? "—",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: "roles",
    header: "Roles",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {(row.original.roles ?? []).map((role) => (
          <Badge key={role.role_code} variant="secondary">
            {role.role_name}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    id: "organization",
    header: "Organization",
    cell: ({ row }) => row.original.owner_company?.legal_name_en ?? "—",
  },
  {
    id: "branch",
    header: "Branch",
    cell: ({ row }) => row.original.branch?.branch_name_en ?? "—",
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => format(new Date(row.original.created_at), "dd MMM yyyy"),
  },
  {
    id: "actions",
    header: "Actions",
    cell: () => <span className="text-muted-foreground">Manage (placeholder)</span>,
  },
];

export function UsersTable({ data }: { data: UserWithRoles[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="full_name"
      searchPlaceholder="Search users..."
      emptyMessage="No users found. Sign up and run admin bootstrap after migration."
    />
  );
}
