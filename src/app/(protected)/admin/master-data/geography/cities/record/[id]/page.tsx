import { redirect, notFound } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getCityById } from "@/features/master-data/geography/actions";
import { CityWorkspaceForm } from "@/features/master-data/geography/components/city-workspace-form";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }>; }

export default async function CityRecordPage({ params, searchParams }: Props) {
  const { id: idStr } = await params;
  const { mode: modeParam } = await searchParams;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.geography.view")) redirect("/dashboard");
  const result = await getCityById(id);
  if (!result.success || !result.data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p className="text-lg font-medium">City not found</p>
        <Link href="/admin/master-data/geography/cities" className="text-sm underline text-primary">Back to Cities</Link>
      </div>
    );
  }
  const canEdit = hasPermission(authContext, "master_data.geography.manage");
  const mode: "view" | "edit" = modeParam === "edit" && canEdit ? "edit" : "view";
  return <div className="h-full"><CityWorkspaceForm city={result.data} mode={mode} authContext={authContext} /></div>;
}
