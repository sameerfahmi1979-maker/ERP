import { getAuthContext, hasPermission } from "@/lib/rbac/check";
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

  if (!hasPermission(authContext, "numbering.view")) {
    redirect("/admin/settings/numbering");
  }

  const numericId = parseInt(id);
  if (isNaN(numericId)) notFound();

  const result = await getNumberingRuleById(numericId);
  if (!result.success || !result.data) notFound();

  const mode = modeParam === "edit" && hasPermission(authContext, "numbering.edit") ? "edit" : "view";

  return <NumberingRuleWorkspaceForm rule={result.data} mode={mode} authContext={authContext} />;
}
