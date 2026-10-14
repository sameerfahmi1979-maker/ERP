import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { HrBlocksPageClient } from "@/features/hr/operations/blocks/hr-blocks-page-client";
import {readHrOperations} from "@/server/reads/hr-operations";
import {hrOperationsReadIdentity} from "@/lib/reads/hr-operations-schema";
import {LoadError} from "@/components/erp/load-error";

export const dynamic = "force-dynamic";

export default async function HrBlocksPage() {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    redirect("/access-denied");
  }
  const canManage = hasPermission(ctx, "hr.assignments.manage");
  const result = await readHrOperations({kind: "blocks", status: "active"}, ctx);
  if (!result.success || result.data?.kind !== "blocks") return <LoadError title="Operational records" retryHref="/admin/hr/operations/blocks" />;
  return <HrBlocksPageClient canManage={canManage} authContext={ctx} initialPage={result.success ? result.data : undefined} initialUpdatedAt={result.updatedAt} initialReadIdentity={hrOperationsReadIdentity(ctx)} />;
}

