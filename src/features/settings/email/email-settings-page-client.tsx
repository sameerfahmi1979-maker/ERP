"use client";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EmailFeatureFlag, EmailProviderConfig, EmailSendLogRow } from "@/lib/email/providers/types";
import { BookOpen, Mail, Plus, RefreshCw, ScrollText, ToggleLeft } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmailFeatureFlagsPanel } from "./email-feature-flags-panel";
import { EmailProviderConfigList } from "./email-provider-config-list";
import { EmailProviderFormDialog } from "./email-provider-form-dialog";
import { EmailProviderNotReadyNotice, EmailSecurityNotice } from "./email-security-notice";
import { EmailSendLogTable } from "./email-send-log-table";

interface EmailSettingsPageClientProps {
  configs: EmailProviderConfig[];
  featureFlags: EmailFeatureFlag[];
  sendLogs: EmailSendLogRow[];
  canManage?: boolean;
  canTest?: boolean;
  canSecrets?: boolean;
  canFlags?: boolean;
  initialError?: boolean;
  canViewProviders?: boolean;
  canViewFlags?: boolean;
  canViewLogs?: boolean;
}

export function EmailSettingsPageClient({
  configs,
  featureFlags,
  sendLogs,
  canManage = false, canTest = false, canSecrets = false, canFlags = false, initialError = false,
  canViewProviders = true, canViewFlags = true, canViewLogs = true,
}: EmailSettingsPageClientProps) {
  const [addOpen, setAddOpen] = useState(false);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const enabledProviders = configs.filter((c) => c.isEnabled && c.isActive);
  const hasEnabledProvider = enabledProviders.length > 0;
  const defaults = configs.filter(c=>c.isDefault);
  const readyDefault = defaults.length === 1 && defaults[0].isActive && defaults[0].isEnabled;
  const readiness = configs.length === 0 ? "No provider configurations exist. Add a provider before configuring delivery."
    : defaults.length === 0 ? "Providers exist, but no default is selected. Select a supported provider; do not infer readiness from an enabled non-default provider."
    : defaults.length > 1 ? "Conflicting defaults require administrator reconciliation. No authoritative default can be identified."
    : "The selected default is disabled or inactive. Configuration is preserved; automatic delivery is not ready.";

  // Trigger server-side refresh by forcing page re-render
  const handleRefresh = () => {
    startTransition(() => {
      // Next.js will re-fetch on server component re-render
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
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
          {canManage && <Button disabled={initialError || isPending} size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Provider
          </Button>}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border p-3">
          <p className="text-2xl font-bold tabular-nums">{initialError ? "Unavailable" : canViewProviders ? configs.length : "Restricted"}</p>
          <p className="text-xs text-muted-foreground">Providers Configured</p>
        </div>
        <div className={`rounded-lg border p-3 ${hasEnabledProvider ? "border-green-300 bg-green-50/30 dark:bg-green-950/10" : "border-border"}`}>
          <p className="text-2xl font-bold tabular-nums">{initialError ? "Unavailable" : canViewProviders ? enabledProviders.length : "Restricted"}</p>
          <p className="text-xs text-muted-foreground">Active / Enabled</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-2xl font-bold tabular-nums">{initialError ? "Unavailable" : canViewFlags ? featureFlags.filter((f) => f.isEnabled).length : "Restricted"}</p>
          <p className="text-xs text-muted-foreground">Feature Flags On</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-2xl font-bold tabular-nums">{initialError ? "Unavailable" : canViewLogs ? sendLogs.length : "Restricted"}</p>
          <p className="text-xs text-muted-foreground">Send Log Entries</p>
        </div>
      </div>

      {/* Security notice */}
      {initialError && <div role="alert">Email settings could not be loaded completely. Refresh before making changes.</div>}
      <EmailSecurityNotice />

      {/* Not ready notice if no enabled provider */}
      {!initialError && canViewProviders && !readyDefault && <EmailProviderNotReadyNotice message={readiness} />}

      {/* Main tabs */}
      <Tabs defaultValue={canViewProviders ? "providers" : canViewFlags ? "flags" : "logs"}>
        <TabsList className="h-auto flex flex-wrap justify-start">
          {canViewProviders && <TabsTrigger value="providers" className="gap-1.5">
            <Mail className="h-3.5 w-3.5" />Providers
          </TabsTrigger>}
          {canViewFlags && <TabsTrigger value="flags" className="gap-1.5">
            <ToggleLeft className="h-3.5 w-3.5" />Feature Flags
          </TabsTrigger>}
          {canViewLogs && <TabsTrigger value="logs" className="gap-1.5">
            <ScrollText className="h-3.5 w-3.5" />Send Logs
          </TabsTrigger>}
          <TabsTrigger value="guide" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />Setup Guide
          </TabsTrigger>
        </TabsList>

        {canViewProviders && <TabsContent value="providers" className="mt-4">
          <EmailProviderConfigList
            configs={configs}
            canManage={canManage && !initialError && !isPending}
            canTest={canTest && !initialError && !isPending}
            canSecrets={canSecrets && !initialError && !isPending}
            onRefresh={handleRefresh}
            onAdd={() => setAddOpen(true)}
          />
        </TabsContent>}

        {canViewFlags && <TabsContent value="flags" className="mt-4">
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium mb-1">Email Feature Flags</p>
            <p className="text-xs text-muted-foreground mb-4">
              Control which ERP modules can send emails. All flags are disabled by default.
              Flags marked &quot;Requires approval&quot; prompt confirmation before enabling.
            </p>
            <EmailFeatureFlagsPanel flags={featureFlags} onRefresh={handleRefresh} canManage={canFlags && !initialError && !isPending} />
          </div>
        </TabsContent>}

        {canViewLogs && <TabsContent value="logs" className="mt-4">
          <EmailSendLogTable logs={sendLogs} />
        </TabsContent>}

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
          <p className="ml-5 mt-0.5 text-xs">Set the name (e.g. &quot;ALGT ERP Mail Sender&quot;) and choose &quot;Accounts in this organizational directory only&quot;.</p>
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
          <span className="font-medium text-foreground">Save the provider, then protect its credential</span>
          <p className="ml-5 mt-1 text-xs">Create or edit the provider with its Tenant ID, Client ID and approved sender mailbox. Keep it disabled during setup. A user with separate credential-management permission can then choose &quot;Update Secret&quot; and enter the secret value. It is stored securely in the server vault; do not enter an environment-variable name in that field.</p>
        </li>
        <li>
          <span className="font-medium text-foreground">Limit the sender to approved mailboxes</span>
          <p className="ml-5 mt-1 text-xs">Your Microsoft 365 administrator must restrict this application to the intended sending mailbox. Never put secrets in notes, chat, screenshots or audit records. Existing approved server-managed credentials are a separate deployment configuration, not a value to paste into the secret dialog.</p>
        </li>
        <li>
          <span className="font-medium text-foreground">Test the connection</span>
          <p className="ml-5 mt-1 text-xs">&quot;Test Connection&quot; checks authentication and mailbox access without sending mail. An explicitly authorized test email checks provider submission; acceptance is not proof of inbox delivery. Confirm receipt with the intended test recipient. If submission is unconfirmed, investigate before retrying to avoid duplicates.</p>
        </li>
        <li>
          <span className="font-medium text-foreground">Approve delivery limits and activation separately</span>
          <p className="ml-5 mt-1 text-xs">Select exactly one enabled, active default. Agree the per-minute and daily attempt limits before activating automated delivery, including capacity used by password emails, manual exports and connection-test emails outside the queue. Configuration or a feature flag alone does not prove that the backend worker is deployed and ready.</p>
        </li>
      </ol>

      <div className="rounded-md bg-muted/20 border border-border p-3 text-xs">
        <p className="font-medium">Automatic delivery has a separate release gate</p>
        <p className="text-muted-foreground mt-1">
          F06 governs provider settings. F09 governs queued email, scheduling and controlled retries.
          Queued limits count dispatch attempts in rolling windows, not recipients or confirmed deliveries.
          Deploy and verify the matching worker and approved limits under the controlled release plan;
          do not assume that saving these settings activates automated delivery.
        </p>
      </div>
    </div>
  );
}
