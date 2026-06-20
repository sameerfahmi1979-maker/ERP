import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrIdentityDocumentTypes, createHrIdentityDocumentType, updateHrIdentityDocumentType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrIdentityDocumentTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasPermission(ctx, "hr.settings.manage") || hasPermission(ctx, "hr.admin");
  const result = await listHrIdentityDocumentTypes({});
  const data = result.data?.data ?? [];

  async function create(input: { code: string; name_en: string; name_ar?: string | null; description?: string | null; is_active: boolean; sort_order: number }) {
    "use server";
    return createHrIdentityDocumentType({
      ...input,
      requires_issue_date: true,
      requires_expiry_date: true,
      requires_document_number: true,
      default_expiry_alert_days: 60,
      is_government_document: true,
      is_sensitive: true,
    });
  }

  async function toggle(id: number, is_active: boolean) {
    "use server";
    return toggleHrSettingsRowActive("hr_identity_document_types", id, is_active);
  }

  return (
    <HrSettingsLookupPage
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
