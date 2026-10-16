import type {HrLookupFormInput} from "@/lib/hr/settings-save-contract";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrLeaveTypes, createHrLeaveType, updateHrLeaveType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrLeaveTypesSettingsPageClient } from "@/features/hr/settings/hr-leave-types-settings-page-client";

export default async function HrLeaveTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasGlobalPermission(ctx, "hr.settings.manage") || hasGlobalPermission(ctx, "hr.admin");
const result = await listHrLeaveTypes({complete:true});
  if (!result.success) return <LoadError title="HR records" retryHref="/admin/hr/settings/leave-types" />;
  const data = result.data?.data ?? [];

  async function create(input: HrLookupFormInput, contract?: WorkspaceSaveContract) {
    "use server";
    return createHrLeaveType({
      is_paid: true,
      requires_document: false,
      requires_approval: true,
      reset_basis: "joining_anniversary",
      allow_half_day: true,
      ...input,
    }, contract);
  }

  async function toggle(id: number, is_active: boolean, contract?: WorkspaceSaveContract) {
    "use server";
    return toggleHrSettingsRowActive("hr_leave_types", id, is_active, contract);
  }

  return (
    <HrLeaveTypesSettingsPageClient
      entity="hr_leave_types"
      principalId={ctx.profile?.id}
      initialData={data}
      canManage={canManage}
      onList={listHrLeaveTypes}
      onCreate={create}
      onUpdate={updateHrLeaveType}
      onToggle={toggle}
    />
  );
}
