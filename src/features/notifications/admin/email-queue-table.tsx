"use client";
import {useLayoutEffect, useRef, useState, useTransition} from "react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {ERPDataTable} from "@/components/erp/table/erp-data-table";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";
import type {ColumnDef} from "@tanstack/react-table";
import {queueStatusLabel, queueControls} from "@/lib/email/queue/presentation";
import {queueDeliveryDetails} from "@/lib/email/queue/ui-details";
import {EmailAttemptHistory} from "./email-attempt-history";
import type {EmailQueueReadRow} from "@/lib/reads/email-queue-schema";
import {retryEmailQueueItem, cancelEmailQueueItem, processEmailQueueItem} from "@/server/actions/notifications/email-queue";
type Props = {identity: string; items: EmailQueueReadRow[]; onRefresh: () => void; serverRead: ERPTableServerRead<EmailQueueReadRow>; canManage: boolean; canProcess: boolean; disabled: boolean; canAct: () => boolean};
export function EmailQueueTable({identity, items, onRefresh, serverRead, canManage, canProcess, disabled, canAct}: Props) {
  const [actingId, setActingId] = useState<number | null>(null), [pending, startTransition] = useTransition();
  const [historyId, setHistoryId] = useState<number | null>(null);
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
    {accessorKey: "id", header: "ID", size: 90}, {accessorKey: "status", header: "Status", size: 210, cell: ({row}) => <span>{queueStatusLabel(row.original)}</span>},
    {accessorKey: "priority", header: "Priority", size: 100}, {accessorKey: "sourceModule", header: "Module", size: 110},
    {accessorKey: "toEmails", header: "To", size: 240, cell: ({row}) => row.original.toEmails.join(", ")},
    {accessorKey: "subject", header: "Subject", size: 300}, {accessorKey: "attemptCount", header: "Tries", size: 90, cell: ({row}) => `${row.original.attemptCount}/${row.original.maxAttempts}`},
    {accessorKey: "scheduledFor", header: "Scheduled", size: 180, cell: ({row}) => new Date(row.original.scheduledFor).toLocaleString()},
    {accessorKey: "lastError", header: "Delivery details", size: 300, cell: ({row}) => queueDeliveryDetails(row.original)},
    {id: "actions", header: "Actions", enableSorting: false, enableHiding: false, meta: {exportable: false}, size: 260, cell: ({row}) => {
      const item = row.original, controls = queueControls(item), blocked = disabled || pending || actingId !== null;
      return <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="outline" disabled={blocked} onClick={() => {if (owner.current && current.current()) setHistoryId(item.id);}}>Attempt history</Button>
        {canProcess && controls.process && <Button size="sm" variant="outline" disabled={blocked} onClick={() => action(item.id, canProcess, () => processEmailQueueItem(item.id, false))}>Process eligible item</Button>}
        {canProcess && controls.retry && <Button size="sm" variant="outline" disabled={blocked} onClick={() => action(item.id, canProcess, () => retryEmailQueueItem(item.id))}>Check scheduled retry</Button>}
        {canManage && controls.cancel && <Button size="sm" variant="outline" disabled={blocked} onClick={() => action(item.id, canManage, () => cancelEmailQueueItem(item.id, "Cancelled by admin"))}>Cancel</Button>}
      </div>;
    }},
  ];
  return <><ERPDataTable presentation="worklist" tableId="notifications.email-queue" data={items} columns={columns} serverRead={serverRead} isLoading={disabled} enableRowSelection={false} searchPlaceholder="Search queue…" emptyMessage="No queue entries match this view."/>
    {historyId !== null && !disabled && canAct() && <EmailAttemptHistory ownerIdentity={identity} id={historyId} canReview={canManage&&canProcess&&items.some(row=>row.id===historyId&&row.status==='delivery_unknown')} onClose={() => setHistoryId(null)}/>}</>;
}
