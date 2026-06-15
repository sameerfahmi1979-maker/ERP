import { getAuthContext, hasPermission } from "@/lib/rbac/check";
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

  const numericId = parseInt(id);
  if (isNaN(numericId)) notFound();

  const result = await getOrganizationById(numericId);
  if (!result.success || !result.data) notFound();

  const mode = modeParam === "edit" && hasPermission(authContext, "organizations.edit") ? "edit" : "view";

  return <OrganizationWorkspaceForm organization={result.data} mode={mode} authContext={authContext} />;
}
