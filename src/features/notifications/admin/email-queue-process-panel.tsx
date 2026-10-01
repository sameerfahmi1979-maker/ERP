"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { processEmailQueue, queueEmail } from "@/server/actions/notifications/email-queue";

interface EmailQueueProcessPanelProps {
  pendingCount: number;
  onRefresh: () => void;
}

export function EmailQueueProcessPanel({ pendingCount, onRefresh }: EmailQueueProcessPanelProps) {
  const [loading, startTransition] = useTransition();
  const [dryRun, setDryRun] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [queueing, setQueueing] = useState(false);

  const handleProcess = () => {
    startTransition(async () => {
      const result = await processEmailQueue({ dryRun, limit: 20 });
      if (result.success && result.data) {
        const { processed, sent, failed, skipped } = result.data;
        if (dryRun) {
          toast.info(`Dry run: ${processed} items would be processed`);
        } else {
          toast.success(`Processed ${processed}: ${sent} sent, ${failed} failed, ${skipped} skipped`);
        }
        onRefresh();
      } else {
        toast.error(result.error ?? "Processing failed");
      }
    });
  };

  const handleQueueTest = async () => {
    if (!testEmail) { toast.error("Enter a test recipient email"); return; }
    setQueueing(true);
    const result = await queueEmail({
      source_module: "SYSTEM",
      to_emails: [testEmail],
      subject: "ALGT ERP Test Email",
      html_body: "<p>This is a test email from <strong>ALGT ERP</strong>.</p>",
      text_body: "This is a test email from ALGT ERP.",
      template_code: "SYSTEM_TEST_EMAIL",
      priority: "high",
      max_attempts: 3,
    });
    setQueueing(false);
    if (result.success) {
      toast.success(`Queued test email (ID: ${result.data?.id}) — click Process Queue to send`);
      onRefresh();
    } else {
      toast.error(result.error ?? "Failed to queue");
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Email Queue Processing</p>
          <p className="text-xs text-muted-foreground">
            {pendingCount} pending item{pendingCount !== 1 ? "s" : ""} — processes up to 20 at a time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="rounded"
            />
            Dry run
          </label>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={loading || pendingCount === 0}
            onClick={handleProcess}
          >
            <Zap className="h-4 w-4" />
            {dryRun ? "Simulate" : "Process Queue"}
          </Button>
        </div>
      </div>

      <div className="border-t pt-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">Queue a Test Email</p>
        <div className="flex gap-2">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="recipient@example.com"
            className="flex-1 h-8 rounded-md border bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button size="sm" variant="outline" className="gap-1.5 h-8" disabled={queueing} onClick={handleQueueTest}>
            <Send className="h-3.5 w-3.5" />
            Queue Test
          </Button>
        </div>
      </div>
    </div>
  );
}
