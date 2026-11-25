import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasGlobalPermission, hasPermission } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { RoleWorkspaceForm } from "@/features/roles/role-workspace-form";
import { getRoleById } from "@/server/queries/roles";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export default async function RoleRecordPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { mode: modeParam } = await searchParams;
  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "roles.view")) {
    redirect("/admin/roles");
  }

  const numericId = parseInt(id);
  if (isNaN(numericId)) notFound();

  const mode = modeParam === "edit" && hasGlobalPermission(authContext, "roles.manage") ? "edit" : "view";
  const retryHref = `/admin/roles/record/${numericId}${mode === "edit" ? "?mode=edit" : ""}`;
  const role = await getRoleById(numericId, authContext).catch(() => undefined);
  if (role === undefined) return <LoadError title="Role" retryHref={retryHref} />;
  if (role === null) notFound();

  return <RoleWorkspaceForm role={role} mode={mode} authContext={authContext} />;
}
