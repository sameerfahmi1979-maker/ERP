export const PERMISSIONS = {
  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",
  ROLES_VIEW: "roles.view",
  ROLES_MANAGE: "roles.manage",
  PERMISSIONS_VIEW: "permissions.view",
  PERMISSIONS_MANAGE: "permissions.manage",
  ORGANIZATIONS_VIEW: "organizations.view",
  ORGANIZATIONS_MANAGE: "organizations.manage",
  BRANCHES_VIEW: "branches.view",
  BRANCHES_MANAGE: "branches.manage",
  AUDIT_VIEW: "audit.view",
  DASHBOARD_VIEW: "dashboard.view",
  ERP_ADMIN: "erp.admin",
  SETTINGS_VIEW: "settings.view",
  SETTINGS_MANAGE: "settings.manage",
} as const;

export type PermissionCode =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLES = {
  SYSTEM_ADMIN: "system_admin",
  GROUP_ADMIN: "group_admin",
  COMPANY_ADMIN: "company_admin",
  BRANCH_ADMIN: "branch_admin",
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];
