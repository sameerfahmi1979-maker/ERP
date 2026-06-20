// ERP COMMON AI.13 — Dashboard Navigation Links
// Maps dashboard sections to their corresponding ERP routes.

import type { DashboardLink, DashboardSectionCode } from "./types";

const SECTION_LINKS: Record<DashboardSectionCode, DashboardLink> = {
  risk: { label: "View AI Risk", path: "/admin/ai/risk" },
  compliance: { label: "View AI Compliance", path: "/admin/ai/compliance" },
  duplicates: { label: "View AI Duplicates", path: "/admin/ai/duplicates" },
  field_suggestions: { label: "View Field Suggestions", path: "/admin/ai/risk" },
  dms_processing: { label: "View DMS Documents", path: "/dms/documents" },
  assistant_activity: { label: "Open AI Assistant", path: "/assistant" },
  search_activity: { label: "Open AI Search", path: "/search" },
  ai_usage: { label: "View AI Settings", path: "/admin/settings/ai" },
  feature_flags: { label: "View AI Settings", path: "/admin/settings/ai" },
};

export function getDashboardSectionLink(code: DashboardSectionCode): DashboardLink {
  return SECTION_LINKS[code];
}
