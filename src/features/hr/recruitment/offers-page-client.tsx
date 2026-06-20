"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { listGlobalOffers } from "@/server/actions/hr/recruitment";
import type { AuthContext } from "@/lib/rbac/check";
import { Skeleton } from "@/components/ui/skeleton";
import { ERPCombobox } from "@/components/erp/combobox";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Props = { authContext: AuthContext };

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-100 text-amber-700",
  approved: "bg-cyan-100 text-cyan-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-orange-100 text-orange-700",
  expired: "bg-rose-100 text-rose-700",
  cancelled: "bg-gray-100 text-gray-700",
};

const canManagePermission = (ctx: AuthContext) => ctx.permissionCodes.includes("hr.recruitment.manage") || ctx.roleCodes.includes("system_admin");

export function OffersPageClient({ authContext }: Props) {
  const canManage = canManagePermission(authContext);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const { data: res, isLoading } = useQuery({
    queryKey: queryKeys.recruitment.globalOffers({ status: statusFilter }),
    queryFn: () => listGlobalOffers({ status: statusFilter ?? undefined, pageSize: 100 }),
    staleTime: 30_000,
  });

  const rows = Array.isArray(res?.data?.rows) ? res.data.rows : [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Offers</h1>
          <p className="text-sm text-muted-foreground">{res?.data?.totalCount ?? 0} total</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <ERPCombobox
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v ? String(v) : null)}
          options={[{ value: "", label: "All Statuses" }, ...STATUS_OPTIONS]}
          placeholder="Filter by status"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Gift className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No offers found.
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 p-4">
              <Gift className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{row.candidate?.full_name_en ?? "Unknown"}</span>
                  {row.candidate?.candidate_code && <span className="text-xs font-mono text-muted-foreground">{row.candidate.candidate_code}</span>}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[row.offer_status]}`}>{row.offer_status.replace(/_/g, " ")}</span>
                  {row.designation && <span className="text-xs text-muted-foreground">{row.designation.designation_name_en}</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {canManage && row.basic_salary != null ? `Basic: ${row.basic_salary.toLocaleString()} ${row.currency}` : "Salary: [restricted]"}
                  {row.proposed_joining_date && ` · Joining: ${row.proposed_joining_date}`}
                  {row.valid_until && ` · Valid until: ${row.valid_until}`}
                </p>
              </div>
              {row.candidate && (
                <Link href={`/admin/hr/recruitment/candidates/record/${row.candidate_id}`}>
                  <Button size="sm" variant="outline">View Candidate</Button>
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
