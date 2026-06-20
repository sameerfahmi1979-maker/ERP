import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrRelationshipTypes, createHrRelationshipType, updateHrRelationshipType, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrRelationshipTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasPermission(ctx, "hr.settings.manage") || hasPermission(ctx, "hr.admin");
  const result = await listHrRelationshipTypes({});
  const data = result.data?.data ?? [];

  async function toggle(id: number, is_active: boolean) {
    "use server";
    return toggleHrSettingsRowActive("hr_relationship_types", id, is_active);
  }

  return (
    <HrSettingsLookupPage
      title="Relationship Types"
      description="Emergency contact relationship types: spouse, parent, sibling, friend, etc."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Relationship Types" }]}
      initialData={data}
      canManage={canManage}
      onList={listHrRelationshipTypes}
      onCreate={createHrRelationshipType}
      onUpdate={updateHrRelationshipType}
      onToggle={toggle}
    />
  );
}
