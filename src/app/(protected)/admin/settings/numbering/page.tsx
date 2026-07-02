import { getNumberingRules } from "@/server/actions/numbering";
import { NumberingRulesTable } from "@/features/numbering/components/numbering-rules-table";
import { ERPPageHeader } from "@/components/erp/page-header";

export const metadata = {
  title: "Numbering Rules | ERP Admin",
  description: "Configure ERP reference number sequences",
};

export default async function NumberingRulesPage() {
  const result = await getNumberingRules();
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
      <NumberingRulesTable rules={rules} />
    </div>
  );
}
