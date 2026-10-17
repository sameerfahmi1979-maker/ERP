import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import {LoadError} from '@/components/erp/load-error';
import { redirect, notFound } from "next/navigation";
import { NumberingRuleWorkspaceForm } from "@/features/numbering/components/numbering-rule-workspace-form";
import { getNumberingRuleById } from "@/server/actions/numbering";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export default async function NumberingRuleRecordPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { mode: modeParam } = await searchParams;
  const authContext = await getAuthContext();

  if (!['numbering.rules.view','numbering.rules.manage','numbering.rules.lock'].some(code=>hasGlobalPermission(authContext,code))) {
    redirect("/access-denied");
  }

  const numericId = Number(id);
  if (!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(numericId)) notFound();

  const result = await getNumberingRuleById(numericId);
  if(result.kind==='forbidden')redirect('/access-denied');
  if(result.kind==='not_found')notFound();
  if (!result.success || !result.data)return <LoadError title="Numbering rule" retryHref={`/admin/settings/numbering/record/${numericId}`}/>;

  const mode = modeParam === "edit" && hasGlobalPermission(authContext, "numbering.rules.manage") ? "edit" : "view";

  return <NumberingRuleWorkspaceForm rule={result.data} mode={mode} authContext={authContext} />;
}
