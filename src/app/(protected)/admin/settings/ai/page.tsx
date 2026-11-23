import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/rbac/check";
import { hasGlobalPermission } from "@/lib/rbac/scope";
import { getAiProviderConfigs, getAiFeatureFlags, getAiUsageLogs } from "@/server/actions/settings/ai-settings";
import { AiSettingsPageClient } from "@/features/settings/ai/ai-settings-page-client";

export const metadata: Metadata = {
  title: "AI Settings | ERP Admin",
  description: "Configure ERP-wide AI providers, OCR providers, models, confidence thresholds, and secure API access.",
};

export default async function AiSettingsPage({ searchParams }: {
  searchParams?: Promise<{ panel?: string | string[] }>;
}) {
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

  const requested = (await searchParams)?.panel;
  const availablePanels = {
    providers: permissions.canViewProviders, flags: permissions.canViewFlags, logs: permissions.canViewUsage, quality: true,
  };
  const activePanel = typeof requested === "string" && Object.hasOwn(availablePanels, requested) && availablePanels[requested as keyof typeof availablePanels]
    ? requested
    : permissions.canViewProviders ? "providers" : permissions.canViewFlags ? "flags" : "logs";

  const [configsResult, flagsResult, logsResult] = await Promise.all([
    permissions.canViewProviders ? getAiProviderConfigs() : Promise.resolve({success:true,data:[]}),
    permissions.canViewFlags ? getAiFeatureFlags() : Promise.resolve({success:true,data:[]}),
    permissions.canViewUsage && activePanel === "logs" ? getAiUsageLogs(50) : Promise.resolve({success:true,data:[]}),
  ]);
  const failedPanels = {
    providers: !configsResult.success || !Array.isArray(configsResult.data),
    flags: !flagsResult.success || !Array.isArray(flagsResult.data),
    logs: !logsResult.success || !Array.isArray(logsResult.data),
  };

  return (
    <div className="p-6 space-y-4">
      <AiSettingsPageClient
        permissions={permissions}
        failedPanels={failedPanels}
        activePanel={activePanel}
        configs={failedPanels.providers ? [] : (configsResult.data ?? [])}
        featureFlags={failedPanels.flags ? [] : (flagsResult.data ?? [])}
        usageLogs={failedPanels.logs ? [] : (logsResult.data ?? [])}
      />
    </div>
  );
}
