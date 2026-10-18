"use client";
import {Button} from "@/components/ui/button";
import {useQuery} from "@tanstack/react-query";
import {useCountedTableRead} from "@/hooks/use-counted-table-read";
import {emailQueueCriteriaSchema, emailQueuePageSchema, emailQueueIdentity, EMAIL_QUEUE_STATUSES, type EmailQueueReadPage} from "@/lib/reads/email-queue-schema";
import {unreadCountSchema} from "@/lib/reads/notifications-schema";
import {readJson, retryAuthorizedRead} from "@/lib/reads/client";
import {hasGlobalPermission} from "@/lib/rbac/scope";
import type {AuthContext} from "@/lib/rbac/check";
import {EmailQueueTable} from "./email-queue-table";
import {EmailQueueProcessPanel} from "./email-queue-process-panel";
export type EmailQueuePageProps = {authContext: AuthContext; initialPage?: EmailQueueReadPage; initialIdentity?: string; initialUpdatedAt?: number};
export function EmailQueuePageClient(props: EmailQueuePageProps) {
  const identity = emailQueueIdentity(props.authContext);
  return <EmailQueueView key={identity} {...props} identity={identity}/>;
}
function EmailQueueView(props: EmailQueuePageProps & {identity: string}) {
  const allowed = ["notifications.email_queue.view", "notifications.email_queue.manage", "notifications.admin"].some(code => hasGlobalPermission(props.authContext, code));
  const canManage = ["notifications.email_queue.manage", "notifications.admin"].some(code => hasGlobalPermission(props.authContext, code));
  const canProcess = ["notifications.email_queue.process", "notifications.admin"].some(code => hasGlobalPermission(props.authContext, code));
  const read = useCountedTableRead({resource: "email-queue", prefix: ["notifications", "email-queue"], identity: props.identity, allowed,
    seed: props.initialPage, seedIdentity: props.initialIdentity, seedUpdatedAt: props.initialUpdatedAt, defaultSort: [{id: "id", desc: true}],
    parseCriteria: input => {const parsed = emailQueueCriteriaSchema.safeParse(input); return parsed.success ? parsed.data : null;},
    parsePage: input => emailQueuePageSchema.parse(input),
    filters: [{id: "status", label: "Status", type: "select", options: EMAIL_QUEUE_STATUSES.map(value => ({value, label: value}))},
      {id: "priority", label: "Priority", type: "select", options: ["low", "normal", "high", "urgent"].map(value => ({value, label: value}))}, {id: "sourceModule", label: "Module", type: "text"}],
  });
  const pending = useQuery({queryKey: ["notifications", "email-queue", props.identity, "pending-count"], enabled: allowed && !read.denied && canProcess, staleTime: 30000, gcTime: 0, retry: retryAuthorizedRead,
    queryFn: async ({signal}) => {const result = await readJson<{success: true; data: unknown}>("email-pending-count", {}, signal); return unreadCountSchema.parse(result.data).count;}});
  if (read.denied) return <p role="alert">Email queue access could not be verified.</p>;
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-semibold">Email Queue</h1><Button variant="outline" onClick={read.refresh}>Refresh queue</Button></div>
    <p className="text-sm text-muted-foreground">Filters and search cover all permitted entries. Delivery status is not proof of inbox receipt. Message bodies, CC/BCC and raw provider errors are not loaded into this list.</p>
    {read.failed && <p role="alert">Email queue could not be verified. Use Refresh queue to retry.</p>}
    {canProcess && <fieldset aria-label="Queue processing controls" disabled={!read.canAct() || !pending.isSuccess || pending.isFetching}>
      <EmailQueueProcessPanel pendingCount={pending.data ?? 0} onRefresh={read.refresh} canQueue={canManage} canAct={() => read.canAct() && pending.isSuccess && !pending.isFetching}/>
      {(!read.canAct() || !pending.isSuccess || pending.isFetching) && <p>Queue processing unavailable until the list and pending count are verified.</p>}
    </fieldset>}
    <EmailQueueTable identity={props.identity} items={read.rows} onRefresh={read.refresh} canManage={canManage} canProcess={canProcess} canAct={read.canAct} disabled={read.busy || read.failed}
      serverRead={read.serverRead}/>
  </div>;
}
