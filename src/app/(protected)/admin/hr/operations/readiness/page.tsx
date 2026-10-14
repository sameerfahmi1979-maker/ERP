import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { HrReadinessPageClient } from "@/features/hr/operations/readiness/hr-readiness-page-client";
import {readHrOperations} from "@/server/reads/hr-operations";
import {hrOperationsReadIdentity} from "@/lib/reads/hr-operations-schema";
import {LoadError} from "@/components/erp/load-error";

export const dynamic = "force-dynamic";

export default async function HrReadinessPage() {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    redirect("/access-denied");
  }
  const result = await readHrOperations({kind: "readiness"}, ctx);
  if (!result.success || result.data?.kind !== "readiness") return <LoadError title="Operational records" retryHref="/admin/hr/operations/readiness" />;
  return <HrReadinessPageClient authContext={ctx} initialPage={result.success ? result.data : undefined} initialUpdatedAt={result.updatedAt} initialReadIdentity={hrOperationsReadIdentity(ctx)} />;
}

