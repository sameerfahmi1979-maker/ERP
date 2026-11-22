"use server";

import { z } from "zod";
import type { ExitScope, ExitWorkspace } from "@/features/hr/exit-settlement/exit-settlement-contract";
import { logger } from "@/lib/logger";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { invalidatePayrollWorkspace } from "@/server/payroll-workspace-refresh";

const positive = z.number().int().positive().safe();
const scope = z.object({ company: positive, branch: positive });
const scopeList = z.array(scope.extend({ company_name: z.string(), branch_name: z.string() }));
const query = scope.extend({ eos: positive.optional(), after: positive.optional() });
const mutation = scope.extend({ operation: z.uuid(), data: z.record(z.string(), z.unknown()) });
const command = mutation.extend({ eos: positive, action: z.enum([
  "activate", "calculate", "recommend-case", "accept-case", "review", "submit", "withdraw", "approve", "reject",
  "request-revoke", "revoke", "decline-revoke", "close-exit", "payment-start", "payment-receipt", "payment-allocate", "payment-reverse",
]) });
const configuration = mutation.extend({ domain: z.enum(["policy", "adjustment"]), eos: positive.optional(),
  action: z.enum(["propose", "approve", "verify", "reject"]),
});
const state = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const caseReceipt = z.object({ id: positive, state });
const recoveryReceipt = caseReceipt.extend({ decision: positive });
const versionReceipt = caseReceipt.extend({ version: z.uuid(), digest });
const paymentReceipt = z.object({
  version: z.uuid(), payment: z.uuid().nullable(), state, revision: z.number().int().nonnegative(),
});
const configurationReceipt = z.object({ id: positive, digest, status: state });
type Receipt = z.infer<typeof caseReceipt> | z.infer<typeof recoveryReceipt> |
  z.infer<typeof versionReceipt> | z.infer<typeof paymentReceipt> | z.infer<typeof configurationReceipt>;
type Result = { ok: true; receipt: Receipt; refreshRequired?: true } | { ok: false; error: string; uncertain?: boolean };
const unconfirmed: Result = { ok: false, uncertain: true, error: "The outcome could not be confirmed. Retry the same request." };

async function read(rpc: string, parameters: Record<string, unknown>): Promise<unknown> {
  try {
    if (!canUseApplication(await getAuthContext())) return null;
    const { data, error } = await (await createClient()).rpc(rpc, parameters);
    if (!error) return data;
    logger.warn("Exit settlement read failed", { rpc, code: error.code });
  } catch {
    return null;
  }
  return null;
}

export async function listExitScopes(): Promise<ExitScope[] | null> {
  const result = scopeList.safeParse(await read("t18_exit_scopes", {}));
  return result.success ? result.data : null;
}

export async function readExitWorkspace(input: unknown): Promise<ExitWorkspace | null> {
  const result = query.safeParse(input);
  if (!result.success) return null;
  const { company, branch, eos, after } = result.data;
  const data = await read("t18_exit_workspace", { p_company: company, p_branch: branch, p_eos: eos ?? null, p_after: after ?? null });
  const caseRow = z.object({ id: positive, employee: positive, name: z.string(), last_day: z.iso.date().nullable(), state: z.string() });
  const selected = caseRow.extend({ activated: z.boolean(), actions: z.array(z.string()), payment_channels: z.array(z.string()),
    clearance: z.object({ blocking_count: z.number().int().nonnegative(), items: z.array(z.unknown()) }),
    cases: z.array(z.unknown()), draft: z.object({ version: z.uuid(), digest: z.string() }).passthrough().nullable(),
    approval: z.object({ version: z.uuid(), digest: z.string(), state: z.string() }).nullable(),
    payment: z.object({ state: z.string(), movements: z.array(z.unknown()) }).passthrough().nullable(),
  }).passthrough();
  const envelope = z.object({ access: z.object({ hr: z.boolean(), accounts: z.boolean(), approve: z.boolean(), pay: z.boolean() }),
    cases: z.array(caseRow), selected: selected.nullable(),
  }).passthrough().safeParse(data);
  return envelope.success && (eos === undefined || envelope.data.selected?.id === eos)
    ? envelope.data as ExitWorkspace
    : null;
}

type CommandParameters = {
  p_operation: string; p_company: number; p_branch: number; p_action: string; p_data: Record<string, unknown>;
  p_eos?: number; p_domain?: "payment" | "adjustment";
};

function parseReceipt(parameters: CommandParameters, raw: unknown): Receipt | undefined {
  const { p_action: action, p_data: data, p_eos: eos, p_domain: domain } = parameters;
  if (domain === "payment") {
    const parsed = paymentReceipt.safeParse(raw);
    if (parsed.success && parsed.data.version === data.settlement_version &&
        (action === "start" ? parsed.data.payment === null : parsed.data.payment !== null) &&
        (data.payment === undefined || parsed.data.payment === data.payment)) return parsed.data;
    return;
  }
  if (domain === "adjustment" || eos === undefined) {
    const parsed = configurationReceipt.safeParse(raw);
    const target = domain === "adjustment" ? data.adjustment : data.policy;
    const expectedStatus = { propose: "proposed", approve: "approved", verify: "verified", reject: "rejected" }[
      action as "propose" | "approve" | "verify" | "reject"];
    if (parsed.success && parsed.data.status === expectedStatus &&
        (action === "propose" || (parsed.data.id === target && parsed.data.digest === data.digest))) return parsed.data;
    return;
  }
  if (action === "activate") {
    const parsed = caseReceipt.safeParse(raw);
    if (parsed.success && parsed.data.id === eos && parsed.data.state === "activated") return parsed.data;
    return;
  }
  if (action === "recommend-case" || action === "accept-case") {
    const parsed = recoveryReceipt.safeParse(raw);
    const expectedState = action === "recommend-case" ? "recommended" : "accepted";
    if (parsed.success && parsed.data.id === eos && parsed.data.state === expectedState) return parsed.data;
    return;
  }
  const parsed = versionReceipt.safeParse(raw);
  if (parsed.success && parsed.data.id === eos && (action === "calculate" ? parsed.data.state === "draft" :
    parsed.data.version === data.version && parsed.data.digest === data.digest)) return parsed.data;
}

async function execute(rpc: string, parameters: CommandParameters): Promise<Result> {
  try {
    if (!canUseApplication(await getAuthContext())) return { ok: false, error: "Sign in again to continue." };
    if (JSON.stringify(parameters).length > 32_000) return { ok: false, error: "Check the size of the information supplied." };
    const { data, error } = await (await createClient()).rpc(rpc, parameters);
    if (error) {
      if (error.code === "42501") return { ok: false, error: "You need independent authority for this action in the selected employer and branch." };
      if (["40001", "55P03", "40P01"].includes(error.code)) {
        return { ok: false, uncertain: true, error: "Another change is in progress. Retry the same request." };
      }
      if (["PT409", "P0409", "23505", "23P01", "55000"].includes(error.code)) {
        return { ok: false, error: "Review the current clearance, exact version, and evidence. Refresh the case to see any changes." };
      }
      if (["22023", "22007", "22008", "22P02", "23514"].includes(error.code)) {
        return { ok: false, error: "Check the required details, dates, and exact amounts." };
      }
      logger.warn("Exit settlement outcome could not be confirmed", { rpc, code: error.code });
      return unconfirmed;
    }
    const receipt = parseReceipt(parameters, data);
    if (!receipt) {
      logger.warn("Exit settlement receipt could not be confirmed", { rpc, action: parameters.p_action });
      return unconfirmed;
    }
    return { ok: true, receipt, ...invalidatePayrollWorkspace("exit") };
  } catch {
    return unconfirmed;
  }
}

export async function changeExitSettlement(input: unknown): Promise<Result> {
  const result = command.safeParse(input);
  if (!result.success) return { ok: false, error: "Check the required settlement details." };
  const { operation, company, branch, eos, action, data } = result.data;
  if (action.startsWith("payment-")) {
    return execute("t18_exit_scoped_change", { p_operation: operation, p_company: company, p_branch: branch, p_domain: "payment",
      p_eos: eos, p_action: action.slice("payment-".length), p_data: data });
  }
  return execute("t18_exit_command", { p_operation: operation, p_company: company, p_branch: branch,
    p_eos: eos, p_action: action, p_data: data });
}

export async function changeExitConfiguration(input: unknown): Promise<Result> {
  const result = configuration.safeParse(input);
  if (!result.success) return { ok: false, error: "Check the required configuration details." };
  const { operation, company, branch, domain, eos, action, data } = result.data;
  if (domain === "adjustment" && eos !== undefined && action !== "approve") {
    return execute("t18_exit_scoped_change", { p_operation: operation, p_company: company, p_branch: branch, p_domain: "adjustment",
      p_eos: eos, p_action: action, p_data: data });
  }
  if (domain === "policy" && action !== "verify") {
    return execute("t18_settlement_policy", { p_operation: operation, p_company: company, p_branch: branch,
      p_action: action, p_data: data });
  }
  return { ok: false, error: "Choose a valid configuration action." };
}
