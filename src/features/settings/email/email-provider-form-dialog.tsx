"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createWorkspaceSaveAttempt, type WorkspaceSaveContract } from "@/lib/workspace/save-contract";
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

export function EmailProviderFormDialog(props: EmailProviderFormDialogProps) {
  return props.open ? <EmailProviderFormSession key={props.initialData?.id ?? "new"} {...props} /> : null;
}

function EmailProviderFormSession({
  open,
  onOpenChange,
  mode,
  initialData,
  onSuccess,
}: EmailProviderFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const attempt = useRef(createWorkspaceSaveAttempt());
  const pending = useRef<{id: number | null; payload: Parameters<typeof createEmailProviderConfig>[0]; contract: WorkspaceSaveContract; fingerprint: string; hadUnknown: boolean} | null>(null);
  const flight = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const openingRevision = useRef(initialData?.workspaceRevision ?? null);
  const confirmedRef = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const [displayError, setDisplayError] = useState(false);
  const router = useRouter();
  const display = (effect: () => void) => { try { effect(); } catch { if (alive.current) setDisplayError(true); } };
  const [saveError, setSaveError] = useState("");
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
    throttle_per_minute: initialData?.throttlePerMinute?.toString() ?? "",
    daily_send_limit: initialData?.dailySendLimit?.toString() ?? "",
    notes: initialData?.notes ?? "",
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const handleClose = (v: boolean) => {
    if (!isSubmitting) display(() => onOpenChange(v));
  };

  const handleSubmit = async () => {
    if (flight.current || confirmedRef.current) return;
    if (!form.provider_name.trim()) { toast.error("Provider name is required"); return; }
    if (mode === "add" && !form.provider_code.trim()) { toast.error("Provider code is required"); return; }
    const fingerprint = JSON.stringify(form);
    if (pending.current && pending.current.fingerprint !== fingerprint) {
      setSaveError("Restore the submitted entries before retrying the original unconfirmed save.");
      return;
    }

    flight.current = true;
    setIsSubmitting(true);
    setSaveError("");
    let dispatched: typeof pending.current = null;
    try {
      const payload = {
        ...form,
        is_active: initialData?.isActive ?? true,
        throttle_per_minute: form.throttle_per_minute === "" ? null : Number(form.throttle_per_minute),
        daily_send_limit: form.daily_send_limit === "" ? null : Number(form.daily_send_limit),
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

      const request = pending.current ?? {id: mode === "add" ? null : initialData!.id, payload: {...payload}, contract: attempt.current.begin(payload, openingRevision.current), fingerprint, hadUnknown: false};
      pending.current = request;
      dispatched = request;
      const result = request.id === null
        ? await createEmailProviderConfig(request.payload, request.contract)
        : await updateEmailProviderConfig(request.id, request.payload, request.contract);
      if (!alive.current) return;
      if (!result.success && (result.uncertain || request.hadUnknown)) {
        request.hadUnknown = true;
        setSaveError("Save unconfirmed. Restore the submitted entries and retry to recover the same operation, or reopen the current record to reconcile it.");
        return;
      }
      if (pending.current === request) { pending.current = null; attempt.current.resolved(); }

      if (result.success) {
        confirmedRef.current = true;
        setConfirmed(true);
        display(() => toast.success(result.data?.changed === false ? "No changes to save" : request.id === null ? "Email provider created" : "Email provider updated"));
        display(() => onOpenChange(false));
        display(() => onSuccess?.());
      } else {
        setSaveError(result.error ?? "Provider save was not confirmed. Your entries are retained.");
      }
    } catch {
      if (dispatched) dispatched.hadUnknown = true;
      if (alive.current) setSaveError("Save unconfirmed. Restore the submitted entries and retry to recover the same operation, or reopen the current record to reconcile it.");
    } finally {
      flight.current = false;
      if (alive.current) setIsSubmitting(false);
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
      submitDisabled={confirmed}
      isDirty={confirmed ? false : undefined}
      onSubmit={handleSubmit}
    >
      {saveError && <p role="alert" className="rounded-sm border border-destructive p-3 text-sm text-destructive">{saveError}</p>}
      {confirmed && <div role="status" className="space-y-2"><p>Provider saved. Reopen the current record before making another change.</p>{displayError && <p>The display could not finish updating. The save remains confirmed.</p>}<Button type="button" variant="outline" onClick={() => display(() => router.refresh())}>Refresh settings only</Button></div>}
      <fieldset disabled={confirmed} className="space-y-5">
        {/* Basic */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {mode === "add" && (
            <div>
              <Label htmlFor="pcode" className="mb-1.5 block">Provider Code <span className="text-red-500">*</span></Label>
              <Input required id="pcode" pattern="[A-Z0-9_]+" maxLength={100} value={form.provider_code} onChange={(e) => set("provider_code", e.target.value.toUpperCase())} placeholder="M365_DEFAULT" className="font-mono uppercase" />
              <p className="text-xs text-muted-foreground mt-1">Uppercase letters, numbers, underscores only.</p>
            </div>
          )}
          <div>
            <Label htmlFor="pname" className="mb-1.5 block">Provider Name <span className="text-red-500">*</span></Label>
            <Input required id="pname" value={form.provider_name} onChange={(e) => set("provider_name", e.target.value)} placeholder="Microsoft 365 (Production)" />
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
            <p className="text-xs text-muted-foreground">Client secret is set separately via &quot;Update Secret&quot;. Do not enter it here.</p>
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
            <Switch id="is-default" disabled={initialData?.isDefault} checked={form.is_default} onCheckedChange={(v) => set("is_default", v)} />
            <Label htmlFor="is-default" className="text-sm cursor-pointer">Default Provider</Label>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">A default may be configured while disabled. Set another provider as default before retiring this one. Enabling requires a supported adapter and complete credentials.</p>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="text-sm font-medium">Delivery limits</legend>
          <div><Label htmlFor="throttle-per-minute">Attempts per rolling minute</Label><Input id="throttle-per-minute" type="number" min={1} max={2147483647} step={1} value={form.throttle_per_minute} onChange={e=>set("throttle_per_minute",e.target.value)} /></div>
          <div><Label htmlFor="daily-send-limit">Attempts per rolling 24 hours</Label><Input id="daily-send-limit" type="number" min={1} max={2147483647} step={1} value={form.daily_send_limit} onChange={e=>set("daily_send_limit",e.target.value)} /></div>
          <p className="sm:col-span-2 text-xs text-muted-foreground">Blank means no configured limit, not a recommended budget. These values do not activate workers. F09 release acceptance must verify shared-sender budgets and all delivery paths.</p>
        </fieldset>
        {/* Notes */}
        <div>
          <Label htmlFor="pnotes" className="mb-1.5 block">Notes</Label>
          <Textarea id="pnotes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} maxLength={2000} placeholder="Optional notes about this provider..." />
        </div>
      </fieldset>
    </ERPChildDialogForm>
  );
}
