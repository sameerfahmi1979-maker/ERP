"use client";
import {useLayoutEffect, useRef, useState, useTransition} from "react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {ERPDataTable} from "@/components/erp/table/erp-data-table";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";
import type {ColumnDef} from "@tanstack/react-table";
import {NotificationStatusBadge} from "@/features/notifications/notification-status-badge";
import type {EmailQueueReadRow} from "@/lib/reads/email-queue-schema";
import {retryEmailQueueItem, cancelEmailQueueItem, processEmailQueueItem} from "@/server/actions/notifications/email-queue";
type Props = {items: EmailQueueReadRow[]; onRefresh: () => void; serverRead: ERPTableServerRead<EmailQueueReadRow>; canManage: boolean; canProcess: boolean; disabled: boolean; canAct: () => boolean};
export function EmailQueueTable({items, onRefresh, serverRead, canManage, canProcess, disabled, canAct}: Props) {
  const [actingId, setActingId] = useState<number | null>(null), [pending, startTransition] = useTransition();
  const owner = useRef(false), flight = useRef(false), current = useRef(canAct);
  useLayoutEffect(() => {owner.current = true; return () => {owner.current = false;};}, []);
  useLayoutEffect(() => {current.current = canAct;});
  function action(id: number, permitted: boolean, run: () => Promise<{success: boolean; error?: string}>) {
    if (!owner.current || flight.current || disabled || !permitted || !current.current() || !items.some(row => row.id === id)) return;
    flight.current = true; setActingId(id);
    startTransition(async () => {
      try {const result = await run(); if (!owner.current) return;
        if (result.success) {toast.success("Queue operation confirmed. Refreshing its current status."); onRefresh();}
        else toast.error(result.error ?? "The queue operation could not be confirmed.");
      } catch {if (owner.current) toast.error("The queue operation could not be confirmed. Refresh before retrying.");}
      finally {flight.current = false; if (owner.current) setActingId(null);}
    });
  }
  const columns: ColumnDef<EmailQueueReadRow>[] = [
    {accessorKey: "id", header: "ID", size: 90}, {accessorKey: "status", header: "Status", size: 130, cell: ({row}) => <NotificationStatusBadge status={row.original.status}/>},
    {accessorKey: "priority", header: "Priority", size: 100}, {accessorKey: "sourceModule", header: "Module", size: 110},
    {accessorKey: "toEmails", header: "To", size: 240, cell: ({row}) => row.original.toEmails.join(", ")},
    {accessorKey: "subject", header: "Subject", size: 300}, {accessorKey: "attemptCount", header: "Tries", size: 90, cell: ({row}) => `${row.original.attemptCount}/${row.original.maxAttempts}`},
    {accessorKey: "scheduledFor", header: "Scheduled", size: 180, cell: ({row}) => new Date(row.original.scheduledFor).toLocaleString()},
    {accessorKey: "lastError", header: "Last Error", size: 240},
    {id: "actions", header: "Actions", enableSorting: false, enableHiding: false, meta: {exportable: false}, size: 260, cell: ({row}) => {
      const item = row.original, blocked = disabled || pending || actingId !== null;
      return <div className="flex flex-wrap gap-1">
        {canProcess && ["pending", "failed"].includes(item.status) && <Button size="sm" variant="outline" disabled={blocked} onClick={() => action(item.id, canProcess, () => processEmailQueueItem(item.id, false))}>Send now</Button>}
        {canManage && item.status === "failed" && <Button size="sm" variant="outline" disabled={blocked} onClick={() => action(item.id, canManage, () => retryEmailQueueItem(item.id))}>Reset to pending</Button>}
        {canManage && ["pending", "failed"].includes(item.status) && <Button size="sm" variant="outline" disabled={blocked} onClick={() => action(item.id, canManage, () => cancelEmailQueueItem(item.id, "Cancelled by admin"))}>Cancel</Button>}
      </div>;
    }},
  ];
  return <ERPDataTable presentation="worklist" tableId="notifications.email-queue" data={items} columns={columns} serverRead={serverRead} isLoading={disabled} enableRowSelection={false} searchPlaceholder="Search queue…" emptyMessage="No queue entries match this view."/>;
}
