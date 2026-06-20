import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrMedicalRecordTypes, createHrMedicalRecordType, updateHrMedicalRecordType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrMedicalRecordTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasPermission(ctx, "hr.settings.manage") || hasPermission(ctx, "hr.admin");
  const result = await listHrMedicalRecordTypes({});
  const data = result.data?.data ?? [];

  async function create(input: { code: string; name_en: string; name_ar?: string | null; description?: string | null; is_active: boolean; sort_order: number }) {
    "use server";
    return createHrMedicalRecordType({
      ...input,
      default_expiry_alert_days: 60,
      is_confidential: true,
      requires_dms_document: true,
    });
  }

  async function toggle(id: number, is_active: boolean) {
    "use server";
    return toggleHrSettingsRowActive("hr_medical_record_types", id, is_active);
  }

  return (
    <HrSettingsLookupPage
      title="Medical Record Types"
      description="Types of medical records: fitness certificate, pre-employment medical, etc."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Medical Record Types" }]}
      initialData={data}
      canManage={canManage}
      onList={listHrMedicalRecordTypes}
      onCreate={create}
      onUpdate={updateHrMedicalRecordType}
      onToggle={toggle}
    />
  );
}
