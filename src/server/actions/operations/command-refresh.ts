"use server";

import { operationsRefreshTarget } from "@/lib/operations/command-result";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { canAccessRoute } from "@/lib/rbac/route-access-registry";
import { operationsRefreshAdmission, refreshOperationsPaths } from "@/server/operations/revalidate-command-paths";

export async function refreshOperationsCommand(input: unknown): Promise<boolean> {
  const parsed = operationsRefreshTarget.safeParse(input);
  if (!parsed.success) return false;
  const actor = await getAuthContext();
  if (!canUseApplication(actor) || !operationsRefreshAdmission[parsed.data.kind]
    .some(path => canAccessRoute(path, actor.permissionCodes, false))) return false;
  return !refreshOperationsPaths(parsed.data).refreshFailed;
}

