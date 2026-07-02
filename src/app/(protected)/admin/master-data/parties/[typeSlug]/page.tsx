export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { getPartiesByTypeCode } from "@/server/actions/master-data/parties";
import { PartiesTable } from "@/features/master-data/parties/parties-table";
import { ERPPageHeader } from "@/components/erp/page-header";

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
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title={mapping.title}
        description={`${parties.length} ${mapping.title.toLowerCase()} found`}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Party Master", href: "/admin/master-data/parties" },
          { label: mapping.title },
        ]}
      />
      <PartiesTable
        parties={parties}
        authContext={ctx}
        defaultTypeCode={mapping.typeCode}
        pageTitle={mapping.title}
      />
    </div>
  );
}
