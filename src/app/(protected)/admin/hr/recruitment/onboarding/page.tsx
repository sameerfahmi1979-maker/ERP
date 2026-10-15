import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { GlobalOnboardingPageClient } from "@/features/hr/recruitment/global-onboarding-page-client";

import {readRecruitmentInquiry} from "@/server/reads/hr-recruitment-inquiries";
import {recruitmentReadIdentity} from "@/lib/reads/hr-recruitment-inquiries-schema";
import {LoadError} from "@/components/erp/load-error";

export const dynamic = "force-dynamic";

export default async function GlobalOnboardingPage() {
  const ctx = await getAuthContext();
  const canView = !!ctx && (hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage"));
  if (!canView) redirect("/access-denied");
  const result = await readRecruitmentInquiry({kind: "onboarding"}, ctx);
  if (!result.success || result.data?.kind !== "onboarding") return <LoadError title="Recruitment records" retryHref="/admin/hr/recruitment/onboarding" />;
  return <GlobalOnboardingPageClient authContext={ctx} initialPage={result.data} initialUpdatedAt={result.updatedAt} initialReadIdentity={recruitmentReadIdentity(ctx)} />;
}

