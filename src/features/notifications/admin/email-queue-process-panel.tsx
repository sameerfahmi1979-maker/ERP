"use client";

import { useState, useTransition, useLayoutEffect, useRef } from "react";
import { toast } from "sonner";
import { Send, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { processEmailQueue, queueEmail } from "@/server/actions/notifications/email-queue";
import {createWorkspaceSaveAttempt} from "@/lib/workspace/save-contract";

interface EmailQueueProcessPanelProps {
  pendingCount: number;
  onRefresh: () => void;
  canQueue?: boolean;
  canAct?: () => boolean;
}

export function EmailQueueProcessPanel({ pendingCount, onRefresh, canQueue = false, canAct = () => true }: EmailQueueProcessPanelProps) {
  const owner = useRef(false), flight = useRef(false);
  useLayoutEffect(() => {owner.current = true; return () => {owner.current = false;};}, []);
  const [loading, startTransition] = useTransition();
  const [dryRun, setDryRun] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [queueing, setQueueing] = useState(false);
  const attempt = useRef(createWorkspaceSaveAttempt());

  const handleProcess = () => {
    if (!owner.current || flight.current || pendingCount <= 0 || !canAct()) return;
    flight.current = true;
    startTransition(async () => {
      try {
      const result = await processEmailQueue({ dryRun, limit: 20 });
      if (!owner.current) return;
      if (result.success && result.data) {
        const { processed, sent, failed, skipped } = result.data;
        if (dryRun) {
          toast.info("Dry run: no email claimed or sent. Authorization is checked again before delivery.");
        } else if (result.data.paused) {
          toast.info("Email processing is paused; no messages were sent.");
        } else {
          toast.info(`Processed ${processed}: ${sent} provider-accepted, ${failed} failed, ${result.data.retry ?? 0} retrying, ${result.data.deferred ?? 0} waiting for provider capacity, ${result.data.unknown ?? 0} uncertain, ${skipped} skipped. Acceptance is not proof of inbox delivery.`);
        }
      } else {
        toast.error(result.error ?? "Processing failed");
      }
      } catch {if (owner.current) toast.error("Processing response unavailable. Refresh and inspect delivery outcomes before retrying; an email may already have been accepted.");}
      finally {flight.current = false; if (owner.current) onRefresh();}
    });
  };

  const handleQueueTest = async () => {
    if (!owner.current || flight.current || !canQueue || !canAct()) return;
    if (!testEmail) { toast.error("Enter a test recipient email"); return; }
    flight.current = true;
    setQueueing(true);
    try {
    const payload = {
      source_module: "SYSTEM",
      to_emails: [testEmail],
      subject: "ALGT ERP Test Email",
      html_body: "<p>This is a test email from <strong>ALGT ERP</strong>.</p>",
      text_body: "This is a test email from ALGT ERP.",
      template_code: "SYSTEM_TEST_EMAIL",
      priority: "high" as const,
      max_attempts: 3,
    };
    const contract = attempt.current.begin(payload, null);
    const result = await queueEmail({...payload, request_id: contract.operationId});
    if (!owner.current) return;
    if (result.success) {
      attempt.current.resolved();
      toast.success(`Queued test email (ID: ${result.data?.id}) — click Process Queue to send`);
      onRefresh();
    } else {
      toast.error(result.error ?? "Failed to queue");
    }
    } catch {if (owner.current) toast.error("Queue creation could not be confirmed. Refresh before retrying.");}
    finally {flight.current = false; if (owner.current) setQueueing(false);}
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

      {canQueue && <div className="border-t pt-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">Queue a Test Email</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            aria-label="Test email recipient"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="recipient@example.com"
            className="min-w-0 flex-1 h-8 rounded-md border bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
