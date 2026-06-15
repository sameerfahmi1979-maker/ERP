import { Metadata } from "next";
import { getAiProviderConfigs, getAiFeatureFlags, getAiUsageLogs } from "@/server/actions/settings/ai-settings";
import { AiSettingsPageClient } from "@/features/settings/ai/ai-settings-page-client";

export const metadata: Metadata = {
  title: "AI Settings | ERP Admin",
  description: "Configure ERP-wide AI providers, OCR providers, models, confidence thresholds, and secure API access.",
};

export default async function AiSettingsPage() {
  const [configsResult, flagsResult, logsResult] = await Promise.all([
    getAiProviderConfigs(),
    getAiFeatureFlags(),
    getAiUsageLogs(50),
  ]);

  const configs = configsResult.success ? (configsResult.data ?? []) : [];
  const featureFlags = flagsResult.success ? (flagsResult.data ?? []) : [];
  const usageLogs = logsResult.success ? (logsResult.data ?? []) : [];

  return (
    <div className="flex flex-col gap-6 p-8">
      <AiSettingsPageClient
        configs={configs}
        featureFlags={featureFlags}
        usageLogs={usageLogs}
      />
    </div>
  );
}
