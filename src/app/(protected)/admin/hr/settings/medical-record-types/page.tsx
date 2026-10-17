import type {HrLookupFormInput} from "@/lib/hr/settings-save-contract";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrMedicalRecordTypes, createHrMedicalRecordType, updateHrMedicalRecordType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrMedicalRecordTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasGlobalPermission(ctx, "hr.settings.manage") || hasGlobalPermission(ctx, "hr.admin");
const result = await listHrMedicalRecordTypes({complete:true});
  if (!result.success) return <LoadError title="HR records" retryHref="/admin/hr/settings/medical-record-types" />;
  const data = result.data?.data ?? [];

  async function create(input: HrLookupFormInput, contract?: WorkspaceSaveContract) {
    "use server";
    return createHrMedicalRecordType({
      default_expiry_alert_days: 60,
      is_confidential: true,
      requires_dms_document: true,
      ...input,
    }, contract);
  }

  async function toggle(id: number, is_active: boolean, contract?: WorkspaceSaveContract) {
    "use server";
    return toggleHrSettingsRowActive("hr_medical_record_types", id, is_active, contract);
  }

  return (
    <HrSettingsLookupPage
      entity="hr_medical_record_types"
      principalId={ctx.profile?.id}
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
