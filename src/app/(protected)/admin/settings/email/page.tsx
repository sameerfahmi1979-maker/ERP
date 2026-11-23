import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/rbac/check";
import { hasGlobalPermission } from "@/lib/rbac/scope";
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

export default async function EmailSettingsPage({ searchParams }: {
  searchParams?: Promise<{ panel?: string | string[] }>;
}) {
  const ctx = await getAuthContext();

  const canViewProviders = ["settings.email.view","settings.email.manage","settings.email.test","settings.email.secrets.manage"].some(code=>hasGlobalPermission(ctx,code));
  const canViewFlags = ["settings.email.view","settings.email.manage","settings.email.feature_flags.manage"].some(code=>hasGlobalPermission(ctx,code));
  const canViewLogs = ["settings.email.manage","settings.email.logs.view"].some(code=>hasGlobalPermission(ctx,code));
  if (!canViewProviders && !canViewFlags && !canViewLogs) redirect("/access-denied");

  const requested = (await searchParams)?.panel;
  const availablePanels = {
    providers: canViewProviders, flags: canViewFlags, logs: canViewLogs, guide: true,
  };
  const activePanel = typeof requested === "string" && Object.hasOwn(availablePanels, requested) && availablePanels[requested as keyof typeof availablePanels]
    ? requested
    : canViewProviders ? "providers" : canViewFlags ? "flags" : "logs";

  const [configsResult, flagsResult, logsResult] = await Promise.all([
    canViewProviders ? getEmailProviderConfigs() : Promise.resolve({success:true,data:[]}),
    canViewFlags ? getEmailFeatureFlags() : Promise.resolve({success:true,data:[]}),
    canViewLogs && activePanel === "logs" ? getEmailSendLogs(100) : Promise.resolve({success:true,data:[]}),
  ]);
  const failedPanels = {
    providers: !configsResult.success || !Array.isArray(configsResult.data),
    flags: !flagsResult.success || !Array.isArray(flagsResult.data),
    logs: !logsResult.success || !Array.isArray(logsResult.data),
  };

  return (
    <div className="p-6 space-y-4">
      <EmailSettingsPageClient
        configs={failedPanels.providers ? [] : (configsResult.data ?? [])}
        featureFlags={failedPanels.flags ? [] : (flagsResult.data ?? [])}
        sendLogs={failedPanels.logs ? [] : (logsResult.data ?? [])}
        canViewProviders={canViewProviders}
        canViewFlags={canViewFlags}
        canViewLogs={canViewLogs}
        canManage={hasGlobalPermission(ctx, "settings.email.manage")}
        canTest={hasGlobalPermission(ctx, "settings.email.test") || hasGlobalPermission(ctx, "settings.email.manage")}
        canSecrets={hasGlobalPermission(ctx, "settings.email.secrets.manage")}
        canFlags={hasGlobalPermission(ctx, "settings.email.feature_flags.manage") || hasGlobalPermission(ctx, "settings.email.manage")}
        failedPanels={failedPanels}
        activePanel={activePanel}
      />
    </div>
  );
}
