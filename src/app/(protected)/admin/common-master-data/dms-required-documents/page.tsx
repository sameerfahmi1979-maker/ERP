import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileCheck, Plus } from "lucide-react";
import { listDmsRequiredDocumentRules } from "@/server/actions/common-master-data/dms-required-document-rules";
import Link from "next/link";

export default async function DmsRequiredDocumentsPage() {
  const ctx = await getAuthContext();
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.dms_required_documents.manage");
  const result = await listDmsRequiredDocumentRules({});
  const rules = result.data ?? [];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Required Document Rules"
        description="DMS compliance rules defining required documents for each entity type"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Common Master Data", href: "/admin/common-master-data" },
          { label: "Required Document Rules" },
        ]}
        actions={canManage ? <Link href="/admin/common-master-data/dms-required-documents/record/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Rule</Button></Link> : null}
      />
      {rules.length === 0 ? <ERPEmptyState icon={FileCheck} title="No rules defined yet" description="Create compliance rules for required documents." /> : (
        <div className="rounded-md border overflow-hidden">
          <div className="divide-y">
            {rules.map(r => (
              <Link key={r.id} href={`/admin/common-master-data/dms-required-documents/record/${r.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {r.rule_name}
                    <Badge variant="outline" className="text-[10px]">{r.entity_type}</Badge>
                    {r.is_required && <Badge variant="secondary" className="text-[10px]">Required</Badge>}
                    {r.blocks_activation && <Badge variant="destructive" className="text-[10px]">Blocks Activation</Badge>}
                    {!r.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                  </div>
                  {r.document_type && <p className="text-xs text-muted-foreground">{(r.document_type as {name_en: string}).name_en}</p>}
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
