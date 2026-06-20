import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrGrades, createHrGrade, updateHrGrade, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrGradesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasPermission(ctx, "hr.settings.manage") || hasPermission(ctx, "hr.admin");
  const result = await listHrGrades({});
  const data = result.data?.data ?? [];

  async function create(input: { code: string; name_en: string; name_ar?: string | null; description?: string | null; is_active: boolean; sort_order: number }) {
    "use server";
    return createHrGrade({ ...input, grade_level: null });
  }

  async function toggle(id: number, is_active: boolean) {
    "use server";
    return toggleHrSettingsRowActive("hr_grades", id, is_active);
  }

  return (
    <HrSettingsLookupPage
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
