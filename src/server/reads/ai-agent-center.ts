import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/scope";
import {
  AGENT_CENTER_PERMISSIONS,
  agentCenterQuerySchema,
  agentCenterSnapshotSchema,
  type AgentCenterSnapshot,
} from "@/lib/ai-agent-center/contracts";
import { getReadAuthContext } from "./read-context";

type ReadResult = { success: true; data: AgentCenterSnapshot } | { success: false; error: string };

export async function readAgentCenterSnapshot(input: unknown): Promise<ReadResult> {
  const result = agentCenterQuerySchema.safeParse(input);
  if (!result.success) return { success: false, error: "Invalid agent center criteria" };

  const context = await getReadAuthContext();
  if (!AGENT_CENTER_PERMISSIONS.some(permission => hasPermission(context, permission))) {
    return { success: false, error: "Permission denied" };
  }

  const query = result.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dms_agent_center_read", {
    p_company: query.companyId ?? null,
    p_branch: query.branchId ?? null,
    p_search: query.search,
    p_outcome: query.outcome,
    p_case: query.caseId,
    p_offset: query.offset,
  });
  if (error?.code === "42501") return { success: false, error: "Permission denied" };

  const snapshot = agentCenterSnapshotSchema.safeParse(data);
  if (error || !snapshot.success) return { success: false, error: "Agent center records are unavailable." };

  return { success: true, data: snapshot.data };
}
