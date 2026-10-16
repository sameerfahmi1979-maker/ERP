import type {HrLookupFormInput} from "@/lib/hr/settings-save-contract";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrIdentityDocumentTypes, createHrIdentityDocumentType, updateHrIdentityDocumentType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrIdentityDocumentTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasGlobalPermission(ctx, "hr.settings.manage") || hasGlobalPermission(ctx, "hr.admin");
const result = await listHrIdentityDocumentTypes({complete:true});
  if (!result.success) return <LoadError title="HR records" retryHref="/admin/hr/settings/identity-document-types" />;
  const data = result.data?.data ?? [];

  async function create(input: HrLookupFormInput, contract?: WorkspaceSaveContract) {
    "use server";
    return createHrIdentityDocumentType({
      requires_issue_date: true,
      requires_expiry_date: true,
      requires_document_number: true,
      default_expiry_alert_days: 60,
      is_government_document: true,
      is_sensitive: true,
      ...input,
    }, contract);
  }

  async function toggle(id: number, is_active: boolean, contract?: WorkspaceSaveContract) {
    "use server";
    return toggleHrSettingsRowActive("hr_identity_document_types", id, is_active, contract);
  }

  return (
    <HrSettingsLookupPage
      entity="hr_identity_document_types"
      principalId={ctx.profile?.id}
      title="Identity Document Types"
      description="Types of identity documents: passport, Emirates ID, visa, labour card, etc."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Identity Document Types" }]}
      initialData={data}
      canManage={canManage}
      onList={listHrIdentityDocumentTypes}
      onCreate={create}
      onUpdate={updateHrIdentityDocumentType}
      onToggle={toggle}
    />
  );
}
