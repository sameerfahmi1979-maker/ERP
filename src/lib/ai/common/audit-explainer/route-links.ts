// ERP COMMON AI.14 — Safe Navigation Links
// Maps entity types to their ERP routes.

export function buildEntityRoute(entityType: string, entityId?: number): string | null {
  const id = entityId ?? 0;
  switch (entityType.toLowerCase()) {
    case "organization":
    case "owner_company":
    case "company":
      return `/admin/organizations/record/${id}`;
    case "branch":
      return `/admin/branches/record/${id}`;
    case "party":
      return `/admin/master-data/parties/record/${id}`;
    case "work_site":
    case "site":
      return `/admin/common-master-data/work-sites/record/${id}`;
    case "dms_document":
    case "document":
      return `/dms/documents/record/${id}`;
    default:
      return null;
  }
}

export const AI_REVIEW_LINKS = {
  risk: { label: "AI Risk", href: "/admin/ai/risk" },
  compliance: { label: "AI Compliance", href: "/admin/ai/compliance" },
  duplicates: { label: "AI Duplicates", href: "/admin/ai/duplicates" },
  dashboard: { label: "AI Dashboard", href: "/admin/ai/dashboard" },
  auditExplainer: { label: "Audit Explainer", href: "/admin/ai/audit-explainer" },
} as const;
