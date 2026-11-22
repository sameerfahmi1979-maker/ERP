import { HR_SETTINGS_FIRST_PAGE } from "@/lib/hr/settings-list";
import { hrReadIdentity } from "@/lib/reads/hr-read-identity";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrRelationshipTypes, createHrRelationshipType, updateHrRelationshipType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrRelationshipTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasGlobalPermission(ctx, "hr.settings.manage") || hasGlobalPermission(ctx, "hr.admin");
const result = await listHrRelationshipTypes(HR_SETTINGS_FIRST_PAGE);
  if (!result.success || !result.data) return <LoadError title="HR records" retryHref="/admin/hr/settings/relationship-types" />;
  const { data, total } = result.data;

  async function toggle(id: number, is_active: boolean, contract?: WorkspaceSaveContract) {
    "use server";
    return toggleHrSettingsRowActive("hr_relationship_types", id, is_active, contract);
  }

  return (
    <HrSettingsLookupPage
      entity="hr_relationship_types"
      principalId={ctx.profile?.id}
      title="Relationship Types"
      description="Emergency contact relationship types: spouse, parent, sibling, friend, etc."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Relationship Types" }]}
      initialData={data}
      initialTotal={total}
      readIdentity={hrReadIdentity(ctx)}
      canManage={canManage}
      onList={listHrRelationshipTypes}
      onCreate={createHrRelationshipType}
      onUpdate={updateHrRelationshipType}
      onToggle={toggle}
    />
  );
}
