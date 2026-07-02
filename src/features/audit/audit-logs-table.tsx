"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { Badge } from "@/components/ui/badge";
import type { AuditLog } from "@/types/database";
import { format } from "date-fns";
import { ChevronDown, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Severity mapping
type Severity = "critical" | "high" | "medium" | "low";

function getEventSeverity(action: string): Severity {
  if (
    action.includes("UNAUTHORIZED") ||
    action.includes("GUARD") ||
    action.includes("DELETED") ||
    action === "DEBUG_ROUTE_ACCESSED"
  ) return "critical";
  if (
    action.includes("SECURITY") ||
    action.includes("FORCE_CHANGE") ||
    action.includes("STATUS_CHANGED")
  ) return "high";
  if (
    action.includes("ROLE_ASSIGNED") ||
    action.includes("ROLE_REMOVED") ||
    action.includes("PERMISSION") ||
    action.includes("PASSWORD")
  ) return "medium";
  return "low";
}

const SEVERITY_BADGE_CLASS: Record<Severity, string> = {
  critical: "border-red-300 text-red-700 bg-red-50 dark:bg-red-950/30",
  high: "border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/30",
  medium: "border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950/30",
  low: "",
};

// Safe key-value payload viewer
const BLOCKED_KEYS = ["password", "token", "link", "secret", "otp", "jwt", "cookie", "raw", "hash"];

function PayloadViewer({ payload }: { payload: unknown }) {
  const [expanded, setExpanded] = useState(false);

  if (!payload || typeof payload !== "object") return null;
  const entries = Object.entries(payload as Record<string, unknown>)
    .filter(([k]) => !BLOCKED_KEYS.some((b) => k.toLowerCase().includes(b)))
    .slice(0, 12);
  if (entries.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        aria-label={expanded ? "Collapse payload" : "Expand payload"}
      >
        Details
        <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-1 text-[10px]">
              <dt className="text-muted-foreground shrink-0">{k}:</dt>
              <dd className="font-mono truncate max-w-[150px] text-foreground">{String(v ?? "")}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function CopyAuditIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      toast.success("Audit ID copied");
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Copy audit ID"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      {id.slice(0, 8)}…
    </button>
  );
}

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
  exportConfig,
}: AuditLogsTableProps) {
  const columns: ColumnDef<AuditLog>[] = [
    {
      accessorKey: "created_at",
      header: "Timestamp",
      size: 140,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <span className="text-sm whitespace-nowrap">
            {format(new Date(row.original.created_at), "MMM dd, HH:mm:ss")}
          </span>
          <div>
            <CopyAuditIdButton id={String(row.original.id)} />
          </div>
        </div>
      ),
    },
    {
      accessorKey: "module_code",
      header: "Module",
      size: 110,
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs capitalize">
          {(row.original.module_code || "unknown").replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      accessorKey: "action",
      header: "Action",
      size: 200,
      cell: ({ row }) => {
        const action = row.original.action;
        const severity = getEventSeverity(action);
        const variantClass = SEVERITY_BADGE_CLASS[severity];

        return (
          <Badge
            variant="outline"
            className={cn("text-xs capitalize", variantClass)}
          >
            {action.replace(/_/g, " ").toLowerCase()}
          </Badge>
        );
      },
    },
    {
      accessorKey: "entity_reference",
      header: "Entity",
      size: 160,
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
      size: 100,
      cell: ({ row }) => {
        const actorId = row.original.actor_user_profile_id;
        return (
          <span className="text-sm text-muted-foreground">
            {actorId ? `User #${actorId}` : "System"}
          </span>
        );
      },
    },
    {
      id: "payload",
      header: "Details",
      size: 180,
      cell: ({ row }) => (
        <PayloadViewer payload={row.original.new_values ?? row.original.old_values} />
      ),
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
      exportConfig={exportConfig}
      initialPageSize={50}
      pageSizeOptions={[25, 50, 100, 200]}
    />
  );
}
