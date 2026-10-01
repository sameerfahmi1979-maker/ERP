import type { AuthContext } from "@/lib/rbac/check";
import { hasGlobalPermission, hasPermissionInScope } from "@/lib/rbac/scope";

const DELIVERY = ["reports.run", "reports.export", "reports.email"];
export type ScheduleUiAccess = {
  profileId: number | null;
  globalDelivery: boolean;
  deliveryCompanyIds: number[];
  globalManage: boolean;
  manageCompanyIds: number[];
};

/** Display capabilities only. Every mutation independently checks current authority. */
export function scheduleUiAccess(ctx: AuthContext): ScheduleUiAccess {
  const companies = [...new Set((ctx.roleAssignments ?? []).flatMap(a =>
    a.ownerCompanyId !== null && a.branchId === null ? [a.ownerCompanyId] : []))];
  return {
    profileId: ctx.profile?.id ?? null,
    globalDelivery: DELIVERY.every(code => hasGlobalPermission(ctx, code)),
    deliveryCompanyIds: companies.filter(id => DELIVERY.every(code => hasPermissionInScope(ctx, code, id))),
    globalManage: hasGlobalPermission(ctx, "reports.schedule.manage"),
    manageCompanyIds: companies.filter(id => hasPermissionInScope(ctx, "reports.schedule.manage", id)),
  };
}

export function canDeliverSchedule(access: ScheduleUiAccess, companyId: number | null): boolean {
  return access.globalDelivery || (companyId !== null && access.deliveryCompanyIds.includes(companyId));
}

export function canEditSchedule(access: ScheduleUiAccess, row: { created_by: number; owner_company_id: number | null }): boolean {
  return canDeliverSchedule(access, row.owner_company_id) && (access.profileId === row.created_by || access.globalManage
    || (row.owner_company_id !== null && access.manageCompanyIds.includes(row.owner_company_id)));
}

export type ScheduleFormOptions = {
  companies: { value: string; label: string }[];
  reports: { code: string; name: string; companyValues: string[]; formats: string[] }[];
};

/** A retry never creates a second schedule or silently accepts different data. */
export function scheduleCreationMatches(row: Record<string, unknown>, payload: Record<string, unknown>): boolean {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",") + "}";
    return JSON.stringify(value) ?? "null";
  };
  return Object.entries(payload).every(([key, value]) => key === "next_run_at" ||
    (key === "time_of_day" ? String(row[key]).slice(0,5) === String(value).slice(0,5) : canonical(row[key] ?? null) === canonical(value ?? null)));
}
