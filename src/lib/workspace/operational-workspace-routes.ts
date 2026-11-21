import type { WorkspaceRouteConfig } from "./workspace-route-registry";

const lists = [
  ["/modules/fleet", "Fleet Management", "FLEET"],
  ["/modules/fleet/operations", "Dispatch, Trips & Rentals", "FLEET"],
  ["/modules/fleet/time", "Fleet Time", "FLEET"],
  ["/modules/fleet/fines", "Fines and Incidents", "FLEET"],
  ["/modules/fleet/allowance-rates", "Trip Allowance Rates", "FLEET"],
  ["/modules/fleet/allowances", "Trip Allowances", "FLEET"],
  ["/modules/fleet/fuel", "Manual Fuel", "FLEET"],
  ["/modules/workshop", "Workshop", "WORKSHOP"],
  ["/modules/workshop/job-work", "Workshop Job Work", "WORKSHOP"],
  ["/modules/inventory", "Inventory", "INVENTORY"],
  ["/modules/procurement", "Procurement", "PROCUREMENT"],
] as const;

const records = [
  ["/modules/fleet", "Fleet Asset", "FLEET", "fleet_asset"],
  ["/modules/fleet/operations", "Fleet Operation", "FLEET", "fleet_operation"],
  ["/modules/workshop/job-work", "Workshop Job Card", "WORKSHOP", "workshop_job"],
] as const;

const operationalLists = lists.map(([route, title, moduleCode]) => ({
  route, title, moduleCode, tabKind: "list", singleton: true,
} satisfies WorkspaceRouteConfig));

const operationalRecords = records.map(([accessPath, title, moduleCode, entityType]) => ({
  accessPath,
  route: accessPath + "/[id]",
  title,
  moduleCode,
  entityType,
  tabKind: "record",
  singleton: false,
  pattern: new RegExp("^" + accessPath + "/[1-9][0-9]{0,15}$"),
} satisfies WorkspaceRouteConfig & { accessPath: string }));

export const operationalWorkspaceRoutes: WorkspaceRouteConfig[] = [...operationalLists, ...operationalRecords];

/** Resolves implemented operational screens to the owning workspace's capability gate. */
export function getOperationalAccessPath(pathname: string): string | undefined {
  return operationalLists.find(entry => entry.route === pathname)?.route
    ?? operationalRecords.find(entry => entry.pattern.test(pathname))?.accessPath;
}
