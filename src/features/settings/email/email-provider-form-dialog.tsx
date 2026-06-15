"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import {
  createEmailProviderConfig,
  updateEmailProviderConfig,
} from "@/server/actions/settings/email-settings";
import type { EmailProviderConfig } from "@/lib/email/providers/types";

const PROVIDER_TYPES = [
  { value: "microsoft_graph", label: "Microsoft 365 Graph" },
  { value: "smtp", label: "SMTP (future)" },
  { value: "sendgrid", label: "SendGrid (future)" },
  { value: "mailgun", label: "Mailgun (future)" },
  { value: "aws_ses", label: "Amazon SES (future)" },
  { value: "local_dev", label: "Local Dev (no send)" },
];

interface EmailProviderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  initialData?: EmailProviderConfig;
  onSuccess?: () => void;
}

export function EmailProviderFormDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  onSuccess,
}: EmailProviderFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    provider_code: initialData?.providerCode ?? "",
    provider_type: initialData?.providerType ?? ("microsoft_graph" as const),
    provider_name: initialData?.providerName ?? "",
    tenant_id: initialData?.tenantId ?? "",
    client_id: initialData?.clientId ?? "",
    authority_url: initialData?.authorityUrl ?? "",
    graph_base_url: initialData?.graphBaseUrl ?? "https://graph.microsoft.com/v1.0",
    sender_email: initialData?.senderEmail ?? "",
    sender_display_name: initialData?.senderDisplayName ?? "",
    reply_to_email: initialData?.replyToEmail ?? "",
    default_recipient_for_tests: initialData?.defaultRecipientForTests ?? "",
    auth_mode: initialData?.authMode ?? ("client_credentials" as const),
    send_mode: initialData?.sendMode ?? ("graph_send_mail" as const),
    is_enabled: initialData?.isEnabled ?? false,
    is_default: initialData?.isDefault ?? false,
    notes: initialData?.notes ?? "",
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const handleClose = (v: boolean) => {
    if (!isSubmitting) onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (!form.provider_name.trim()) { toast.error("Provider name is required"); return; }
    if (mode === "add" && !form.provider_code.trim()) { toast.error("Provider code is required"); return; }

    setIsSubmitting(true);
    try {
      const payload = {
        ...form,
        tenant_id: form.tenant_id || null,
        client_id: form.client_id || null,
        authority_url: form.authority_url || null,
        graph_base_url: form.graph_base_url || null,
        sender_email: form.sender_email || null,
        sender_display_name: form.sender_display_name || null,
        reply_to_email: form.reply_to_email || null,
        default_recipient_for_tests: form.default_recipient_for_tests || null,
        notes: form.notes || null,
      };

      const result = mode === "add"
        ? await createEmailProviderConfig(payload)
        : await updateEmailProviderConfig(initialData!.id, payload);

      if (result.success) {
        toast.success(mode === "add" ? "Email provider created" : "Email provider updated");
        handleClose(false);
        onSuccess?.();
      } else {
        toast.error((result as { error?: string }).error ?? "Failed");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleClose}
      title={mode === "add" ? "Add Email Provider" : "Edit Email Provider"}
      subtitle="Configure an ERP-wide email delivery provider"
      icon={<Mail className="h-5 w-5 text-blue-500" />}
      mode={mode}
      size="lg"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    >
      <div className="space-y-5">
        {/* Basic */}
        <div className="grid grid-cols-2 gap-4">
          {mode === "add" && (
            <div>
              <Label htmlFor="pcode" className="mb-1.5 block">Provider Code <span className="text-red-500">*</span></Label>
              <Input id="pcode" value={form.provider_code} onChange={(e) => set("provider_code", e.target.value.toUpperCase())} placeholder="M365_DEFAULT" className="font-mono uppercase" />
              <p className="text-xs text-muted-foreground mt-1">Uppercase letters, numbers, underscores only.</p>
            </div>
          )}
          <div>
            <Label htmlFor="pname" className="mb-1.5 block">Provider Name <span className="text-red-500">*</span></Label>
            <Input id="pname" value={form.provider_name} onChange={(e) => set("provider_name", e.target.value)} placeholder="Microsoft 365 (Production)" />
          </div>
          <div>
            <Label htmlFor="ptype" className="mb-1.5 block">Provider Type</Label>
            <select
              id="ptype"
              value={form.provider_type}
              onChange={(e) => set("provider_type", e.target.value as typeof form.provider_type)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {PROVIDER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Microsoft Graph fields */}
        {form.provider_type === "microsoft_graph" && (
          <fieldset className="rounded-md border border-border p-4 space-y-3">
            <legend className="text-xs font-medium text-muted-foreground px-1 uppercase tracking-wide">Microsoft 365 Graph Configuration</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="tenant-id" className="mb-1 block text-xs">Tenant ID</Label>
                <Input id="tenant-id" value={form.tenant_id} onChange={(e) => set("tenant_id", e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" className="font-mono text-xs" />
              </div>
              <div>
                <Label htmlFor="client-id" className="mb-1 block text-xs">Client ID (App ID)</Label>
                <Input id="client-id" value={form.client_id} onChange={(e) => set("client_id", e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" className="font-mono text-xs" />
              </div>
              <div>
                <Label htmlFor="graph-base" className="mb-1 block text-xs">Graph Base URL</Label>
                <Input id="graph-base" value={form.graph_base_url} onChange={(e) => set("graph_base_url", e.target.value)} placeholder="https://graph.microsoft.com/v1.0" />
              </div>
              <div>
                <Label htmlFor="authority" className="mb-1 block text-xs">Authority URL (optional)</Label>
                <Input id="authority" value={form.authority_url} onChange={(e) => set("authority_url", e.target.value)} placeholder="Auto-derived from Tenant ID" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Client secret is set separately via "Update Secret". Do not enter it here.</p>
          </fieldset>
        )}

        {/* Sender */}
        <fieldset className="rounded-md border border-border p-4 space-y-3">
          <legend className="text-xs font-medium text-muted-foreground px-1 uppercase tracking-wide">Sender Configuration</legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sender-email" className="mb-1 block text-xs">Sender Email</Label>
              <Input id="sender-email" type="email" value={form.sender_email} onChange={(e) => set("sender_email", e.target.value)} placeholder="erp@company.com" />
            </div>
            <div>
              <Label htmlFor="sender-display" className="mb-1 block text-xs">Display Name</Label>
              <Input id="sender-display" value={form.sender_display_name} onChange={(e) => set("sender_display_name", e.target.value)} placeholder="ALGT ERP System" />
            </div>
            <div>
              <Label htmlFor="reply-to" className="mb-1 block text-xs">Reply-To (optional)</Label>
              <Input id="reply-to" type="email" value={form.reply_to_email} onChange={(e) => set("reply_to_email", e.target.value)} placeholder="noreply@company.com" />
            </div>
            <div>
              <Label htmlFor="test-recipient" className="mb-1 block text-xs">Default Test Recipient</Label>
              <Input id="test-recipient" type="email" value={form.default_recipient_for_tests} onChange={(e) => set("default_recipient_for_tests", e.target.value)} placeholder="admin@company.com" />
            </div>
          </div>
        </fieldset>

        {/* Flags */}
        <div className="flex gap-8">
          <div className="flex items-center gap-2">
            <Switch id="is-enabled" checked={form.is_enabled} onCheckedChange={(v) => set("is_enabled", v)} />
            <Label htmlFor="is-enabled" className="text-sm cursor-pointer">Enabled</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="is-default" checked={form.is_default} onCheckedChange={(v) => set("is_default", v)} />
            <Label htmlFor="is-default" className="text-sm cursor-pointer">Default Provider</Label>
          </div>
        </div>

        {/* Notes */}
        <div>
          <Label htmlFor="pnotes" className="mb-1.5 block">Notes</Label>
          <Textarea id="pnotes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} maxLength={2000} placeholder="Optional notes about this provider..." />
        </div>
      </div>
    </ERPChildDialogForm>
  );
}
