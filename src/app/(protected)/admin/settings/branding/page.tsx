import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getActiveAppBrandingSettings } from "@/server/actions/branding/app-settings";
import { loadRuntimeAppBranding } from "@/lib/branding/load-runtime-app-branding";
import { AppBrandingSettingsPageClient } from "@/features/branding/app-branding-settings-page-client";
import { ERPPageHeader } from "@/components/erp/page-header";
import { LoadError } from "@/components/erp/load-error";

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
      <div className="p-6 space-y-6">
        <ERPPageHeader title="App Branding" description="Configure your application identity and assets." />
        <LoadError title="App branding settings" retryHref="/admin/settings/branding" />
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
