import { redirect, notFound } from "next/navigation";
import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import { getPartyById } from "@/server/actions/master-data/parties";
import { PartyWorkspaceForm } from "@/features/master-data/parties/party-workspace-form";
import { LoadError } from "@/components/erp/load-error";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PartyRecordPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function PartyRecordPage({ params, searchParams }: PartyRecordPageProps) {
  const { id: idStr } = await params;
  const { mode: modeParam } = await searchParams;

  const id = Number(idStr);
  if (!/^[1-9]\d*$/.test(idStr) || !Number.isSafeInteger(id)) {
    notFound();
  }

  const authContext = await getAuthContext();

  if (!hasGlobalPermission(authContext, "master_data.parties.view") && !hasGlobalPermission(authContext, "master_data.party_master.view")) {
    redirect("/access-denied");
  }

  const result = await getPartyById(id);

  if (!result.success && result.kind === 'forbidden') redirect('/access-denied');
  if (!result.success && result.kind === 'not_found') notFound();
  if (!result.success || !result.data) return <LoadError title="Party" retryHref={`/admin/master-data/parties/record/${id}?mode=${modeParam==='edit'?'edit':'view'}`} />;

  // Determine mode: prefer ?mode param, default to "view"
  const canEdit = hasGlobalPermission(authContext, "master_data.parties.edit");
  let mode: "view" | "edit" = "view";
  if (modeParam === "edit" && canEdit) {
    mode = "edit";
  } else if (modeParam === "edit" && !canEdit) {
    mode = "view"; // silently downgrade if no permission
  } else if (modeParam === "view") {
    mode = "view";
  }

  return (
    <div className="h-full">
      <PartyWorkspaceForm party={result.data} mode={mode} authContext={authContext} />
    </div>
  );
}
