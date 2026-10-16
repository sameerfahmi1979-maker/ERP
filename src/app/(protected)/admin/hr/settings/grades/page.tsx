import type {HrLookupFormInput} from "@/lib/hr/settings-save-contract";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrGrades, createHrGrade, updateHrGrade, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrGradesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasGlobalPermission(ctx, "hr.settings.manage") || hasGlobalPermission(ctx, "hr.admin");
const result = await listHrGrades({complete:true});
  if (!result.success) return <LoadError title="HR records" retryHref="/admin/hr/settings/grades" />;
  const data = result.data?.data ?? [];

  async function create(input: HrLookupFormInput, contract?: WorkspaceSaveContract) {
    "use server";
    return createHrGrade({ grade_level: null, ...input }, contract);
  }

  async function toggle(id: number, is_active: boolean, contract?: WorkspaceSaveContract) {
    "use server";
    return toggleHrSettingsRowActive("hr_grades", id, is_active, contract);
  }

  return (
    <HrSettingsLookupPage
      entity="hr_grades"
      principalId={ctx.profile?.id}
      title="Grades"
      description="Employee salary grades and job levels (G1–G15 or custom)"
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Grades" }]}
      initialData={data}
      canManage={canManage}
      onList={listHrGrades}
      onCreate={create}
      onUpdate={updateHrGrade}
      onToggle={toggle}
    />
  );
}
