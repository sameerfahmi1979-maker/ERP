import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getActiveAppBrandingSettings } from "@/server/actions/branding/app-settings";
import { loadRuntimeAppBranding } from "@/lib/branding/load-runtime-app-branding";
import { AppBrandingSettingsPageClient } from "@/features/branding/app-branding-settings-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "App Branding | ERP Admin",
  description: "Configure tenant-global ERP app shell branding, logos, favicon, and theme.",
};

export default async function AppBrandingSettingsPage() {
  const ctx = await getAuthContext();

  const canView =
    hasPermission(ctx, "branding.app.view") || hasPermission(ctx, "reports.manage");

  if (!canView) redirect("/access-denied");

  const canManage = hasPermission(ctx, "branding.app.manage");
  const canUpload =
    hasPermission(ctx, "branding.assets.upload") && canManage;

  const [settingsResult, runtimeBranding] = await Promise.all([
    getActiveAppBrandingSettings(),
    loadRuntimeAppBranding(),
  ]);

  if (!settingsResult.success || !settingsResult.data) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">
          {settingsResult.error ?? "Unable to load app branding settings."}
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <AppBrandingSettingsPageClient
        settings={settingsResult.data}
        runtimeBranding={runtimeBranding}
        canManage={canManage}
        canUpload={canUpload}
      />
    </div>
  );
}
