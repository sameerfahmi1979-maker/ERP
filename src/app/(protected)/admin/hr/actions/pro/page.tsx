import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { HrProProcessesPageClient } from "@/features/hr/actions/hr-pro-processes-page-client";

import {readHrActionInquiry} from "@/server/reads/hr-action-inquiries";
import {hrActionInquiryIdentity} from "@/lib/reads/hr-action-inquiries-schema";
import {LoadError} from "@/components/erp/load-error";

export const dynamic = "force-dynamic";

export default async function HrProProcessesPage() {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.actions.view")) {
    redirect("/access-denied");
  }
  const result = await readHrActionInquiry({kind: "pro"}, ctx);
  if (!result.success || result.data?.kind !== "pro") return <LoadError title="HR records" retryHref="/admin/hr/actions/pro" />;
  return <HrProProcessesPageClient authContext={ctx} initialPage={result.data} initialUpdatedAt={result.updatedAt} initialReadIdentity={hrActionInquiryIdentity(ctx)} />;
}

