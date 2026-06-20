import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import {
  listHrMohreEstablishments,
  createHrMohreEstablishment,
  updateHrMohreEstablishment,
} from "@/server/actions/hr/settings";
import { HrMohreEstablishmentsPage } from "@/features/hr/settings/hr-mohre-establishments-page";

export default async function HrMohreEstablishmentsRoute() {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "hr.settings.view") &&
    !hasPermission(ctx, "hr.settings.manage") &&
    !hasPermission(ctx, "hr.admin")
  ) {
    redirect("/admin/hr/settings");
  }

  const canManage = hasPermission(ctx, "hr.settings.manage") || hasPermission(ctx, "hr.admin");
  const result = await listHrMohreEstablishments({});
  const data = result.data?.data ?? [];

  async function create(input: Parameters<typeof createHrMohreEstablishment>[0]) {
    "use server";
    return createHrMohreEstablishment(input);
  }

  async function update(id: number, input: Parameters<typeof updateHrMohreEstablishment>[1]) {
    "use server";
    return updateHrMohreEstablishment(id, input);
  }

  return (
    <HrMohreEstablishmentsPage
      initialData={data}
      canManage={canManage}
      onCreate={create}
      onUpdate={update}
    />
  );
}
