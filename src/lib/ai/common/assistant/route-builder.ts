/**
 * ERP COMMON AI.7 — Entity Route Builder
 *
 * Maps known entity types to their ERP record routes.
 * Returns null if entity type is unknown.
 */

const ENTITY_ROUTE_MAP: Record<string, (id: number) => string> = {
  company: (id) => `/admin/master-data/organizations/record/${id}`,
  organization: (id) => `/admin/master-data/organizations/record/${id}`,
  party: (id) => `/admin/master-data/parties/record/${id}`,
  branch: (id) => `/admin/master-data/branches/record/${id}`,
  site: (id) => `/admin/master-data/work-sites/record/${id}`,
  work_site: (id) => `/admin/master-data/work-sites/record/${id}`,
  dms_document: (id) => `/admin/dms/documents/record/${id}`,
  document: (id) => `/admin/dms/documents/record/${id}`,
};

export function buildEntityRoute(entityType: string, entityId: number): string | null {
  const builder = ENTITY_ROUTE_MAP[entityType.toLowerCase()];
  return builder ? builder(entityId) : null;
}
