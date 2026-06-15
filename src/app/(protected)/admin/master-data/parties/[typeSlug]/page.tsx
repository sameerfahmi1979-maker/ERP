export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { getPartiesByTypeCode } from "@/server/actions/master-data/parties";
import { PartiesTable } from "@/features/master-data/parties/parties-table";

// Slug → type code mapping
const SLUG_TYPE_MAP: Record<string, { typeCode: string; title: string }> = {
  customers: { typeCode: "CUSTOMER", title: "Customers" },
  vendors: { typeCode: "VENDOR", title: "Vendors" },
  subcontractors: { typeCode: "SUBCONTRACTOR", title: "Subcontractors" },
  consultants: { typeCode: "CONSULTANT", title: "Consultants" },
  "recruitment-agencies": { typeCode: "RECRUITMENT_AGENCY", title: "Recruitment Agencies" },
  "government-authorities": { typeCode: "GOVERNMENT_AUTHORITY", title: "Government Authorities" },
  "insurance-companies": { typeCode: "INSURANCE_COMPANY", title: "Insurance Companies" },
  "license-issuers": { typeCode: "LICENSE_ISSUER", title: "License Issuers" },
};

type Props = {
  params: Promise<{ typeSlug: string }>;
};

export default async function FilteredPartiesPage({ params }: Props) {
  const { typeSlug } = await params;
  const mapping = SLUG_TYPE_MAP[typeSlug];
  if (!mapping) notFound();

  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "master_data.parties.view")) {
    redirect("/admin");
  }

  const result = await getPartiesByTypeCode(mapping.typeCode);
  const parties = result.success ? result.data ?? [] : [];

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="mb-6">
        <nav className="text-sm text-muted-foreground mb-2">
          Master Data / Party Master / <span className="text-foreground">{mapping.title}</span>
        </nav>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{mapping.title}</h1>
          <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded border text-muted-foreground">
            Party Type: {mapping.typeCode}
          </span>
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          {parties.length} {mapping.title.toLowerCase()} found
        </p>
      </div>
      <PartiesTable
        parties={parties}
        authContext={ctx}
        defaultTypeCode={mapping.typeCode}
        pageTitle={mapping.title}
      />
    </div>
  );
}
