import type {HrLookupFormInput} from "@/lib/hr/settings-save-contract";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrTrainingTypes, createHrTrainingType, updateHrTrainingType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrTrainingTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasGlobalPermission(ctx, "hr.settings.manage") || hasGlobalPermission(ctx, "hr.admin");
const result = await listHrTrainingTypes({complete:true});
  if (!result.success) return <LoadError title="HR records" retryHref="/admin/hr/settings/training-types" />;
  const data = result.data?.data ?? [];

  async function create(input: HrLookupFormInput, contract?: WorkspaceSaveContract) {
    "use server";
    return createHrTrainingType({
      default_expiry_alert_days: 60,
      requires_certificate_number: true,
      requires_provider: false,
      is_site_required: false,
      is_designation_required: false,
      ...input,
    }, contract);
  }

  async function toggle(id: number, is_active: boolean, contract?: WorkspaceSaveContract) {
    "use server";
    return toggleHrSettingsRowActive("hr_training_types", id, is_active, contract);
  }

  return (
    <HrSettingsLookupPage
      entity="hr_training_types"
      principalId={ctx.profile?.id}
      title="Training Types"
      description="Specific training certifications: BOSIET, H2S, first aid, crane operation, etc."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Training Types" }]}
      initialData={data}
      canManage={canManage}
      onList={listHrTrainingTypes}
      onCreate={create}
      onUpdate={updateHrTrainingType}
      onToggle={toggle}
    />
  );
}
