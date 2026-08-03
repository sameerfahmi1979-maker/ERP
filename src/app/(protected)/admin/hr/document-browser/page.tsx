import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getHrDocBrowserEmployees } from "@/server/actions/hr/doc-browser";
import { HrDocBrowserPageClient } from "@/features/hr/document-browser/hr-doc-browser-page-client";
import { ERPPageHeader } from "@/components/erp/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * HR.DOC_BROWSER.1 — Employee Document Browser
 *
 * 3-column file-explorer view over employee + dependent documents.
 * Pattern: .cursor/rules/erp-document-browser-standard.mdc
 */
export default async function HrDocumentBrowserPage() {
  const authContext = await getAuthContext();

  const canHr =
    hasPermission(authContext, "hr.employees.view") ||
    authContext.roleCodes?.includes("system_admin");
  const canDms =
    hasPermission(authContext, "dms.documents.view") ||
    hasPermission(authContext, "dms.admin") ||
    authContext.roleCodes?.includes("system_admin");

  if (!canHr || !canDms) {
    redirect("/access-denied");
  }

  const result = await getHrDocBrowserEmployees();
  const employees = result.success && result.data ? result.data : [];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Document Browser"
        description="Browse employee and dependent documents in one place — select a person, pick a document, preview it instantly."
        breadcrumbs={[{ label: "HR", href: "/admin/hr" }, { label: "Document Browser" }]}
      />

      <HrDocBrowserPageClient employees={employees} />
    </div>
  );
}
