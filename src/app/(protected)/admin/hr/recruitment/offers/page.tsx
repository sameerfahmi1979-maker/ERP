import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { OffersPageClient } from "@/features/hr/recruitment/offers-page-client";

import {readRecruitmentInquiry} from "@/server/reads/hr-recruitment-inquiries";
import {recruitmentReadIdentity} from "@/lib/reads/hr-recruitment-inquiries-schema";
import {LoadError} from "@/components/erp/load-error";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const ctx = await getAuthContext();
  const canView = !!ctx && (hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage"));
  if (!canView) redirect("/access-denied");
  const result = await readRecruitmentInquiry({kind: "offers"}, ctx);
  if (!result.success || result.data?.kind !== "offers") return <LoadError title="Recruitment records" retryHref="/admin/hr/recruitment/offers" />;
  return <OffersPageClient authContext={ctx} initialPage={result.data} initialUpdatedAt={result.updatedAt} initialReadIdentity={recruitmentReadIdentity(ctx)} />;
}

