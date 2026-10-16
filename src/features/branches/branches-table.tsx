"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateOrganizations } from "@/lib/query/invalidation";
import { Button } from "@/components/ui/button";
import { useAdministrationLifecycleSession } from "@/hooks/use-administration-lifecycle-session";
import { type ColumnDef } from "@tanstack/react-table";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Ban, CheckCircle, Trash2, GitBranch, Eye } from "lucide-react";
import type { BranchWithCompany } from "@/types/domain";
import type { AuthContext } from "@/lib/rbac/check";
import { hasPermissionInScope } from "@/lib/rbac/scope";
import { updateBranchStatus, deleteBranch } from "@/server/actions/branches";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const BASE = "/admin/branches";

function companyLabel(branch: BranchWithCompany) {
  return branch.owner_company?.legal_name_en || `Organization #${branch.owner_company_id} (name unavailable)`;
}

function emirateLabel(branch: BranchWithCompany) {
  return branch.emirate || (branch.emirate_id ? `Emirate #${branch.emirate_id} (name unavailable)` : "—");
}

function areaLabel(branch: BranchWithCompany) {
  return branch.area || (branch.area_zone_id ? `Area #${branch.area_zone_id} (name unavailable)` : "—");
}

type BranchesTableProps = {
  data: BranchWithCompany[];
  authContext: AuthContext;
  userProfileId?: number | string;
  exportConfig?: {
    title: string;
    subtitle?: string;
    filename: string;
    generatedBy?: string;
  };
};

export function BranchesTable({ 
  data,
  authContext,
  userProfileId,
  exportConfig,
}: BranchesTableProps) {
  const router = useRouter();

  const handleView = (branch: BranchWithCompany) => router.push(`${BASE}/record/${branch.id}`);
  const handleEdit = (branch: BranchWithCompany) => router.push(`${BASE}/record/${branch.id}?mode=edit`);

  const columns: ColumnDef<BranchWithCompany>[] = [
    {
      id: "branch",
      accessorFn: branch => `${branch.branch_name_en} ${branch.branch_code}`,
      header: "Branch",
      cell: ({ row }) => {
        const branch = row.original;
        return (
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <GitBranch className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{branch.branch_name_en}</span>
              <span className="text-xs text-muted-foreground">{branch.branch_code}</span>
            </div>
          </div>
        );
      },
    },
    {
      id: "owner_company",
      accessorFn: branch => [companyLabel(branch), branch.owner_company?.company_code].filter(Boolean).join(" "),
      header: "Organization",
      cell: ({ row }) => {
        const company = row.original.owner_company;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{companyLabel(row.original)}</span>
            <span className="text-xs text-muted-foreground">{company?.company_code || ""}</span>
          </div>
        );
      },
    },
    {
      id: "emirate",
      accessorFn: emirateLabel,
      header: "Emirate",
      cell: ({ row }) => {
        return <span className="text-sm">{emirateLabel(row.original)}</span>;
      },
    },
    {
      id: "area",
      accessorFn: areaLabel,
      header: "Area",
      cell: ({ row }) => {
        return <span className="text-sm">{areaLabel(row.original)}</span>;
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge
            variant={
              status === "active" ? "default" : status === "inactive" ? "secondary" : "destructive"
            }
            className="text-xs font-medium"
          >
            {status}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => <BranchRowActions key={row.original.id} branch={row.original} canManage={hasPermissionInScope(authContext, "branches.manage", row.original.owner_company_id, row.original.id)} onView={handleView} onEdit={handleEdit} />,
    },
  ];

  return (
    <>
      <ERPDataTable
        tableId="admin.branches"
        columns={columns}
        data={data}
        userProfileId={userProfileId}
        searchPlaceholder="Search branches..."
        emptyMessage="No branches found matching your criteria."
        enableSorting
        enableColumnResizing
        enableRowSelection
        enableColumnVisibility
        enablePreferences
        exportConfig={exportConfig}  // Changed from toolbarSlot/exportSlot
        initialPageSize={25}
        pageSizeOptions={[10, 25, 50, 100]}
      />
      
    </>
  );
}

type BranchLifecyclePayload = { status: "active" | "inactive" | "suspended"; retire: boolean };

function BranchRowActions({ branch, canManage, onView, onEdit }: {
  branch: BranchWithCompany; canManage: boolean; onView: (row: BranchWithCompany) => void; onEdit: (row: BranchWithCompany) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAdministrationLifecycleSession(`branch-lifecycle-${branch.id}`, branch.id, branch.workspace_revision);
  const [busy, setBusy] = useState(false);
  const status = session.confirmedStatus ?? branch.status;
  const [error, setError] = useState<string | null>(null);
  const flight = useRef(false);
  const change = async (requested?: BranchLifecyclePayload) => {
    if (!canManage || flight.current || (session.uncertain && requested)) return;
    if (requested?.retire && !confirm(`Retire "${branch.branch_name_en}"? The record becomes inactive and its history is retained. It can be activated again when its dependencies allow it.`)) return;
    flight.current = true; setBusy(true); setError(null);
    let dispatched = false;
    try {
      const pending = session.getPending() ?? (requested ? session.prepare(requested) : null);
      if (!pending) return;
      dispatched = true;
      const result = pending.payload.retire
        ? await deleteBranch(pending.id!, pending.contract)
        : await updateBranchStatus(pending.id!, pending.payload.status, pending.contract);
      if (!session.isCurrent()) return;
      if (!result.success) {
        if (result.uncertain) session.setUncertain(); else session.rejected();
        setError(result.error ?? "The status change could not be confirmed.");
        return;
      }
      const receipt = session.accept(result.data);
      toast.success(receipt.changed === false ? "No changes to save" : pending.payload.retire ? "Branch retired; history retained" : `Branch ${pending.payload.status === "active" ? "activated" : "deactivated"}`);
      try { invalidateOrganizations(queryClient); router.refresh(); } catch { setError("The change was saved. Reopen the list to refresh its display."); }
    } catch {
      if (!session.isCurrent()) return;
      if (dispatched) session.setUncertain();
      setError(dispatched ? "The status change is unconfirmed. Retry the same change to recover its result." : "Reopen this list before changing the record. Its current revision is unavailable.");
    } finally { flight.current = false; if (session.isCurrent()) setBusy(false); }
  };
  const unavailable = busy || session.uncertain;
  return <div>
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground" disabled={busy}>
        <span className="sr-only">Open menu</span><MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Actions</DropdownMenuLabel><DropdownMenuSeparator />
          <DropdownMenuItem disabled={unavailable} onClick={() => onView(branch)}><Eye className="mr-2 h-4 w-4" />View</DropdownMenuItem>
          {canManage && <>
          <DropdownMenuItem disabled={unavailable} onClick={() => onEdit(branch)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
          {status !== "active" && <DropdownMenuItem disabled={unavailable} onClick={() => void change({ status: "active", retire: false })}><CheckCircle className="mr-2 h-4 w-4" />Activate</DropdownMenuItem>}
          {status === "active" && <DropdownMenuItem disabled={unavailable} onClick={() => void change({ status: "inactive", retire: false })}><Ban className="mr-2 h-4 w-4" />Deactivate</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={unavailable || status === "inactive"} onClick={() => void change({ status: "inactive", retire: true })} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Retire</DropdownMenuItem>
          </>}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    {(error || session.recoveryError) && <p role="alert" className="text-sm text-destructive">{error || session.recoveryError}</p>}
    {canManage && session.uncertain && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void change()}>Retry same change</Button>}
  </div>;
}
