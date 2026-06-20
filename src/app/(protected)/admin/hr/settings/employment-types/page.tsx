import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrEmploymentTypes, createHrEmploymentType, updateHrEmploymentType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrEmploymentTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasPermission(ctx, "hr.settings.manage") || hasPermission(ctx, "hr.admin");
  const result = await listHrEmploymentTypes({});
  const data = result.data?.data ?? [];

  async function toggle(id: number, is_active: boolean) {
    "use server";
    return toggleHrSettingsRowActive("hr_employment_types", id, is_active);
  }

  return (
    <HrSettingsLookupPage
      title="Employment Types"
      description="Types of employment: full-time, part-time, contract, temporary, etc."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Employment Types" }]}
      initialData={data}
      canManage={canManage}
      onList={listHrEmploymentTypes}
      onCreate={createHrEmploymentType}
      onUpdate={updateHrEmploymentType}
      onToggle={toggle}
    />
  );
}
