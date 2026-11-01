/**
 * ERP COMMON AI.7 — Entity Route Builder
 *
 * Maps known entity types to their ERP record routes.
 * Returns null if entity type is unknown.
 */

const ENTITY_ROUTE_MAP: Record<string, (id: number) => string> = {
  company: (id) => `/admin/organizations/record/${id}`,
  organization: (id) => `/admin/organizations/record/${id}`,
  party: (id) => `/admin/master-data/parties/record/${id}`,
  branch: (id) => `/admin/branches/record/${id}`,
  site: (id) => `/admin/common-master-data/work-sites/record/${id}`,
  work_site: (id) => `/admin/common-master-data/work-sites/record/${id}`,
  dms_document: (id) => `/dms/documents/record/${id}`,
  document: (id) => `/dms/documents/record/${id}`,
  employee: (id) => `/admin/hr/employees/record/${id}`,
};

export function buildEntityRoute(entityType: string, entityId: number): string | null {
  if (!Number.isSafeInteger(entityId) || entityId <= 0) return null;
  if (!Object.hasOwn(ENTITY_ROUTE_MAP, entityType.toLowerCase())) return null;
  const builder = ENTITY_ROUTE_MAP[entityType.toLowerCase()];
  return builder ? builder(entityId) : null;
}
