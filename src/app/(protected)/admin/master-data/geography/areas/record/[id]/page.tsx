import { redirect, notFound } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getAreaById } from "@/features/master-data/geography/actions";
import { AreaWorkspaceForm } from "@/features/master-data/geography/components/area-workspace-form";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }>; }

export default async function AreaRecordPage({ params, searchParams }: Props) {
  const { id: idStr } = await params;
  const { mode: modeParam } = await searchParams;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.geography.view")) redirect("/dashboard");
  const result = await getAreaById(id);
  if (!result.success || !result.data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p className="text-lg font-medium">Area / Zone not found</p>
        <Link href="/admin/master-data/geography/areas" className="text-sm underline text-primary">Back to Areas</Link>
      </div>
    );
  }
  const canEdit = hasPermission(authContext, "master_data.geography.manage");
  const mode: "view" | "edit" = modeParam === "edit" && canEdit ? "edit" : "view";
  return <div className="h-full"><AreaWorkspaceForm area={result.data} mode={mode} authContext={authContext} /></div>;
}
