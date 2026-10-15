import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { HrApprovalsPageClient } from "@/features/hr/actions/hr-approvals-page-client";

import {readHrActionInquiry} from "@/server/reads/hr-action-inquiries";
import {hrActionInquiryIdentity} from "@/lib/reads/hr-action-inquiries-schema";
import {LoadError} from "@/components/erp/load-error";

export const dynamic = "force-dynamic";

export default async function HrApprovalsPage() {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.actions.view")) {
    redirect("/access-denied");
  }
  const result = await readHrActionInquiry({kind: "approvals"}, ctx);
  if (!result.success || result.data?.kind !== "approvals") return <LoadError title="HR records" retryHref="/admin/hr/actions/approvals" />;
  return <HrApprovalsPageClient authContext={ctx} initialPage={result.data} initialUpdatedAt={result.updatedAt} initialReadIdentity={hrActionInquiryIdentity(ctx)} />;
}

