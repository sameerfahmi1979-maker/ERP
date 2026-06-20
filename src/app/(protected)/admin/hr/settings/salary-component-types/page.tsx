import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrSalaryComponentTypes, createHrSalaryComponentType, updateHrSalaryComponentType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrSalaryComponentTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasPermission(ctx, "hr.settings.manage") || hasPermission(ctx, "hr.admin");
  const result = await listHrSalaryComponentTypes({});
  const data = result.data?.data ?? [];

  async function create(input: { code: string; name_en: string; name_ar?: string | null; description?: string | null; is_active: boolean; sort_order: number }) {
    "use server";
    return createHrSalaryComponentType({
      ...input,
      component_kind: "earning",
      is_basic: false,
      is_wps_component: true,
      is_taxable: false,
    });
  }

  async function toggle(id: number, is_active: boolean) {
    "use server";
    return toggleHrSettingsRowActive("hr_salary_component_types", id, is_active);
  }

  return (
    <HrSettingsLookupPage
      title="Salary Component Types"
      description="Salary component classifications: basic salary, housing allowance, deductions, etc."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Salary Component Types" }]}
      initialData={data}
      canManage={canManage}
      onList={listHrSalaryComponentTypes}
      onCreate={create}
      onUpdate={updateHrSalaryComponentType}
      onToggle={toggle}
    />
  );
}
