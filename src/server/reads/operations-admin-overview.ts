import "server-only";

import { z } from "zod";
import { logger } from "@/lib/logger";
import { operationsOverviewAdmission, type OperationsOverviewArea } from "@/lib/operations/admin-overview";
import type { WorkQueueRead } from "@/lib/operations/work-queue-contract";
import { getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const summary = z.strictObject({ total: count, pending: count.nullable() });

export async function readOperationsAdminSummary(
  area: OperationsOverviewArea,
  company: number,
  branch: number | null,
): Promise<WorkQueueRead<z.infer<typeof summary>>> {
  const actor = await getAuthContext();
  if (operationsOverviewAdmission(actor, false, undefined) !== "overview") return { status: "restricted" };
  try {
    const { data, error } = await (await createClient()).rpc("fa_operations_admin_summary", {
      p_area: area, p_company: company, p_branch: branch,
    });
    if (error?.code === "42501") return { status: "restricted" };
    const result = summary.safeParse(data);
    if (!error && result.success) return { status: "ok", data: result.data };
    logger.warn("Operations overview read failed", { area, code: error?.code });
  } catch {
    logger.warn("Operations overview read could not be completed", { area });
  }
  return { status: "failed" };
}

