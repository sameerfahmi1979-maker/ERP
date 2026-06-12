"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { Badge } from "@/components/ui/badge";
import type { AuditLog } from "@/types/database";
import { format } from "date-fns";

type AuditLogsTableProps = {
  data: AuditLog[];
  userProfileId?: number | string;
  exportConfig?: {
    title: string;
    subtitle?: string;
    filename: string;
    generatedBy?: string;
  };
};

export function AuditLogsTable({ 
  data,
  userProfileId,
  exportConfig,  // Changed from toolbarSlot/exportSlot
}: AuditLogsTableProps) {
  const columns: ColumnDef<AuditLog>[] = [
    {
      accessorKey: "created_at",
      header: "Timestamp",
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap">
          {format(new Date(row.original.created_at), "MMM dd, HH:mm:ss")}
        </span>
      ),
    },
    {
      accessorKey: "module_code",
      header: "Module",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs capitalize">
          {(row.original.module_code || "unknown").replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => {
        const action = row.original.action;
        const variant =
          action === "create"
            ? "default"
            : action === "update"
              ? "secondary"
              : action === "delete"
                ? "destructive"
                : "outline";

        return (
          <Badge variant={variant} className="text-xs capitalize">
            {action.replace(/_/g, " ")}
          </Badge>
        );
      },
    },
    {
      accessorKey: "entity_reference",
      header: "Entity",
      cell: ({ row }) => {
        const ref = row.original.entity_reference;
        const entityName = row.original.entity_name;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{ref}</span>
            <span className="text-xs text-muted-foreground">{entityName}</span>
          </div>
        );
      },
    },
    {
      id: "actor",
      header: "Actor",
      cell: ({ row }) => {
        const actorId = row.original.actor_user_profile_id;
        return (
          <span className="text-sm text-muted-foreground">
            {actorId ? `User #${actorId}` : "System"}
          </span>
        );
      },
    },
  ];

  return (
    <ERPDataTable
      tableId="admin.audit_logs"
      columns={columns}
      data={data}
      userProfileId={userProfileId}
      searchPlaceholder="Search audit logs..."
      emptyMessage="No audit logs found."
      enableSorting
      enableColumnResizing
      enableRowSelection
      enableColumnVisibility
      enablePreferences
      exportConfig={exportConfig}  // Changed from toolbarSlot/exportSlot
      initialPageSize={50}
      pageSizeOptions={[25, 50, 100, 200]}
    />
  );
}
