"use client";

import { useRefreshableRows } from "@/hooks/use-refreshable-rows";
import { ScrollText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeliveryLogsTable } from "./delivery-logs-table";
import type { DeliveryLogRow } from "@/server/actions/notifications/delivery-logs";
import { getNotificationDeliveryLogs } from "@/server/actions/notifications/delivery-logs";

interface DeliveryLogsPageClientProps {
  initialLogs: DeliveryLogRow[];
  initialError?: boolean;
}
const loadLogs=()=>getNotificationDeliveryLogs({limit:200});

export function DeliveryLogsPageClient({ initialLogs, initialError = false }: DeliveryLogsPageClientProps) {
  const {rows:logs,failed,loading,refresh}=useRefreshableRows(initialLogs,initialError,loadLogs);

  const sentCount = logs.filter((l) => l.status === "sent").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <ScrollText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Delivery Logs</h1>
            <p className="text-sm text-muted-foreground">
              Recent delivery history — {logs.length} loaded (up to 200), {sentCount} recorded as sent, {failedCount} failed. A sent log does not confirm inbox receipt.
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={refresh} disabled={loading} title="Refresh" aria-label="Refresh delivery logs">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {failed ? <p role="alert">Delivery logs could not be refreshed. Use Refresh to retry; previous records may be outdated.</p> : null}
      <DeliveryLogsTable logs={logs} />
    </div>
  );
}
