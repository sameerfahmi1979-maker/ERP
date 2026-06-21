import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrLeaveTypes, createHrLeaveType, updateHrLeaveType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrLeaveTypesSettingsPageClient } from "@/features/hr/settings/hr-leave-types-settings-page-client";

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
    <HrLeaveTypesSettingsPageClient
      initialData={data}
      canManage={canManage}
      onList={listHrLeaveTypes}
      onCreate={create}
      onUpdate={updateHrLeaveType}
      onToggle={toggle}
    />
  );
}
