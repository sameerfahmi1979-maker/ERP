"use server";

import { getAuthContext } from "@/lib/rbac/check";
import { hasPermissionInScope } from "@/lib/rbac/scope";
import { createClient } from "@/lib/supabase/server";
import {
  agentScopeSchema, controlRequestSchema, controlStateSchema, type AgentControlState,
} from "@/lib/ai-agent-center/controls";

type ControlResult = { ok: true; state: AgentControlState } |
  { ok: false; reason: "unavailable" | "invalid" | "denied" | "conflict" | "unconfirmed" };

export async function inspectAgentControl(input: unknown): Promise<AgentControlState | null> {
  if (process.env.DMS_AGENT_CENTER_CONTROL_API_ENABLED !== "true") return null;
  const parsed = agentScopeSchema.safeParse(input);
  if (!parsed.success) return null;
  const { companyId, branchId, agent } = parsed.data;
  const context = await getAuthContext();
  if (!hasPermissionInScope(context, "dms.admin", companyId, branchId)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dms_agent_center_control", {
    p_company: companyId, p_branch: branchId, p_agent: agent, p_action: "inspect",
    p_expected_revision: null, p_request: null, p_reason: null,
  });
  const result = controlStateSchema.safeParse(data);
  return !error && result.success ? result.data : null;
}

export async function changeAgentControl(input: unknown): Promise<ControlResult> {
  if (process.env.DMS_AGENT_CENTER_CONTROL_API_ENABLED !== "true") return { ok: false, reason: "unavailable" };
  const parsed = controlRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { companyId, branchId, agent, action, expectedRevision, requestId, reason } = parsed.data;
  const context = await getAuthContext();
  if (!hasPermissionInScope(context, "dms.admin", companyId, branchId)) return { ok: false, reason: "denied" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dms_agent_center_control", {
    p_company: companyId, p_branch: branchId, p_agent: agent, p_action: action,
    p_expected_revision: expectedRevision, p_request: requestId, p_reason: reason,
  });
  const result = controlStateSchema.safeParse(data);
  if (!error && result.success) return { ok: true, state: result.data };
  if (error?.code === "42501") return { ok: false, reason: "denied" };
  if (error && ["40001", "23505", "22023"].includes(error.code)) return { ok: false, reason: "conflict" };
  return { ok: false, reason: "unconfirmed" };
}
