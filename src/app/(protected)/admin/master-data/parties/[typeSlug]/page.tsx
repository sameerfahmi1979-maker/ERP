export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { getPartiesByTypeCode } from "@/server/actions/master-data/parties";
import { PartiesTable } from "@/features/master-data/parties/parties-table";
import { ERPPageHeader } from "@/components/erp/page-header";
import { LoadError } from "@/components/erp/load-error";

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
  if (!hasGlobalPermission(ctx, "master_data.parties.view") && !hasGlobalPermission(ctx, "master_data.party_master.view")) {
    redirect("/access-denied");
  }

  const result = await getPartiesByTypeCode(mapping.typeCode);
  if (!result.success && result.kind === 'forbidden') redirect('/access-denied');
  const parties = result.success ? result.data : undefined;

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title={mapping.title}
        description={parties ? `${parties.length} ${mapping.title.toLowerCase()} found` : 'The list is unavailable.'}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Party Master", href: "/admin/master-data/parties" },
          { label: mapping.title },
        ]}
      />
      {!result.success && result.kind === 'not_found' ? <div role="alert" className="rounded-sm border bg-card p-5">
        The party type for {mapping.title} is not configured or available. Ask your administrator to check its configuration.
      </div> : !parties ? <LoadError title={mapping.title} retryHref={`/admin/master-data/parties/${typeSlug}`} /> : <PartiesTable
        parties={parties}
        authContext={ctx}
        defaultTypeCode={mapping.typeCode}
        pageTitle={mapping.title}
      />}
    </div>
  );
}
