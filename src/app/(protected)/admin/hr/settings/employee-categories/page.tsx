import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrEmployeeCategories, createHrEmployeeCategory, updateHrEmployeeCategory, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrEmployeeCategoriesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasPermission(ctx, "hr.settings.manage") || hasPermission(ctx, "hr.admin");
  const result = await listHrEmployeeCategories({});
  const data = result.data?.data ?? [];

  async function toggle(id: number, is_active: boolean) {
    "use server";
    return toggleHrSettingsRowActive("hr_employee_categories", id, is_active);
  }

  return (
    <HrSettingsLookupPage
      title="Employee Categories"
      description="Classify employees by category: staff, outsourced, PRO, drivers, etc."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Employee Categories" }]}
      initialData={data}
      canManage={canManage}
      onList={listHrEmployeeCategories}
      onCreate={createHrEmployeeCategory}
      onUpdate={updateHrEmployeeCategory}
      onToggle={toggle}
    />
  );
}
