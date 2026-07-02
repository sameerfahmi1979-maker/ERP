import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Plus } from "lucide-react";
import { listApprovalRoles } from "@/server/actions/common-master-data/approval-roles";
import Link from "next/link";

export default async function ApprovalRolesPage() {
  const ctx = await getAuthContext();
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.approval_roles.manage");
  const result = await listApprovalRoles({});
  const roles = result.data ?? [];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Approval Roles"
        description="Approval authority levels and delegation rules"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Common Master Data", href: "/admin/common-master-data" },
          { label: "Approval Roles" },
        ]}
        actions={canManage ? <Link href="/admin/common-master-data/approval-roles/record/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Approval Role</Button></Link> : null}
      />
      {roles.length === 0 ? <ERPEmptyState icon={ShieldCheck} title="No approval roles yet" description="Create approval authority levels." /> : (
        <div className="rounded-md border overflow-hidden">
          <div className="divide-y">
            {roles.map(r => (
              <Link key={r.id} href={`/admin/common-master-data/approval-roles/record/${r.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Badge variant="secondary" className="text-[10px]">L{r.level_number}</Badge>
                    {r.role_name}
                    <span className="text-xs text-muted-foreground">({r.role_code})</span>
                    <Badge variant="outline" className="text-[10px]">{r.scope}</Badge>
                    {!r.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                  </div>
                  {r.amount_limit && <p className="text-xs text-muted-foreground">Limit: {r.currency_code} {Number(r.amount_limit).toLocaleString()}</p>}
                </div>
                <span className="text-xs text-muted-foreground">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
