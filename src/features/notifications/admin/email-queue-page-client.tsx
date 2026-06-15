"use client";

import { useState, useTransition, useCallback } from "react";
import { Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmailQueueTable } from "./email-queue-table";
import { EmailQueueProcessPanel } from "./email-queue-process-panel";
import type { EmailQueueRow } from "@/server/actions/notifications/email-queue";
import { getEmailQueue } from "@/server/actions/notifications/email-queue";

interface EmailQueuePageClientProps {
  initialItems: EmailQueueRow[];
  canManage: boolean;
  canProcess: boolean;
}

export function EmailQueuePageClient({ initialItems, canManage, canProcess }: EmailQueuePageClientProps) {
  const [items, setItems] = useState(initialItems);
  const [loading, startTransition] = useTransition();
  const [filter, setFilter] = useState<string>("all");

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await getEmailQueue({ limit: 200 });
      if (result.success && result.data) setItems(result.data);
    });
  }, []);

  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);
  const pendingCount = items.filter((i) => i.status === "pending").length;

  const statusCounts = ["pending", "processing", "sent", "failed", "cancelled"].reduce((acc, s) => {
    acc[s] = items.filter((i) => i.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Email Queue</h1>
            <p className="text-sm text-muted-foreground">
              Global ERP outbound email queue — {items.length} total, {pendingCount} pending
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={refresh} disabled={loading} title="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {canProcess && <EmailQueueProcessPanel pendingCount={pendingCount} onRefresh={refresh} />}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {["all", ...Object.keys(statusCounts)].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border
              ${filter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
          >
            {s === "all" ? `All (${items.length})` : `${s} (${statusCounts[s] ?? 0})`}
          </button>
        ))}
      </div>

      <EmailQueueTable items={filtered} onRefresh={refresh} />
    </div>
  );
}
