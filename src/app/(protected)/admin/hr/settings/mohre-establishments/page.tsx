import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import {
  listHrMohreEstablishments,
  createHrMohreEstablishment,
  updateHrMohreEstablishment,
} from "@/server/actions/hr/settings";
import { HrMohreEstablishmentsPage } from "@/features/hr/settings/hr-mohre-establishments-page";
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';

export default async function HrMohreEstablishmentsRoute() {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "hr.settings.view") &&
    !hasPermission(ctx, "hr.settings.manage") &&
    !hasPermission(ctx, "hr.admin")
  ) {
    redirect("/admin/hr/settings");
  }

  const canManage = hasGlobalPermission(ctx, "hr.settings.manage") || hasGlobalPermission(ctx, "hr.admin");
const result = await listHrMohreEstablishments({complete:true});
  if (!result.success) return <LoadError title="HR records" retryHref="/admin/hr/settings/mohre-establishments" />;
  const data = result.data?.data ?? [];

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
      canManage={canManage}
      onCreate={create}
      onUpdate={update}
    />
  );
}
