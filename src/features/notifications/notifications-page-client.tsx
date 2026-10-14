"use client";
import {useLayoutEffect, useRef, useTransition} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";
import {MyNotificationsTable} from "./my-notifications-table";
import {useNotificationPage, type NotificationPageProps} from "@/hooks/use-notification-page";
import {useNotificationUnread} from "@/hooks/use-notification-bell";
import {notificationReadIdentity} from "@/lib/reads/notifications-schema";
import {invalidateMyNotifications} from "@/lib/query/invalidation";
import {markAllMyNotificationsRead} from "@/server/actions/notifications/notifications";
import {toast} from "sonner";

export function NotificationsPageClient(props: NotificationPageProps) {
  const identity = notificationReadIdentity(props.authContext);
  return <NotificationsView key={identity} {...props} identity={identity} />;
}
function NotificationsView(props: NotificationPageProps & {identity: string}) {
  const read = useNotificationPage(props, props.identity), count = useNotificationUnread(read.denied ? undefined : props.identity);
  const qc = useQueryClient(), [pending, startTransition] = useTransition(), flight = useRef(false);
  const current = useRef(read.isCurrent), alive = useRef(false);
  useLayoutEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  useLayoutEffect(() => {current.current = read.isCurrent;});
  function markAll() {
    if (flight.current || !current.current() || count.isError || count.isFetching || count.data === undefined) return;
    flight.current = true;
    startTransition(async () => {
      try {
        const result = await markAllMyNotificationsRead();
        if (!alive.current) return;
        if (result.success) invalidateMyNotifications(qc);
        else toast.error(result.error ?? "The change could not be confirmed.");
      } catch {if (alive.current) toast.error("The change could not be confirmed. Refresh before retrying.");}
      finally {flight.current = false;}
    });
  }
  if (read.denied) return <p role="alert">Your notification access could not be verified. Sign in again.</p>;
  const unread = count.isError || count.isFetching ? undefined : count.data;
  return <div className="flex min-w-0 flex-col gap-4" aria-busy={read.busy}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h1 className="text-xl font-semibold">Notifications</h1><p>{unread === undefined ? "Unread count unavailable" : `${unread} unread notifications`}</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => {read.refresh(); void count.refetch();}}>Refresh</Button>
        <Button disabled={pending || !read.isCurrent() || unread === undefined || unread === 0} onClick={markAll}>Mark all read</Button></div>
    </div>
    <p className="text-xs text-muted-foreground">Search and filters cover all your permitted notifications. Mark all read applies to all your unread notifications, including other pages. Reading or dismissing an alert does not complete its business task.</p>
    {(read.failed || count.isError) && <p role="alert">Notifications or unread counts could not be verified. Use Refresh to retry. Unverified rows are hidden.</p>}
    <div className="flex flex-wrap gap-2">{[["", "All"], ["unread", "Unread"], ["dismissed", "Dismissed"]].map(([value, label]) =>
      <Button key={value} variant={read.status === value ? "default" : "outline"} aria-pressed={read.status === value} onClick={() => read.setStatus(value)}>{label}</Button>)}</div>
    <p>{read.totalCount === null ? "Count unavailable" : `${read.totalCount} matching notifications`}</p>
    <MyNotificationsTable notifications={read.rows} onRefresh={read.refresh} activeTab={read.status || "all"}
      disabled={read.busy || read.failed || pending} serverRead={read.serverRead} canAct={read.isCurrent}/>
  </div>;
}
