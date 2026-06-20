import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrPayrollGroups, createHrPayrollGroup, updateHrPayrollGroup, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrPayrollGroupsPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasPermission(ctx, "hr.settings.manage") || hasPermission(ctx, "hr.admin");
  const result = await listHrPayrollGroups({});
  const data = result.data?.data ?? [];

  async function create(input: { code: string; name_en: string; name_ar?: string | null; description?: string | null; is_active: boolean; sort_order: number }) {
    "use server";
    return createHrPayrollGroup({
      ...input,
      pay_frequency: "monthly",
      wps_applicable_default: true,
    });
  }

  async function toggle(id: number, is_active: boolean) {
    "use server";
    return toggleHrSettingsRowActive("hr_payroll_groups", id, is_active);
  }

  return (
    <HrSettingsLookupPage
      title="Payroll Groups"
      description="Payroll payment cycle groups: monthly WPS, weekly, manual, etc."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Payroll Groups" }]}
      initialData={data}
      canManage={canManage}
      onList={listHrPayrollGroups}
      onCreate={create}
      onUpdate={updateHrPayrollGroup}
      onToggle={toggle}
    />
  );
}
