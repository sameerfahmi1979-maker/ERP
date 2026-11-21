import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/rbac/check";
import { canViewAppBranding, canManageAppBranding, canUploadBrandingAssets } from "@/lib/branding/asset-permissions";
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

  const canView = canViewAppBranding(ctx);

  if (!canView) redirect("/access-denied");

  const canManage = canManageAppBranding(ctx);
  const canUpload = canUploadBrandingAssets(ctx) && canManage;

  const [settingsResult, runtimeBranding] = await Promise.all([
    getActiveAppBrandingSettings(),
    loadRuntimeAppBranding(),
  ]);

  if (settingsResult.state !== "configured") {
    return (
      <div className="p-6 space-y-6">
        <ERPPageHeader title="App Branding" description="Configure your application identity and assets." />
        {settingsResult.state === "unavailable" ? <LoadError title="App branding settings" retryHref="/admin/settings/branding" /> :
          <section role="status" className="space-y-2 rounded-md border bg-card p-5">
            <h2 className="font-semibold">{settingsResult.state === "inactive" ? "App branding is inactive" : "App branding setup required"}</h2>
            <p className="text-sm text-muted-foreground">The ERP uses its built-in branding. An administrator can review the default branding configuration.</p>
          </section>}
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
