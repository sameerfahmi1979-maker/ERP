import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { RequisitionsPageClient } from "@/features/hr/recruitment/requisitions-page-client";

import {readRecruitmentInquiry} from "@/server/reads/hr-recruitment-inquiries";
import {recruitmentReadIdentity} from "@/lib/reads/hr-recruitment-inquiries-schema";
import {LoadError} from "@/components/erp/load-error";

export const dynamic = "force-dynamic";

export default async function RequisitionsPage() {
  const ctx = await getAuthContext();
  const canView = !!ctx && (hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage"));
  if (!canView) redirect("/access-denied");
  const result = await readRecruitmentInquiry({kind: "requisitions"}, ctx);
  if (!result.success || result.data?.kind !== "requisitions") return <LoadError title="Recruitment records" retryHref="/admin/hr/recruitment/requisitions" />;
  return <RequisitionsPageClient authContext={ctx} initialPage={result.data} initialUpdatedAt={result.updatedAt} initialReadIdentity={recruitmentReadIdentity(ctx)} />;
}

