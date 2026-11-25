import { HR_SETTINGS_FIRST_PAGE } from "@/lib/hr/settings-list";
import { hrReadIdentity } from "@/lib/reads/hr-read-identity";
import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import {
  listHrMohreEstablishments,
  createHrMohreEstablishment,
  updateHrMohreEstablishment,
  type HrSettingsWorklistParams,
} from "@/server/actions/hr/settings";
import { HrMohreEstablishmentsPage } from "@/features/hr/settings/hr-mohre-establishments-page";
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';

function canOpenSettings(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return ["hr.settings.view", "hr.settings.manage", "hr.admin"].some(permission => hasPermission(ctx, permission));
}

export default async function HrMohreEstablishmentsRoute() {
  const ctx = await getAuthContext();
  if (!canOpenSettings(ctx)) redirect("/admin/hr/settings");

  const canManage = hasGlobalPermission(ctx, "hr.settings.manage") || hasGlobalPermission(ctx, "hr.admin");
  const result = await listHrMohreEstablishments(HR_SETTINGS_FIRST_PAGE);
  if (!result.success || !result.data) return <LoadError title="HR records" retryHref="/admin/hr/settings/mohre-establishments" />;
  const { data, total } = result.data;

  async function list(input: HrSettingsWorklistParams) {
    "use server";
    if (!canOpenSettings(await getAuthContext())) return { success: false, error: "Permission denied" };
    if (!input || !Number.isSafeInteger(input.page_size) || input.page_size! < 1 || input.page_size! > 100) {
      return { success: false, error: "Invalid HR settings page." };
    }
    const { page, page_size, tableSearch, sorting, columnFilters } = input;
    return listHrMohreEstablishments({ page, page_size, tableSearch, sorting, columnFilters });
  }

  async function create(input: Parameters<typeof createHrMohreEstablishment>[0],contract?:WorkspaceSaveContract) {
    "use server";
    return createHrMohreEstablishment(input,contract);
  }

  async function update(id: number, input: Parameters<typeof updateHrMohreEstablishment>[1],contract?:WorkspaceSaveContract) {
    "use server";
    return updateHrMohreEstablishment(id, input,contract);
  }

  return (
    <HrMohreEstablishmentsPage
      principalId={ctx.profile?.id}
      initialData={data}
      initialTotal={total}
      readIdentity={hrReadIdentity(ctx)}
      onList={list}
      canManage={canManage}
      onCreate={create}
      onUpdate={update}
    />
  );
}
