import { getNumberingRules } from "@/server/actions/numbering";
import { NumberingRulesTable } from "@/features/numbering/components/numbering-rules-table";
import { ERPPageHeader } from "@/components/erp/page-header";
import {LoadError} from '@/components/erp/load-error';
import {getAuthContext,hasGlobalPermission} from '@/lib/rbac/check';
import {redirect} from 'next/navigation';

export const metadata = {
  title: "Numbering Rules | ERP Admin",
  description: "Configure ERP reference number sequences",
};

export default async function NumberingRulesPage() {
  const ctx=await getAuthContext();
  if(!['numbering.rules.view','numbering.rules.manage','numbering.rules.lock'].some(code=>hasGlobalPermission(ctx,code)))redirect('/access-denied');
  const result = await getNumberingRules();
  if(result.kind==='forbidden')redirect('/access-denied');
  if(!result.success)return <LoadError title="Numbering rules" retryHref="/admin/settings/numbering"/>;
  const rules = result.success ? result.data ?? [] : [];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Numbering Rules"
        description="Configure ERP reference number sequences such as EMP-0001, PO-0001, INV-0001."
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Settings", href: "/admin/settings" },
          { label: "Numbering Rules" },
        ]}
      />
      <NumberingRulesTable rules={rules} canManage={hasGlobalPermission(ctx,'numbering.rules.manage')} canLock={hasGlobalPermission(ctx,'numbering.rules.lock')} />
    </div>
  );
}
