import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { CandidateWorkspaceForm } from "@/features/hr/recruitment/candidate-workspace-form";

export default async function NewCandidatePage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
    redirect("/admin");
  }

  return (
    <CandidateWorkspaceForm
      candidate={null}
      mode="add"
      authContext={ctx}
    />
  );
}
