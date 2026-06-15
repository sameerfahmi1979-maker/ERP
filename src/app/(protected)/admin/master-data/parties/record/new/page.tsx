import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { PartyWorkspaceForm } from "@/features/master-data/parties/party-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Allowed defaultType codes — must match party_types.type_code values in DB.
// BANK is excluded per spec (no "Banks" filtered view with an Add button).
const ALLOWED_DEFAULT_TYPE_CODES = new Set([
  "CUSTOMER",
  "VENDOR",
  "SUBCONTRACTOR",
  "CONSULTANT",
  "RECRUITMENT_AGENCY",
  "GOVERNMENT_AUTHORITY",
  "INSURANCE_COMPANY",
  "LICENSE_ISSUER",
]);

type Props = {
  searchParams: Promise<{ defaultType?: string }>;
};

export default async function PartyNewPage({ searchParams }: Props) {
  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "master_data.parties.view")) {
    redirect("/admin");
  }

  if (!hasPermission(authContext, "master_data.parties.manage")) {
    redirect("/admin/master-data/parties");
  }

  const { defaultType } = await searchParams;

  // Validate — ignore unknown or unsupported codes safely
  const defaultTypeCode =
    defaultType && ALLOWED_DEFAULT_TYPE_CODES.has(defaultType) ? defaultType : undefined;

  return (
    <div className="h-full">
      <PartyWorkspaceForm mode="add" authContext={authContext} defaultTypeCode={defaultTypeCode} />
    </div>
  );
}
