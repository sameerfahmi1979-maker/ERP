import { getAuthContext, hasPermission, hasPermissionInScope } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { OrganizationWorkspaceForm } from "@/features/organizations/organization-workspace-form";
import { getOrganizationById } from "@/server/actions/organizations";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export default async function OrganizationRecordPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { mode: modeParam } = await searchParams;
  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "organizations.view")) {
    redirect("/admin/organizations");
  }

  const numericId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(numericId)) notFound();

  const result = await getOrganizationById(numericId);
  if (!result.success) {
    if (result.errorCode === "not_found" || result.errorCode === "invalid") notFound();
    if (result.errorCode === "denied") redirect("/admin/organizations");
    throw new Error("The organization could not be loaded. Try again.");
  }
  if (!result.data) throw new Error("The organization could not be loaded. Try again.");

  const mode = modeParam === "edit" && hasPermissionInScope(authContext, "organizations.manage", result.data.id) ? "edit" : "view";

  return <OrganizationWorkspaceForm organization={result.data} mode={mode} authContext={authContext} />;
}
