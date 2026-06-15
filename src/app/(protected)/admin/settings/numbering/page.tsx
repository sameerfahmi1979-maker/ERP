import { getNumberingRules } from "@/server/actions/numbering";
import { NumberingRulesTable } from "@/features/numbering/components/numbering-rules-table";
import { Binary } from "lucide-react";

export const metadata = {
  title: "Global Numbering Rules | ERP Admin",
  description: "Configure simple ERP reference number sequences",
};

export default async function NumberingRulesPage() {
  const result = await getNumberingRules();
  const rules = result.success ? result.data ?? [] : [];

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-500/10">
            <Binary className="h-6 w-6 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Global Numbering Rules</h1>
            <p className="text-sm text-muted-foreground">
              Configure simple ERP reference number sequences such as EMP-0001, PO-0001, INV-0001
            </p>
          </div>
        </div>
      </div>

      <NumberingRulesTable rules={rules} />
    </div>
  );
}
