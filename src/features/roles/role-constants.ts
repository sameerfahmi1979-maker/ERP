export const ROLE_CATEGORIES = [
  "Admin",
  "Operational",
  "Finance",
  "HR",
  "DMS",
  "Technical",
  "Read Only",
  "Other",
] as const;

export const ROLE_LEVELS = [
  "Global",
  "Executive",
  "Manager",
  "Supervisor",
  "Staff",
  "Self Service",
  "Read Only",
] as const;

export type RoleCategory = (typeof ROLE_CATEGORIES)[number];
export type RoleLevel = (typeof ROLE_LEVELS)[number];
