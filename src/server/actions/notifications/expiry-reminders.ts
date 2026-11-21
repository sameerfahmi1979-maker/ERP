"use server";

import { z } from "zod";
import { getAuthContext, canUseApplication, hasGlobalPermission } from "@/lib/rbac/check";
import { boundedQuery } from "@/lib/email/queue/runtime-limits";
import { createClient } from "@/lib/supabase/server";

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const domain = z.enum(["hr", "fleet"]);
const scope = z.object({ companyId: id, branchId: id.nullable(), domain });
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const editing = z.object({
  revision,
  recipientIds: z.array(id).min(1).max(50),
  expiryDay: z.boolean(),
  escalationDays: z.number().int().min(1).max(365).nullable(),
});
const setting = scope.extend({
  ...editing.shape,
  recipientIds: z.array(id).max(50),
  preExpiryDays: z.array(z.number().int().positive()).length(6),
  active: z.boolean(),
}).strict();
const scopeChoice = z.object({ companyId: id, branchId: id.nullable(), label: z.string().min(1) }).strict();
const recipientChoice = z.object({ id, label: z.string().min(1) }).strict();

export type ExpiryReminderScope = z.infer<typeof scope>;
export type ExpiryReminderPolicy = z.infer<typeof setting>;
export type ExpiryReminderScopeChoice = z.infer<typeof scopeChoice>;
export type ExpiryReminderRecipientChoice = z.infer<typeof recipientChoice>;

function rpcScope(input: ExpiryReminderScope) {
  return { p_company: input.companyId, p_branch: input.branchId, p_domain: input.domain };
}

async function expirySettingsOperation<T>(
  name: string, args: Record<string, unknown>, output: z.ZodType<T>,
) {
  try {
    const context = await getAuthContext();
    if (!canUseApplication(context) || !hasGlobalPermission(context, "notifications.admin")) {
      return { success: false as const, error: "Global notification administration is required." };
    }
    const result = await boundedQuery((await createClient()).rpc(name, args));
    if (result.error?.code === "PT409") {
      return { success: false as const, error: "The policy changed. Refresh it and review the latest settings." };
    }
    if (result.error?.code === "42501") {
      return { success: false as const, error: "Review your access and choose currently authorised recipients." };
    }
    const checked = output.safeParse(result.data);
    if (!result.error && checked.success) return { success: true as const, data: checked.data };
  } catch {
    // An unconfirmed response is recovered by reading the current revision.
  }
  return { success: false as const, error: "The reminder settings could not be confirmed. Refresh the policy." };
}

export async function readExpiryReminderScopes() {
  return expirySettingsOperation("t19_expiry_policy_catalog", {}, z.array(scopeChoice));
}

export async function readExpiryReminderPolicy(input: ExpiryReminderScope) {
  const parsed = scope.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Choose a company and branch." };
  return expirySettingsOperation("t19_expiry_policy_catalog", rpcScope(parsed.data),
    z.object({ policy: setting, recipients: z.array(recipientChoice).max(500) }).strict());
}

export async function saveExpiryReminderPolicy(input: ExpiryReminderScope & z.infer<typeof editing>) {
  const parsed = scope.extend(editing.shape).strict().safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Choose up to 50 recipients and an escalation between 1 and 365 days." };
  const p = parsed.data;
  return expirySettingsOperation("t19_save_expiry_policy", {
    ...rpcScope(p), p_revision: p.revision, p_recipients: p.recipientIds,
    p_expiry_day: p.expiryDay, p_escalation_days: p.escalationDays,
  }, setting);
}

export async function changeExpiryReminderPolicyState(input: ExpiryReminderScope & { revision: number; active: boolean }) {
  const parsed = scope.extend({ revision: revision.min(1), active: z.boolean() }).strict().safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Save the current reminder policy first." };
  return expirySettingsOperation("t19_set_expiry_policy_active", {
    ...rpcScope(parsed.data), p_revision: parsed.data.revision, p_active: parsed.data.active,
  }, setting);
}
