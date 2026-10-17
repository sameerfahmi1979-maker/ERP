import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { readHrDocumentBrowser } from "@/server/reads/hr-document-browser";
import { hrBrowserEmployeesPage, hrDocumentBrowserIdentity } from "@/lib/reads/hr-document-browser-schema";
import { HrDocBrowserPageClient } from "@/features/hr/document-browser/hr-doc-browser-page-client";
import { ERPPageHeader } from "@/components/erp/page-header";
import { LoadError } from "@/components/erp/load-error";

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
    hasPermission(authContext, "hr.employees.view");
  const canDms =
    hasPermission(authContext, "dms.documents.view") ||
    hasPermission(authContext, "dms.admin");

  if (!canHr || !canDms) {
    redirect("/access-denied");
  }

  const result = await readHrDocumentBrowser({operation: "employees"}, authContext);
  if (!result.success) return <LoadError title="Employee document browser" retryHref="/admin/hr/document-browser" />;
  const initial = hrBrowserEmployeesPage.safeParse(result.data);
  if (!initial.success) return <LoadError title="Employee document browser" retryHref="/admin/hr/document-browser" />;

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Document Browser"
        description="Browse employee and dependent documents in one place — select a person, pick a document, preview it instantly."
        breadcrumbs={[{ label: "HR", href: "/admin/hr" }, { label: "Document Browser" }]}
      />

      <HrDocBrowserPageClient authContext={authContext} initialRead={{identity: hrDocumentBrowserIdentity(authContext), data: initial.data}} />
    </div>
  );
}
