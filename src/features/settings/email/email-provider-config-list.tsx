"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal, Pencil, Key, Wifi, WifiOff, Star, Trash2,
  Send, CheckCircle2, XCircle, Clock, AlertTriangle,
} from "lucide-react";
import type { EmailProviderConfig } from "@/lib/email/providers/types";
import {
  deleteEmailProviderConfig,
  setDefaultEmailProviderConfig,
  testEmailProviderConnection,
  updateEmailProviderConfig,
} from "@/server/actions/settings/email-settings";
import { EmailProviderFormDialog } from "./email-provider-form-dialog";
import { EmailProviderSecretDialog } from "./email-provider-secret-dialog";
import { EmailTestSendDialog } from "./email-test-send-dialog";

const PROVIDER_TYPE_LABELS: Record<string, string> = {
  microsoft_graph: "Microsoft 365 Graph",
  smtp: "SMTP",
  sendgrid: "SendGrid",
  mailgun: "Mailgun",
  aws_ses: "Amazon SES",
  local_dev: "Local Dev",
  custom: "Custom",
};

interface EmailProviderConfigListProps {
  configs: EmailProviderConfig[];
  onRefresh: () => void;
  onAdd: () => void;
}

export function EmailProviderConfigList({ configs, onRefresh, onAdd }: EmailProviderConfigListProps) {
  const [editingProvider, setEditingProvider] = useState<EmailProviderConfig | null>(null);
  const [secretDialogProvider, setSecretDialogProvider] = useState<EmailProviderConfig | null>(null);
  const [testSendProvider, setTestSendProvider] = useState<EmailProviderConfig | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);

  const handleTestConnection = async (p: EmailProviderConfig) => {
    setTestingId(p.id);
    try {
      const result = await testEmailProviderConnection(p.id);
      if (result.success) {
        toast.success(`Connection successful: ${(result as { data?: { message?: string } }).data?.message ?? ""}`);
      } else {
        toast.error(`Connection failed: ${result.error}`);
      }
      onRefresh();
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleEnabled = async (p: EmailProviderConfig) => {
    const result = await updateEmailProviderConfig(p.id, { is_enabled: !p.isEnabled });
    if (result.success) {
      toast.success(p.isEnabled ? "Provider disabled" : "Provider enabled");
      onRefresh();
    } else {
      toast.error(result.error ?? "Failed");
    }
  };

  const handleSetDefault = async (p: EmailProviderConfig) => {
    const result = await setDefaultEmailProviderConfig(p.id);
    if (result.success) { toast.success("Set as default provider"); onRefresh(); }
    else toast.error(result.error ?? "Failed");
  };

  const handleDelete = async (p: EmailProviderConfig) => {
    if (!confirm(`Delete provider "${p.providerName}"? This action is irreversible.`)) return;
    const result = await deleteEmailProviderConfig(p.id);
    if (result.success) { toast.success("Provider deleted"); onRefresh(); }
    else toast.error(result.error ?? "Failed");
  };

  if (configs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground mb-3">No email providers configured yet.</p>
        <Button size="sm" onClick={onAdd}>Add First Provider</Button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {configs.map((p) => (
          <div key={p.id} className={`rounded-lg border p-4 transition-colors ${
            p.isEnabled && p.isDefault
              ? "border-primary/40 bg-primary/5"
              : p.isEnabled
              ? "border-green-300/40 bg-green-50/30 dark:bg-green-950/10"
              : "border-border"
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{p.providerName}</p>
                  {p.isDefault && (
                    <Badge variant="outline" className="text-xs border-primary text-primary gap-1">
                      <Star className="h-2.5 w-2.5" />Default
                    </Badge>
                  )}
                  {p.isEnabled ? (
                    <Badge variant="outline" className="text-xs border-green-400 text-green-700 dark:text-green-400 gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5" />Enabled
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground gap-1">
                      <XCircle className="h-2.5 w-2.5" />Disabled
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs">{PROVIDER_TYPE_LABELS[p.providerType] ?? p.providerType}</Badge>
                </div>

                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Code: <span className="font-mono text-foreground/80">{p.providerCode}</span></span>
                  {p.senderEmail && <span>Sender: {p.senderEmail}</span>}
                  {p.tenantId && <span>Tenant: <span className="font-mono">{p.tenantId.slice(0, 8)}…</span></span>}
                  {p.clientId && <span>Client ID: <span className="font-mono">{p.clientId.slice(0, 8)}…</span></span>}
                  <span>Secret: {p.maskedSecretPreview
                    ? <span className="font-mono text-green-600 dark:text-green-400">{p.maskedSecretPreview}</span>
                    : <span className="text-amber-500">Not configured</span>}
                  </span>
                </div>

                {/* Last test status */}
                {p.lastTestStatus && (
                  <div className={`mt-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                    p.lastTestStatus === "success"
                      ? "border-green-300 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20"
                      : "border-red-300 text-red-600 bg-red-50 dark:bg-red-950/20"
                  }`}>
                    {p.lastTestStatus === "success"
                      ? <CheckCircle2 className="h-2.5 w-2.5" />
                      : <XCircle className="h-2.5 w-2.5" />}
                    Last test: {p.lastTestStatus}
                    {p.lastTestAt && (
                      <span className="opacity-70 ml-1">
                        {new Date(p.lastTestAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  disabled={testingId === p.id}
                  onClick={() => handleTestConnection(p)}
                >
                  <Wifi className={`h-3 w-3 ${testingId === p.id ? "animate-pulse" : ""}`} />
                  {testingId === p.id ? "Testing…" : "Test Connection"}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditingProvider(p)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" />Edit Provider
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSecretDialogProvider(p)}>
                      <Key className="h-3.5 w-3.5 mr-2" />Update Secret
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTestSendProvider(p)} disabled={!p.isEnabled}>
                      <Send className="h-3.5 w-3.5 mr-2" />Send Test Email
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleToggleEnabled(p)}>
                      {p.isEnabled
                        ? <><WifiOff className="h-3.5 w-3.5 mr-2" />Disable</>
                        : <><Wifi className="h-3.5 w-3.5 mr-2" />Enable</>}
                    </DropdownMenuItem>
                    {!p.isDefault && (
                      <DropdownMenuItem onClick={() => handleSetDefault(p)}>
                        <Star className="h-3.5 w-3.5 mr-2" />Set as Default
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(p)}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editingProvider && (
        <EmailProviderFormDialog open mode="edit" initialData={editingProvider}
          onOpenChange={(v) => { if (!v) setEditingProvider(null); }}
          onSuccess={() => { setEditingProvider(null); onRefresh(); }} />
      )}

      {secretDialogProvider && (
        <EmailProviderSecretDialog open
          onOpenChange={(v) => { if (!v) setSecretDialogProvider(null); }}
          providerId={secretDialogProvider.id}
          providerName={secretDialogProvider.providerName}
          currentMaskedPreview={secretDialogProvider.maskedSecretPreview}
          onSuccess={() => { setSecretDialogProvider(null); onRefresh(); }} />
      )}

      {testSendProvider && (
        <EmailTestSendDialog open
          onOpenChange={(v) => { if (!v) setTestSendProvider(null); }}
          providerId={testSendProvider.id}
          providerName={testSendProvider.providerName}
          defaultRecipient={testSendProvider.defaultRecipientForTests}
          onSuccess={() => { setTestSendProvider(null); onRefresh(); }} />
      )}
    </>
  );
}
