import { notFound, redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getCandidate } from "@/server/actions/hr/recruitment";
import { CandidateWorkspaceForm } from "@/features/hr/recruitment/candidate-workspace-form";

type Props = { params: Promise<{ id: string }> };

export default async function CandidateRecordPage({ params }: Props) {
  const { id } = await params;
  const candidateId = parseInt(id);
  if (!candidateId) notFound();

  const ctx = await getAuthContext();
  const canView = hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage") || ctx.roleCodes?.includes("system_admin");
  if (!canView) redirect("/admin");

  const res = await getCandidate(candidateId);
  if (!res.success || !res.data) notFound();

  return (
    <CandidateWorkspaceForm
      candidate={res.data}
      mode="edit"
      authContext={ctx}
    />
  );
}
