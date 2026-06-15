"use client";

import { useState, useTransition, useCallback } from "react";
import { ScrollText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeliveryLogsTable } from "./delivery-logs-table";
import type { DeliveryLogRow } from "@/server/actions/notifications/delivery-logs";
import { getNotificationDeliveryLogs } from "@/server/actions/notifications/delivery-logs";

interface DeliveryLogsPageClientProps {
  initialLogs: DeliveryLogRow[];
}

export function DeliveryLogsPageClient({ initialLogs }: DeliveryLogsPageClientProps) {
  const [logs, setLogs] = useState(initialLogs);
  const [loading, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await getNotificationDeliveryLogs({ limit: 200 });
      if (result.success && result.data) setLogs(result.data);
    });
  }, []);

  const sentCount = logs.filter((l) => l.status === "sent").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScrollText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Delivery Logs</h1>
            <p className="text-sm text-muted-foreground">
              Email and notification delivery history — {logs.length} entries, {sentCount} sent, {failedCount} failed
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={refresh} disabled={loading} title="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <DeliveryLogsTable logs={logs} />
    </div>
  );
}
