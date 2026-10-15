import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { CandidatesPageClient } from "@/features/hr/recruitment/candidates-page-client";

import {readRecruitmentInquiry} from "@/server/reads/hr-recruitment-inquiries";
import {recruitmentReadIdentity} from "@/lib/reads/hr-recruitment-inquiries-schema";
import {LoadError} from "@/components/erp/load-error";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const ctx = await getAuthContext();
  const canView = !!ctx && (hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage"));
  if (!canView) redirect("/access-denied");
  const result = await readRecruitmentInquiry({kind: "candidates"}, ctx);
  if (!result.success || result.data?.kind !== "candidates") return <LoadError title="Recruitment records" retryHref="/admin/hr/recruitment/candidates" />;
  return <CandidatesPageClient authContext={ctx} initialPage={result.data} initialUpdatedAt={result.updatedAt} initialReadIdentity={recruitmentReadIdentity(ctx)} />;
}

