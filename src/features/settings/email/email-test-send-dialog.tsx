"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send, CheckCircle2, XCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { sendTestEmail } from "@/server/actions/settings/email-settings";

interface EmailTestSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: number;
  providerName: string;
  defaultRecipient?: string | null;
  onSuccess?: () => void;
}

export function EmailTestSendDialog({
  open,
  onOpenChange,
  providerId,
  providerName,
  defaultRecipient,
  onSuccess,
}: EmailTestSendDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toEmail, setToEmail] = useState(defaultRecipient ?? "");
  const [subject, setSubject] = useState("ALGT ERP Email Test");
  const [message, setMessage] = useState("This is a test email from ALGT ERP Email Settings.");
  const [result, setResult] = useState<{ ok: boolean; message: string; durationMs?: number } | null>(null);

  const reset = () => {
    setToEmail(defaultRecipient ?? "");
    setSubject("ALGT ERP Email Test");
    setMessage("This is a test email from ALGT ERP Email Settings.");
    setResult(null);
  };

  const handleClose = (v: boolean) => {
    if (!isSubmitting) { if (!v) reset(); onOpenChange(v); }
  };

  const handleSubmit = async () => {
    if (!toEmail.trim()) { toast.error("Recipient email is required"); return; }
    setIsSubmitting(true);
    setResult(null);
    try {
      const res = await sendTestEmail(providerId, { to_email: toEmail, subject, message });
      const ok = res.success;
      const resData = (res as { data?: { message?: string; durationMs?: number } }).data;
      setResult({
        ok,
        message: ok ? (resData?.message ?? "Email sent successfully.") : ((res as { error?: string }).error ?? "Failed."),
        durationMs: resData?.durationMs,
      });
      if (ok) {
        toast.success("Test email sent successfully");
        onSuccess?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleClose}
      title="Send Test Email"
      subtitle={`Send a test email via ${providerName}`}
      icon={<Send className="h-5 w-5 text-blue-500" />}
      mode="add"
      size="md"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      submitLabel="Send Test Email"
    >
      <div className="space-y-4">
        {result && (
          <div className={`rounded-md border p-3 flex items-start gap-2 text-sm ${
            result.ok
              ? "border-green-300 bg-green-50 text-green-700 dark:bg-green-950/20 dark:border-green-900 dark:text-green-400"
              : "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/20 dark:border-red-900 dark:text-red-400"
          }`}>
            {result.ok
              ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
            <div>
              <p>{result.message}</p>
              {result.durationMs && <p className="text-xs mt-0.5 opacity-70">{result.durationMs}ms</p>}
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="to-email" className="mb-1.5 block">
            To Email <span className="text-red-500">*</span>
          </Label>
          <Input
            id="to-email"
            type="email"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            placeholder="recipient@company.com"
          />
        </div>

        <div>
          <Label htmlFor="test-subject" className="mb-1.5 block">Subject</Label>
          <Input
            id="test-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={500}
          />
        </div>

        <div>
          <Label htmlFor="test-message" className="mb-1.5 block">Message</Label>
          <Textarea
            id="test-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={4000}
          />
        </div>
      </div>
    </ERPChildDialogForm>
  );
}
