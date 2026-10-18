import { notFound, redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import {readCandidateRecord} from "@/server/reads/hr-candidate-record";
import {candidateRouteIdSchema, candidateRecordIdentity} from "@/lib/reads/hr-candidate-record-schema";
import { CandidateWorkspaceForm } from "@/features/hr/recruitment/candidate-workspace-form";
import {NotificationArrival} from '@/features/notifications/notification-open';
import {readNotificationTaskContext} from '@/server/notification-task-context';

type Props = { params: Promise<{ id: string }>; searchParams?:Promise<{f10_open?:string;task?:string;task_id?:string}> };

export default async function CandidateRecordPage({ params,searchParams }: Props) {
  const { id } = await params;
  const parsed = candidateRouteIdSchema.safeParse(id);
  if (!parsed.success) notFound();
  const candidateId = parsed.data;
  const {f10_open,task,task_id}=await searchParams??{};

  const ctx = await getAuthContext();
  const canView = hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage");
  if (!canView) redirect("/access-denied");

  const res = await readCandidateRecord({kind: "record", candidateId}, ctx);
  if (!res.success) {
    if (res.error === "Permission denied") redirect("/access-denied");
    throw new Error("Candidate record could not be loaded. Please retry.");
  }
  if (res.data.kind !== "record") throw new Error("Candidate record response did not match its request");
  const taskContext=task===undefined?null:await readNotificationTaskContext(`/admin/hr/recruitment/candidates/record/${candidateId}`,task,task_id,f10_open);

  return (
    <>{task===undefined?<NotificationArrival token={f10_open} path={`/admin/hr/recruitment/candidates/record/${candidateId}`}/>:!taskContext&&<p role="alert">The notified task is unavailable, changed or no longer permitted. Its alert has not been marked read.</p>}<CandidateWorkspaceForm
      candidate={res.data.candidate}
      initialRead={{data: res.data, identity: candidateRecordIdentity(ctx), updatedAt: res.updatedAt}}
      mode="edit"
      authContext={ctx}
      notificationTask={taskContext??undefined}
    /></>
  );
}
