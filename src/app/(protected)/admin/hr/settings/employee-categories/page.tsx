import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrEmployeeCategories, createHrEmployeeCategory, updateHrEmployeeCategory, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrEmployeeCategoriesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasGlobalPermission(ctx, "hr.settings.manage") || hasGlobalPermission(ctx, "hr.admin");
const result = await listHrEmployeeCategories({complete:true});
  if (!result.success) return <LoadError title="HR records" retryHref="/admin/hr/settings/employee-categories" />;
  const data = result.data?.data ?? [];

  async function toggle(id: number, is_active: boolean, contract?: WorkspaceSaveContract) {
    "use server";
    return toggleHrSettingsRowActive("hr_employee_categories", id, is_active, contract);
  }

  return (
    <HrSettingsLookupPage
      entity="hr_employee_categories"
      principalId={ctx.profile?.id}
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
