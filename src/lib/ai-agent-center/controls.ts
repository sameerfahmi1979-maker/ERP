import { z } from "zod";
import { AGENTS } from "./contracts";

export const agentScopeSchema = z.strictObject({
  companyId: z.number().int().positive(),
  branchId: z.number().int().positive().nullable(),
  agent: z.enum(AGENTS.map(agent => agent.id)),
});

export const controlRequestSchema = agentScopeSchema.extend({
  action: z.enum(["on", "off", "pause", "resume"]),
  expectedRevision: z.number().int().nonnegative(),
  requestId: z.uuid(),
  reason: z.string().trim().min(1).max(240),
});

export const controlStateSchema = z.strictObject({
  enabled: z.boolean(),
  paused: z.boolean(),
  revision: z.number().int().nonnegative(),
  mode: z.enum(["observe", "recommend", "execute"]),
  workerBound: z.boolean(),
});

export type AgentControlScope = z.infer<typeof agentScopeSchema>;
export type AgentControlRequest = z.infer<typeof controlRequestSchema>;
export type AgentControlState = z.infer<typeof controlStateSchema>;
