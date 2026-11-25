import { HR_SETTINGS_FIRST_PAGE } from "@/lib/hr/settings-list";
import { hrReadIdentity } from "@/lib/reads/hr-read-identity";
import type {HrLookupFormInput} from "@/lib/hr/settings-save-contract";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrAccessCardTypes, createHrAccessCardType, updateHrAccessCardType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrAccessCardTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasGlobalPermission(ctx, "hr.settings.manage") || hasGlobalPermission(ctx, "hr.admin");
const result = await listHrAccessCardTypes(HR_SETTINGS_FIRST_PAGE);
  if (!result.success || !result.data) return <LoadError title="HR records" retryHref="/admin/hr/settings/access-card-types" />;
  const { data, total } = result.data;

  async function create(input: HrLookupFormInput, contract?: WorkspaceSaveContract) {
    "use server";
    return createHrAccessCardType({
      default_expiry_alert_days: 60,
      scope_type: "configurable",
      requires_work_site: false,
      requires_client_authority: true,
      ...input,
    }, contract);
  }

  async function toggle(id: number, is_active: boolean, contract?: WorkspaceSaveContract) {
    "use server";
    return toggleHrSettingsRowActive("hr_access_card_types", id, is_active, contract);
  }

  return (
    <HrSettingsLookupPage
      entity="hr_access_card_types"
      principalId={ctx.profile?.id}
      title="Access Card Types"
      description="Access card types: CICPA, ADNOC, offshore, client-specific badges, etc."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Access Card Types" }]}
      initialData={data}
      initialTotal={total}
      readIdentity={hrReadIdentity(ctx)}
      canManage={canManage}
      onList={listHrAccessCardTypes}
      onCreate={create}
      onUpdate={updateHrAccessCardType}
      onToggle={toggle}
    />
  );
}
