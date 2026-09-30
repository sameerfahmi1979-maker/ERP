import type { AuthContext } from "@/lib/rbac/check";
import { canUseApplication, hasGlobalPermission, hasPermissionInScope } from "@/lib/rbac/scope";
export class DeliveryPolicyError extends Error {
    constructor() { super("Delivery is not authorized or its source is no longer available."); }
}
export function requireQueuePermission(actor: AuthContext, action: "view" | "manage" | "process") {
    // This queue has no trusted company/branch column. A scoped capability is not
    // global queue administration. Source-specific delivery has its own adapter.
    if (!canUseApplication(actor) || !(hasGlobalPermission(actor, "notifications.email_queue." + action)
        || hasGlobalPermission(actor, "notifications.admin")))
        throw new DeliveryPolicyError();
}
export function requireReportDelivery(actor: AuthContext, companyId: number | null) {
    for (const code of ["reports.run", "reports.export", "reports.email"]) {
        if (!(companyId === null ? hasGlobalPermission(actor, code) : hasPermissionInScope(actor, code, companyId)))
            throw new DeliveryPolicyError();
    }
}
