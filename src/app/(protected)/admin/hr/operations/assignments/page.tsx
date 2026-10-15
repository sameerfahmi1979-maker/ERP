import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { HrAssignmentsPageClient } from "@/features/hr/operations/assignments/hr-assignments-page-client";
import {readHrOperations} from "@/server/reads/hr-operations";
import {hrOperationsReadIdentity} from "@/lib/reads/hr-operations-schema";
import {LoadError} from "@/components/erp/load-error";

export const dynamic = "force-dynamic";

export default async function HrAssignmentsPage() {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    redirect("/access-denied");
  }
  const result = await readHrOperations({kind: "assignments", status: "active"}, ctx);
  if (!result.success || result.data?.kind !== "assignments") return <LoadError title="Operational records" retryHref="/admin/hr/operations/assignments" />;
  return <HrAssignmentsPageClient authContext={ctx} initialPage={result.success ? result.data : undefined} initialUpdatedAt={result.updatedAt} initialReadIdentity={hrOperationsReadIdentity(ctx)} />;
}

