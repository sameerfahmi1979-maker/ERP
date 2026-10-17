import { redirect, notFound } from "next/navigation";
import { getAuthContext, hasPermission,hasGlobalPermission } from "@/lib/rbac/check";
import {isFinanceSystemAdmin} from '@/lib/master-data/finance-reference-contract';
import { getCurrencyById } from "@/features/master-data/finance-basics/actions";
import { CurrencyWorkspaceForm } from "@/features/master-data/finance-basics/components/currency-workspace-form";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }>; }

export default async function CurrencyRecordPage({ params, searchParams }: Props) {
  const { id: idStr } = await params;
  const { mode: modeParam } = await searchParams;
  const id = Number(idStr);
  if (!/^[1-9]\d*$/.test(idStr)||!Number.isSafeInteger(id)) notFound();

  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.finance_basics.view")&&!hasGlobalPermission(authContext,"master_data.finance_basics.manage")&&!hasGlobalPermission(authContext,"master_data.lookups.lock")) redirect("/access-denied");

  const result = await getCurrencyById(id);
  if (!result.success || !result.data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p role="alert" className="text-lg font-medium">{result.error??"Currency could not be loaded. Try again."}</p>
        <Link href="/admin/master-data/finance-basics/currencies" className="text-sm underline text-primary">Back to Currencies</Link>
      </div>
    );
  }

  const canEdit = hasGlobalPermission(authContext, "master_data.finance_basics.manage")&&(!result.data.is_locked||isFinanceSystemAdmin(authContext));
  const mode: "view" | "edit" = modeParam === "edit" && canEdit ? "edit" : "view";

  return (
    <div className="h-full">
      <CurrencyWorkspaceForm currency={result.data} mode={mode} authContext={authContext} />
    </div>
  );
}
