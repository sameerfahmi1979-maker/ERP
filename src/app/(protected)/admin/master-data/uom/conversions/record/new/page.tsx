import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ConversionWorkspaceForm } from "@/features/master-data/uom/components/conversion-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function UomConversionNewPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.uom.view")) redirect("/dashboard");
  if (!hasPermission(authContext, "master_data.uom.manage")) redirect("/admin/master-data/uom/conversions");
  return (
    <div className="h-full">
      <ConversionWorkspaceForm mode="add" authContext={authContext} />
    </div>
  );
}
