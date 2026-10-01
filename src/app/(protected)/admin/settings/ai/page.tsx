import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { LoadError } from "@/components/erp/load-error";
import { getAiProviderConfigs, getAiFeatureFlags, getAiUsageLogs } from "@/server/actions/settings/ai-settings";
import { AiSettingsPageClient } from "@/features/settings/ai/ai-settings-page-client";

export const metadata: Metadata = {
  title: "AI Settings | ERP Admin",
  description: "Configure ERP-wide AI providers, OCR providers, models, confidence thresholds, and secure API access.",
};

export default async function AiSettingsPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "settings.ai.view")) redirect("/access-denied");
  const permissions = {
    canManage: hasPermission(ctx, "settings.ai.manage"),
    canManageSecrets: hasPermission(ctx, "settings.ai.secrets.manage"),
    canTest: hasPermission(ctx, "settings.ai.test"),
    canViewUsage: hasPermission(ctx, "settings.ai.usage.view"),
  };
  const [configsResult, flagsResult, logsResult] = await Promise.all([
    getAiProviderConfigs(),
    getAiFeatureFlags(),
    permissions.canViewUsage ? getAiUsageLogs(50) : Promise.resolve({success:true,data:[]}),
  ]);
  if (!configsResult.success || !flagsResult.success || !logsResult.success) return <LoadError title="AI settings" retryHref="/admin/settings/ai" />;

  const configs = configsResult.success ? (configsResult.data ?? []) : [];
  const featureFlags = flagsResult.success ? (flagsResult.data ?? []) : [];
  const usageLogs = logsResult.success ? (logsResult.data ?? []) : [];

  return (
    <div className="p-6 space-y-4">
      <AiSettingsPageClient
        permissions={permissions}
        configs={configs}
        featureFlags={featureFlags}
        usageLogs={usageLogs}
      />
    </div>
  );
}
