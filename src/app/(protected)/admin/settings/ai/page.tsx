import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/rbac/check";
import { hasGlobalPermission } from "@/lib/rbac/scope";
import { LoadError } from "@/components/erp/load-error";
import { getAiProviderConfigs, getAiFeatureFlags, getAiUsageLogs } from "@/server/actions/settings/ai-settings";
import { AiSettingsPageClient } from "@/features/settings/ai/ai-settings-page-client";

export const metadata: Metadata = {
  title: "AI Settings | ERP Admin",
  description: "Configure ERP-wide AI providers, OCR providers, models, confidence thresholds, and secure API access.",
};

export default async function AiSettingsPage() {
  const ctx = await getAuthContext();
  const permissions = {
    canViewProviders: ["settings.ai.view","settings.ai.manage","settings.ai.test","settings.ai.secrets.manage"].some(code=>hasGlobalPermission(ctx,code)),
    canViewFlags: ["settings.ai.view","settings.ai.manage"].some(code=>hasGlobalPermission(ctx,code)),
    canManage: hasGlobalPermission(ctx, "settings.ai.manage"),
    canManageSecrets: hasGlobalPermission(ctx, "settings.ai.secrets.manage"),
    canTest: hasGlobalPermission(ctx, "settings.ai.test"),
    canViewUsage: hasGlobalPermission(ctx, "settings.ai.usage.view"),
  };
  if (!permissions.canViewProviders && !permissions.canViewFlags && !permissions.canViewUsage) redirect("/access-denied");
  const [configsResult, flagsResult, logsResult] = await Promise.all([
    permissions.canViewProviders ? getAiProviderConfigs() : Promise.resolve({success:true,data:[]}),
    permissions.canViewFlags ? getAiFeatureFlags() : Promise.resolve({success:true,data:[]}),
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
