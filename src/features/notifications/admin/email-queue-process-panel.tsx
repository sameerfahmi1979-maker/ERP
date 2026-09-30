"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Send, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { processEmailQueue, queueEmail } from "@/server/actions/notifications/email-queue";

interface EmailQueueProcessPanelProps {
  canManage: boolean;
  pendingCount: number;
  onRefresh: () => void;
}

export function EmailQueueProcessPanel({ pendingCount, onRefresh, canManage }: EmailQueueProcessPanelProps) {
  const [loading, startTransition] = useTransition();
  const [dryRun, setDryRun] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [queueing, setQueueing] = useState(false);
  const testRequest = useRef<{email:string;key:string}|null>(null);
  const submitting = useRef(false);
  const processing = useRef(false);

  const handleProcess = () => {
    if (processing.current) return;
    processing.current = true;
    startTransition(async () => {
      try {
      const result = await processEmailQueue({ dryRun, limit: 20 });
      if (result.success && result.data) {
        const { processed, sent, failed, skipped } = result.data;
        if (dryRun) {
          toast.info("Dry run: no email claimed or sent. Authorization is checked again before delivery.");
        } else if (result.data.paused) {
          toast.info("Email processing is paused; no messages were sent.");
        } else {
          toast.info(`Processed ${processed}: ${sent} provider-accepted, ${failed} failed, ${result.data.retry??0} retrying, ${result.data.deferred??0} waiting for provider capacity, ${result.data.unknown??0} uncertain, ${skipped} skipped. Acceptance is not proof of inbox delivery.`);
        }
      } else {
        toast.error(result.error ?? "Processing failed");
      }
      } catch {
        toast.error("Processing response unavailable. Refresh and inspect delivery outcomes before retrying; an email may already have been accepted.");
      } finally { processing.current = false; onRefresh(); }
    });
  };

  const handleQueueTest = async () => {
    if (submitting.current) return;
    if (!testEmail) { toast.error("Enter a test recipient email"); return; }
    if(testRequest.current?.email!==testEmail)testRequest.current={email:testEmail,key:crypto.randomUUID()};
    submitting.current=true;
    setQueueing(true);
    try {
    const result = await queueEmail({
      request_id: testRequest.current.key,
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
      testRequest.current=null;
      toast.success(`Queued test email (ID: ${result.data?.id}) — click Process Queue to send`);
      onRefresh();
    } else {
      toast.error(result.error ?? "Failed to queue");
    }
    } catch { toast.error("Queue response unavailable. Retry to check the same request; do not create a duplicate."); }
    finally { submitting.current=false;setQueueing(false); }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Email Queue Processing</p>
          <p className="text-xs text-muted-foreground">
            {pendingCount} pending item{pendingCount !== 1 ? "s" : ""}, including paused and future items. Processes up to 20 due, eligible items.
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

      {canManage && <div className="border-t pt-3">
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
      </div>}
    </div>
  );
}
