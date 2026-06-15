"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Mail, ShieldCheck, ToggleLeft, ScrollText, BookOpen } from "lucide-react";
import type { EmailProviderConfig, EmailFeatureFlag, EmailSendLogRow } from "@/lib/email/providers/types";
import { EmailProviderConfigList } from "./email-provider-config-list";
import { EmailFeatureFlagsPanel } from "./email-feature-flags-panel";
import { EmailSendLogTable } from "./email-send-log-table";
import { EmailSecurityNotice, EmailProviderNotReadyNotice } from "./email-security-notice";
import { EmailProviderFormDialog } from "./email-provider-form-dialog";

interface EmailSettingsPageClientProps {
  configs: EmailProviderConfig[];
  featureFlags: EmailFeatureFlag[];
  sendLogs: EmailSendLogRow[];
}

export function EmailSettingsPageClient({
  configs,
  featureFlags,
  sendLogs,
}: EmailSettingsPageClientProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const enabledProviders = configs.filter((c) => c.isEnabled);
  const hasEnabledProvider = enabledProviders.length > 0;

  // Trigger server-side refresh by forcing page re-render
  const handleRefresh = () => {
    startTransition(() => {
      // Next.js will re-fetch on server component re-render
      window.location.reload();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Email Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure ERP-wide email delivery providers for notifications, reports, approvals, and system emails.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" disabled={isPending} onClick={handleRefresh}>
            <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Provider
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border p-3">
          <p className="text-2xl font-bold tabular-nums">{configs.length}</p>
          <p className="text-xs text-muted-foreground">Providers Configured</p>
        </div>
        <div className={`rounded-lg border p-3 ${hasEnabledProvider ? "border-green-300 bg-green-50/30 dark:bg-green-950/10" : "border-border"}`}>
          <p className="text-2xl font-bold tabular-nums">{enabledProviders.length}</p>
          <p className="text-xs text-muted-foreground">Active / Enabled</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-2xl font-bold tabular-nums">{featureFlags.filter((f) => f.isEnabled).length}</p>
          <p className="text-xs text-muted-foreground">Feature Flags On</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-2xl font-bold tabular-nums">{sendLogs.length}</p>
          <p className="text-xs text-muted-foreground">Send Log Entries</p>
        </div>
      </div>

      {/* Security notice */}
      <EmailSecurityNotice />

      {/* Not ready notice if no enabled provider */}
      {!hasEnabledProvider && <EmailProviderNotReadyNotice />}

      {/* Main tabs */}
      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers" className="gap-1.5">
            <Mail className="h-3.5 w-3.5" />Providers
          </TabsTrigger>
          <TabsTrigger value="flags" className="gap-1.5">
            <ToggleLeft className="h-3.5 w-3.5" />Feature Flags
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5">
            <ScrollText className="h-3.5 w-3.5" />Send Logs
          </TabsTrigger>
          <TabsTrigger value="guide" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />Setup Guide
          </TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="mt-4">
          <EmailProviderConfigList
            configs={configs}
            onRefresh={handleRefresh}
            onAdd={() => setAddOpen(true)}
          />
        </TabsContent>

        <TabsContent value="flags" className="mt-4">
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium mb-1">Email Feature Flags</p>
            <p className="text-xs text-muted-foreground mb-4">
              Control which ERP modules can send emails. All flags are disabled by default.
              Flags marked "Requires approval" prompt confirmation before enabling.
            </p>
            <EmailFeatureFlagsPanel flags={featureFlags} onRefresh={handleRefresh} />
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <EmailSendLogTable logs={sendLogs} />
        </TabsContent>

        <TabsContent value="guide" className="mt-4">
          <Microsoft365SetupGuide />
        </TabsContent>
      </Tabs>

      {addOpen && (
        <EmailProviderFormDialog
          open
          mode="add"
          onOpenChange={(v) => { if (!v) setAddOpen(false); }}
          onSuccess={() => { setAddOpen(false); handleRefresh(); }}
        />
      )}
    </div>
  );
}

function Microsoft365SetupGuide() {
  return (
    <div className="rounded-lg border border-border p-6 space-y-5 text-sm">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Microsoft 365 Graph Setup Guide</h2>
      </div>

      <ol className="space-y-4 list-decimal list-inside text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Register an App in Microsoft Entra ID (Azure AD)</span>
          <p className="ml-5 mt-1 text-xs">Go to portal.azure.com → Microsoft Entra ID → App registrations → New registration.</p>
          <p className="ml-5 mt-0.5 text-xs">Set the name (e.g. "ALGT ERP Mail Sender") and choose "Accounts in this organizational directory only".</p>
        </li>
        <li>
          <span className="font-medium text-foreground">Grant Mail.Send application permission</span>
          <p className="ml-5 mt-1 text-xs">In the registered app: API permissions → Add a permission → Microsoft Graph → Application permissions → Mail.Send → Grant admin consent.</p>
        </li>
        <li>
          <span className="font-medium text-foreground">Create a Client Secret</span>
          <p className="ml-5 mt-1 text-xs">Certificates & secrets → New client secret → Copy the value immediately (shown only once).</p>
        </li>
        <li>
          <span className="font-medium text-foreground">Set the secret in your environment</span>
          <p className="ml-5 mt-1 text-xs">Add to your server environment: <code className="font-mono bg-muted px-1 rounded">MICROSOFT_GRAPH_CLIENT_SECRET=&lt;your-secret&gt;</code></p>
        </li>
        <li>
          <span className="font-medium text-foreground">Configure the provider in ERP</span>
          <p className="ml-5 mt-1 text-xs">In the Providers tab: edit M365_DEFAULT → enter Tenant ID and Client ID (App ID) → click "Update Secret" → enter the env var name (e.g. MICROSOFT_GRAPH_CLIENT_SECRET).</p>
        </li>
        <li>
          <span className="font-medium text-foreground">Test the connection</span>
          <p className="ml-5 mt-1 text-xs">Click "Test Connection" to verify credentials. Then use "Send Test Email" to confirm email delivery.</p>
        </li>
        <li>
          <span className="font-medium text-foreground">Enable the provider and feature flags</span>
          <p className="ml-5 mt-1 text-xs">Toggle the provider to Enabled and enable the relevant feature flags (e.g. DMS_EXPIRY_EMAILS) once you confirm delivery works.</p>
        </li>
      </ol>

      <div className="rounded-md bg-muted/20 border border-border p-3 text-xs">
        <p className="font-medium">Important: ERP NOTIFICATIONS.1 required for automatic delivery</p>
        <p className="text-muted-foreground mt-1">
          This SETTINGS.2 phase provides the email provider foundation. Actual automated email delivery
          (DMS expiry reminders, renewals, etc.) requires the upcoming{" "}
          <strong>ERP NOTIFICATIONS.1 — Global Notification and Email Delivery Engine</strong> phase,
          which will consume the <code className="font-mono">email_ready</code> notification queue.
        </p>
      </div>
    </div>
  );
}
