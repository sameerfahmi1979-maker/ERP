import { redirect, notFound } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getPartyById } from "@/server/actions/master-data/parties";
import { PartyWorkspaceForm } from "@/features/master-data/parties/party-workspace-form";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PartyRecordPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function PartyRecordPage({ params, searchParams }: PartyRecordPageProps) {
  const { id: idStr } = await params;
  const { mode: modeParam } = await searchParams;

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    notFound();
  }

  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "master_data.parties.view")) {
    redirect("/admin");
  }

  const result = await getPartyById(id);

  if (!result.success || !result.data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p className="text-lg font-medium">Party not found</p>
        <p className="text-sm">The party with ID {idStr} does not exist or you do not have permission to view it.</p>
        <Link href="/admin/master-data/parties" className="text-sm underline text-primary">
          Back to All Parties
        </Link>
      </div>
    );
  }

  // Determine mode: prefer ?mode param, default to "view"
  const canEdit = hasPermission(authContext, "master_data.parties.manage");
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
