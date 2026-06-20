import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrProProcessTypes, createHrProProcessType, updateHrProProcessType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrProProcessTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasPermission(ctx, "hr.settings.manage") || hasPermission(ctx, "hr.admin");
  const result = await listHrProProcessTypes({});
  const data = result.data?.data ?? [];

  async function create(input: { code: string; name_en: string; name_ar?: string | null; description?: string | null; is_active: boolean; sort_order: number }) {
    "use server";
    return createHrProProcessType({
      ...input,
      default_expiry_alert_days: 60,
      requires_dms_document: false,
    });
  }

  async function toggle(id: number, is_active: boolean) {
    "use server";
    return toggleHrSettingsRowActive("hr_pro_process_types", id, is_active);
  }

  return (
    <HrSettingsLookupPage
      title="PRO Process Types"
      description="Government PRO process types: visa issuance, labour card renewal, permit applications, etc."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "PRO Process Types" }]}
      initialData={data}
      canManage={canManage}
      onList={listHrProProcessTypes}
      onCreate={create}
      onUpdate={updateHrProProcessType}
      onToggle={toggle}
    />
  );
}
