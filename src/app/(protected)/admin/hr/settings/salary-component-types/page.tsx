import type {HrLookupFormInput} from "@/lib/hr/settings-save-contract";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrSalaryComponentTypes, createHrSalaryComponentType, updateHrSalaryComponentType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrSalaryComponentTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasGlobalPermission(ctx, "hr.settings.manage") || hasGlobalPermission(ctx, "hr.admin");
const result = await listHrSalaryComponentTypes({complete:true});
  if (!result.success) return <LoadError title="HR records" retryHref="/admin/hr/settings/salary-component-types" />;
  const data = result.data?.data ?? [];

  async function create(input: HrLookupFormInput, contract?: WorkspaceSaveContract) {
    "use server";
    return createHrSalaryComponentType({
      component_kind: "earning",
      is_basic: false,
      is_wps_component: true,
      is_taxable: false,
      ...input,
    }, contract);
  }

  async function toggle(id: number, is_active: boolean, contract?: WorkspaceSaveContract) {
    "use server";
    return toggleHrSettingsRowActive("hr_salary_component_types", id, is_active, contract);
  }

  return (
    <HrSettingsLookupPage
      entity="hr_salary_component_types"
      principalId={ctx.profile?.id}
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
