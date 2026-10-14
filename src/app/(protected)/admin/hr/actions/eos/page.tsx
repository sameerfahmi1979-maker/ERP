import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { HrEosPageClient } from "@/features/hr/actions/hr-eos-page-client";

import {readHrActionInquiry} from "@/server/reads/hr-action-inquiries";
import {hrActionInquiryIdentity} from "@/lib/reads/hr-action-inquiries-schema";
import {LoadError} from "@/components/erp/load-error";

export const dynamic = "force-dynamic";

export default async function HrEosPage() {
  const ctx = await getAuthContext();
  if (!ctx || (!hasPermission(ctx, "hr.actions.view") && !hasPermission(ctx, "hr.eos.view"))) {
    redirect("/access-denied");
  }
  const result = await readHrActionInquiry({kind: "eos"}, ctx);
  if (!result.success || result.data?.kind !== "eos") return <LoadError title="HR records" retryHref="/admin/hr/actions/eos" />;
  return <HrEosPageClient authContext={ctx} initialPage={result.data} initialUpdatedAt={result.updatedAt} initialReadIdentity={hrActionInquiryIdentity(ctx)} />;
}

