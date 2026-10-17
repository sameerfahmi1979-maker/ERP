import { redirect, notFound } from "next/navigation";
import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import {canReadFinanceReferences,isFinanceSystemAdmin} from '@/lib/master-data/finance-reference-contract';
import { getBankById } from "@/features/master-data/finance-basics/actions";
import { BankWorkspaceForm } from "@/features/master-data/finance-basics/components/bank-workspace-form";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }>; }

export default async function BankRecordPage({ params, searchParams }: Props) {
  const { id: idStr } = await params;
  const { mode: modeParam } = await searchParams;
  const id = Number(idStr);
  if (!/^[1-9]\d*$/.test(idStr) || !Number.isSafeInteger(id) || id < 1) notFound();

  const authContext = await getAuthContext();
  if (!canReadFinanceReferences(authContext)) redirect("/dashboard");

  const result = await getBankById(id);
  if (result.success && result.data === null) notFound();
  if (!result.success || !result.data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p className="text-lg font-medium">Unable to load this record. Try again or return to the list.</p>
        <Link href="/admin/master-data/finance-basics/banks" className="text-sm underline text-primary">Back to Banks</Link>
      </div>
    );
  }

  const canEdit = hasGlobalPermission(authContext, "master_data.finance_basics.manage") && (!result.data.is_locked || isFinanceSystemAdmin(authContext));
  const mode: "view" | "edit" = modeParam === "edit" && canEdit ? "edit" : "view";

  return (
    <div className="h-full">
      <BankWorkspaceForm bank={result.data} mode={mode} authContext={authContext} />
    </div>
  );
}
