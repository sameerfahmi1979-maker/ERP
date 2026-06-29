import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { RoleWorkspaceForm } from "@/features/roles/role-workspace-form";
import { getRoleById } from "@/server/actions/roles";

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

  const result = await getRoleById(numericId);
  if (!result.success || !result.data) notFound();

  const mode = modeParam === "edit" && hasPermission(authContext, "roles.manage") ? "edit" : "view";

  return <RoleWorkspaceForm role={result.data} mode={mode} authContext={authContext} />;
}
