import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrTrainingCategories, createHrTrainingCategory, updateHrTrainingCategory, toggleHrSettingsRowActive } from "@/server/actions/hr/settings";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";

export default async function HrTrainingCategoriesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const canManage = hasGlobalPermission(ctx, "hr.settings.manage") || hasGlobalPermission(ctx, "hr.admin");
const result = await listHrTrainingCategories({complete:true});
  if (!result.success) return <LoadError title="HR records" retryHref="/admin/hr/settings/training-categories" />;
  const data = result.data?.data ?? [];

  async function toggle(id: number, is_active: boolean, contract?: WorkspaceSaveContract) {
    "use server";
    return toggleHrSettingsRowActive("hr_training_categories", id, is_active, contract);
  }

  return (
    <HrSettingsLookupPage
      entity="hr_training_categories"
      principalId={ctx.profile?.id}
      title="Training Categories"
      description="High-level training groupings: safety, technical, regulatory, leadership, etc."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Training Categories" }]}
      initialData={data}
      canManage={canManage}
      onList={listHrTrainingCategories}
      onCreate={createHrTrainingCategory}
      onUpdate={updateHrTrainingCategory}
      onToggle={toggle}
    />
  );
}
