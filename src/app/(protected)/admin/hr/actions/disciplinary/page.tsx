import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { HrDisciplinaryPageClient } from "@/features/hr/actions/hr-disciplinary-page-client";

import {readHrActionInquiry} from "@/server/reads/hr-action-inquiries";
import {hrActionInquiryIdentity} from "@/lib/reads/hr-action-inquiries-schema";
import {LoadError} from "@/components/erp/load-error";

export const dynamic = "force-dynamic";

export default async function HrDisciplinaryPage() {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.actions.view") || !hasPermission(ctx, "hr.confidential.view")) {
    redirect("/access-denied");
  }
  const result = await readHrActionInquiry({kind: "disciplinary"}, ctx);
  if (!result.success || result.data?.kind !== "disciplinary") return <LoadError title="HR records" retryHref="/admin/hr/actions/disciplinary" />;
  return <HrDisciplinaryPageClient authContext={ctx} initialPage={result.data} initialUpdatedAt={result.updatedAt} initialReadIdentity={hrActionInquiryIdentity(ctx)} />;
}

