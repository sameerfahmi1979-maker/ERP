import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrEmploymentTypes, createHrEmploymentType, updateHrEmploymentType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrEmploymentTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasGlobalPermission(ctx, "hr.settings.manage") || hasGlobalPermission(ctx, "hr.admin");
const result = await listHrEmploymentTypes({complete:true});
  if (!result.success) return <LoadError title="HR records" retryHref="/admin/hr/settings/employment-types" />;
  const data = result.data?.data ?? [];

  async function toggle(id: number, is_active: boolean, contract?: WorkspaceSaveContract) {
    "use server";
    return toggleHrSettingsRowActive("hr_employment_types", id, is_active, contract);
  }

  return (
    <HrSettingsLookupPage
      entity="hr_employment_types"
      principalId={ctx.profile?.id}
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
