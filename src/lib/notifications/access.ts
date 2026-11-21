import type { AuthContext } from "@/lib/rbac/check";
import { hasGlobalPermission, hasPermission } from "@/lib/rbac/scope";

export const notificationDeliveryLogViewPermissions = ["notifications.logs.view", "notifications.admin"] as const;
export const notificationTemplateViewPermissions = ["notifications.templates.view", "notifications.admin"] as const;
export const dmsNotificationSettingManagePermissions = ["dms.admin", "dms.notifications.manage", "dms.notifications.settings.manage"] as const;
const dmsNotificationManagePermissions = ["dms.notifications.manage", "dms.admin"] as const;
export const dmsNotificationViewPermissions = ["dms.notifications.view", ...dmsNotificationManagePermissions] as const;

export function canViewNotificationDeliveryLogs(ctx: AuthContext) {
  return notificationDeliveryLogViewPermissions.some(code => hasGlobalPermission(ctx, code));
}

export function canViewNotificationTemplates(ctx: AuthContext) {
  return notificationTemplateViewPermissions.some(code => hasGlobalPermission(ctx, code));
}

export function canManageNotificationTemplates(ctx: AuthContext) {
  return hasGlobalPermission(ctx, "notifications.admin") ||
    (hasGlobalPermission(ctx, "notifications.templates.view") && hasGlobalPermission(ctx, "notifications.templates.manage"));
}

export function canManageDmsNotificationSettings(ctx: AuthContext) {
  return dmsNotificationSettingManagePermissions.some(code => hasGlobalPermission(ctx, code));
}

export function canViewDmsNotificationSettings(ctx: AuthContext) {
  return canManageDmsNotificationSettings(ctx) || hasGlobalPermission(ctx, "dms.notifications.view");
}

export function canManageDmsNotifications(ctx: AuthContext) {
  return dmsNotificationManagePermissions.some(code => hasPermission(ctx, code));
}

export function canViewDmsNotifications(ctx: AuthContext) {
  return dmsNotificationViewPermissions.some(code => hasPermission(ctx, code));
}
