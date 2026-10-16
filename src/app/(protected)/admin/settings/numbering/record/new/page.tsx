import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { NumberingRuleWorkspaceForm } from "@/features/numbering/components/numbering-rule-workspace-form";

export default async function NewNumberingRulePage() {
  const authContext = await getAuthContext();
  if (!hasGlobalPermission(authContext, "numbering.rules.manage")) {
    redirect("/admin/settings/numbering");
  }
  return <NumberingRuleWorkspaceForm mode="add" authContext={authContext} />;
}
