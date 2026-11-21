import "server-only";

import type { z } from "zod";
import {
  workQueuePage, workQueuePageSize, workQueuePermissions, workQueueQuery, workQueueScopes,
  type WorkQueuePage, type WorkQueueQuery, type WorkQueueRead, type WorkQueueScope,
} from "@/lib/operations/work-queue-contract";
import { canUseApplication, getAuthContext, hasRole } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

async function read<T>(rpc: "t19_queue_scopes" | "t19_work_queue", inputs: Record<string, unknown>, schema: z.ZodType<T>): Promise<WorkQueueRead<T>> {
  try {
    const actor = await getAuthContext();
    if (!canUseApplication(actor) || (!hasRole(actor, "system_admin") &&
      !workQueuePermissions.some(code => actor.permissionCodes.includes(code)))) {
      return { status: "restricted" };
    }
    const { data, error } = await (await createClient()).rpc(rpc, inputs);
    if (error) {
      if (error.code === "42501") return { status: "restricted" };
      logger.warn("Work queue read failed", { rpc, code: error.code });
      return { status: "failed" };
    }
    const verified = schema.safeParse(data);
    if (verified.success) return { status: "ok", data: verified.data };
    logger.warn("Work queue response shape was invalid", { rpc });
  } catch {
    logger.warn("Work queue read could not be completed", { rpc });
  }
  return { status: "failed" };
}

export async function readWorkQueueScopes(): Promise<WorkQueueRead<WorkQueueScope[]>> {
  return read("t19_queue_scopes", {}, workQueueScopes);
}

export async function readWorkQueue(input: WorkQueueQuery): Promise<WorkQueueRead<WorkQueuePage>> {
  const parsed = workQueueQuery.safeParse(input);
  if (!parsed.success) return { status: "failed" };
  const { company, branch, kind, query, page } = parsed.data;
  const result = await read("t19_work_queue", {
    p_company: company, p_branch: branch, p_kind: kind, p_query: query, p_page: page, p_size: workQueuePageSize,
  }, workQueuePage);
  if (result.status === "ok" && (result.data.page !== page || result.data.page_size !== workQueuePageSize
    || (kind !== "all" && result.data.rows.some(row => row.kind !== kind)))) {
    return { status: "failed" };
  }
  return result;
}
