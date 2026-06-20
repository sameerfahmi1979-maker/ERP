import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrTrainingTypes, createHrTrainingType, updateHrTrainingType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrTrainingTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasPermission(ctx, "hr.settings.manage") || hasPermission(ctx, "hr.admin");
  const result = await listHrTrainingTypes({});
  const data = result.data?.data ?? [];

  async function create(input: { code: string; name_en: string; name_ar?: string | null; description?: string | null; is_active: boolean; sort_order: number }) {
    "use server";
    return createHrTrainingType({
      ...input,
      default_expiry_alert_days: 60,
      requires_certificate_number: true,
      requires_provider: false,
      is_site_required: false,
      is_designation_required: false,
    });
  }

  async function toggle(id: number, is_active: boolean) {
    "use server";
    return toggleHrSettingsRowActive("hr_training_types", id, is_active);
  }

  return (
    <HrSettingsLookupPage
      title="Training Types"
      description="Specific training certifications: BOSIET, H2S, first aid, crane operation, etc."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Training Types" }]}
      initialData={data}
      canManage={canManage}
      onList={listHrTrainingTypes}
      onCreate={create}
      onUpdate={updateHrTrainingType}
      onToggle={toggle}
    />
  );
}
