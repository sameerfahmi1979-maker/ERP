import { notFound, redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import {readCandidateRecord} from "@/server/reads/hr-candidate-record";
import {candidateRouteIdSchema, candidateRecordIdentity} from "@/lib/reads/hr-candidate-record-schema";
import { CandidateWorkspaceForm } from "@/features/hr/recruitment/candidate-workspace-form";

type Props = { params: Promise<{ id: string }> };

export default async function CandidateRecordPage({ params }: Props) {
  const { id } = await params;
  const parsed = candidateRouteIdSchema.safeParse(id);
  if (!parsed.success) notFound();
  const candidateId = parsed.data;

  const ctx = await getAuthContext();
  const canView = hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage");
  if (!canView) redirect("/access-denied");

  const res = await readCandidateRecord({kind: "record", candidateId}, ctx);
  if (!res.success) {
    if (res.error === "Permission denied") redirect("/access-denied");
    throw new Error("Candidate record could not be loaded. Please retry.");
  }
  if (res.data.kind !== "record") throw new Error("Candidate record response did not match its request");

  return (
    <CandidateWorkspaceForm
      candidate={res.data.candidate}
      initialRead={{data: res.data, identity: candidateRecordIdentity(ctx), updatedAt: res.updatedAt}}
      mode="edit"
      authContext={ctx}
    />
  );
}
