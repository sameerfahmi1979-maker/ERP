import "server-only";
import { getAuthContext, hasGlobalPermission, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { hrRuleChoicePageSchema, hrRulePageSchema, hrRuleRead, type HrRuleChoicePage, type HrRuleListRead } from "@/lib/hr/specialized-settings-read";
import type { HrRuleRow } from "@/lib/hr/specialized-settings-form";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/server/actions/hr/settings";

type RulePage = { data: HrRuleRow[]; total: number };
const unavailable = { success: false as const, error: "HR configuration could not be loaded. Please retry." };

export function canReadHrRuleSettings(ctx: AuthContext) {
  return hasPermission(ctx, "hr.settings.view") || hasPermission(ctx, "hr.settings.manage") || hasPermission(ctx, "hr.admin");
}

export function canManageHrRuleSettings(ctx: AuthContext) {
  return hasGlobalPermission(ctx, "hr.settings.manage") || hasGlobalPermission(ctx, "hr.admin");
}

export async function readHrRuleSettings(input: HrRuleListRead, signal?: AbortSignal, context?: AuthContext): Promise<ActionResult<RulePage>>;
export async function readHrRuleSettings(input: unknown, signal?: AbortSignal, context?: AuthContext): Promise<ActionResult<RulePage | HrRuleChoicePage>>;
export async function readHrRuleSettings(input: unknown, signal?: AbortSignal, context?: AuthContext): Promise<ActionResult<RulePage | HrRuleChoicePage>> {
  const parsed = hrRuleRead.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid HR configuration read criteria" };
  try {
    const request = parsed.data;
    const ctx = context ?? await getAuthContext();
    if (request.kind === "list" ? !canReadHrRuleSettings(ctx) : !canManageHrRuleSettings(ctx)) {
      return { success: false, error: "Permission denied" };
    }
    signal?.throwIfAborted();
    const db = await createClient();
    const query = (request.kind === "list"
      ? db.rpc("hr_rule_settings_page", {
          p_entity: request.entity, p_page: request.page, p_size: request.page_size,
          p_search: request.tableSearch, p_filters: request.columnFilters, p_sort: request.sorting,
        })
      : db.rpc("hr_rule_settings_choices", {
          p_entity: request.entity, p_field: request.field, p_parent: request.parent,
          p_page: request.page, p_search: request.search,
        })).retry(false);
    const result = await (signal ? query.abortSignal(signal) : query);
    signal?.throwIfAborted();
    if (result.error?.code === "42501") return { success: false, error: "Permission denied" };
    if (result.error) return unavailable;
    if (request.kind === "choices") {
      const choices = hrRuleChoicePageSchema(request.page).safeParse(result.data);
      return choices.success ? { success: true, data: choices.data } : unavailable;
    }
    const rows = hrRulePageSchema(request.entity, request.page, request.page_size).safeParse(result.data);
    return rows.success ? { success: true, data: rows.data } : unavailable;
  } catch {
    signal?.throwIfAborted();
    return unavailable;
  }
}
