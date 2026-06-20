import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrLeaveTypes, createHrLeaveType, updateHrLeaveType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrLeaveTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasPermission(ctx, "hr.settings.manage") || hasPermission(ctx, "hr.admin");
  const result = await listHrLeaveTypes({});
  const data = result.data?.data ?? [];

  async function create(input: { code: string; name_en: string; name_ar?: string | null; description?: string | null; is_active: boolean; sort_order: number }) {
    "use server";
    return createHrLeaveType({
      ...input,
      is_paid: true,
      requires_document: false,
      requires_approval: true,
      reset_basis: "joining_anniversary",
      allow_half_day: true,
    });
  }

  async function toggle(id: number, is_active: boolean) {
    "use server";
    return toggleHrSettingsRowActive("hr_leave_types", id, is_active);
  }

  return (
    <HrSettingsLookupPage
      title="Leave Types"
      description="Types of employee leave: annual, sick, emergency, maternity, paternity, etc."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Leave Types" }]}
      initialData={data}
      canManage={canManage}
      onList={listHrLeaveTypes}
      onCreate={create}
      onUpdate={updateHrLeaveType}
      onToggle={toggle}
    />
  );
}
