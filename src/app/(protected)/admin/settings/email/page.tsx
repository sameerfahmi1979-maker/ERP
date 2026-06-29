import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import {
  getEmailProviderConfigs,
  getEmailFeatureFlags,
  getEmailSendLogs,
} from "@/server/actions/settings/email-settings";
import { EmailSettingsPageClient } from "@/features/settings/email/email-settings-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Email Settings | ERP Admin",
  description: "Configure ERP-wide email delivery providers for notifications, reports, approvals, and system emails.",
};

export default async function EmailSettingsPage() {
  const ctx = await getAuthContext();

  const canView =
    hasPermission(ctx, "settings.email.view") ||
    hasPermission(ctx, "settings.email.manage");

  if (!canView) redirect("/access-denied");

  const [configsResult, flagsResult, logsResult] = await Promise.all([
    getEmailProviderConfigs(),
    getEmailFeatureFlags(),
    getEmailSendLogs(100),
  ]);

  const configs = configsResult.success ? (configsResult.data ?? []) : [];
  const featureFlags = flagsResult.success ? (flagsResult.data ?? []) : [];
  const sendLogs = logsResult.success ? (logsResult.data ?? []) : [];

  return (
    <div className="flex flex-col gap-6 p-8">
      <EmailSettingsPageClient
        configs={configs}
        featureFlags={featureFlags}
        sendLogs={sendLogs}
      />
    </div>
  );
}
