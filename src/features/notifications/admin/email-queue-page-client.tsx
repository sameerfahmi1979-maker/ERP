"use client";

import { Button } from "@/components/ui/button";
import { getEmailQueuePage, type EmailQueuePage } from "@/server/actions/notifications/email-queue";
import { queuePageSchema, QUEUE_STATUSES, type QueuePageOptions } from "@/lib/email/queue/list-contract";
import { Mail, RefreshCw } from "lucide-react";
import { useCallback, useRef, useState, useTransition } from "react";
import { EmailQueueProcessPanel } from "./email-queue-process-panel";
import { EmailQueueTable } from "./email-queue-table";

interface EmailQueuePageClientProps {
  initialPage: EmailQueuePage | null;
  initialError: string | null;
  canManage: boolean;
  canProcess: boolean;
}

export function EmailQueuePageClient({ initialPage, initialError, canManage, canProcess }: EmailQueuePageClientProps) {
  const [data, setData] = useState(initialPage);
  const [error, setError] = useState(initialError);
  const [options, setOptions] = useState(() => queuePageSchema.parse({}));
  const [loading, startTransition] = useTransition();
  const latest = useRef(0);
  const load = useCallback((next: QueuePageOptions) => {
    const normalized = queuePageSchema.parse(next);
    setOptions(normalized);
    const request = ++latest.current;
    startTransition(async () => {
      try {
        const result = await getEmailQueuePage(normalized);
        if (request !== latest.current) return;
        if (result.success && result.data) { setData(result.data); setError(null); }
        else setError(result.error ?? "Queue unavailable. Refresh to try again.");
      } catch {
        if (request === latest.current) setError("Queue unavailable. Refresh to try again.");
      }
    });
  }, []);
  const refresh = useCallback(() => load(options), [load, options]);
  const pendingCount = data?.statusCounts.pending ?? 0;
  return (
    <div className="flex flex-col gap-6" aria-busy={loading}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Email Queue</h1>
            <p className="text-sm text-muted-foreground">
              {data ? `Global ERP outbound email queue — ${data.allTotal} total, ${pendingCount} pending` : "Queue counts unavailable"}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={refresh} disabled={loading} title="Refresh" aria-label="Refresh queue">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {error && <p role="alert" className="text-destructive">{error} {data ? "Showing last successful results; actions are disabled until refreshed." : ""}</p>}
      {canProcess && <fieldset aria-label="Queue processing controls" disabled={loading || !!error} className="min-w-0 border-0 p-0">
        <EmailQueueProcessPanel canManage={canManage} pendingCount={pendingCount} onRefresh={refresh} />
      </fieldset>}
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Queue status filters">
        {(["all", ...QUEUE_STATUSES] as const).map(status => (
          <button key={status} type="button" disabled={loading}
            onClick={() => load({ ...options, page: 1, status: status === "all" ? undefined : status })}
            aria-pressed={(options.status ?? "all") === status}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap border ${(options.status ?? "all") === status ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}>
            {status === "all" ? `All (${data?.allTotal ?? "—"})` : `${status === "sent" ? "Provider accepted / legacy sent" : status === "delivery_unknown" ? "Delivery uncertain" : status} (${data?.statusCounts[status] ?? "—"})`}
          </button>
        ))}
      </div>
      <EmailQueueTable items={data?.items ?? []} onRefresh={refresh} canManage={canManage} canProcess={canProcess}
        loading={loading || !!error} total={data?.total ?? 0} options={options} onOptions={load} />
    </div>
  );
}
