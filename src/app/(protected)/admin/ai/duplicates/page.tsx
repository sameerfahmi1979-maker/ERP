import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DuplicateCandidatesPageClient } from "@/features/ai/common/duplicate-detection";
import { getDuplicateCandidateSummary } from "@/server/actions/ai/common/duplicate-detection";

export const metadata = {
  title: "AI Duplicates | ERP",
  description: "Review AI duplicate and conflict detection candidates",
};

type PageProps = {
  searchParams: Promise<{
    entityType?: string;
    entityId?: string;
    documentId?: string;
  }>;
};

export default async function AiDuplicatesPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  const canView =
    hasPermission(ctx, "ai.duplicates.view") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin");

  if (!canView) {
    redirect("/access-denied");
  }

  const params = await searchParams;
  const summaryResult = await getDuplicateCandidateSummary();
  const defaultSummary = {
    pending: 0,
    highConfidence: 0,
    confirmed: 0,
    ignoredResolved: 0,
    featureEnabled: false,
  };

  const entityId = params.entityId ? Number(params.entityId) : undefined;
  const documentId = params.documentId ? Number(params.documentId) : undefined;

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="AI Duplicate & Conflict Review"
        description="Review duplicate and conflict candidates across master data and DMS. No automatic merge or fix."
        breadcrumbs={[
          { label: "Admin", href: "/dashboard" },
          { label: "AI Duplicates" },
        ]}
      />

      <DuplicateCandidatesPageClient
        summary={summaryResult.data ?? defaultSummary}
        initialEntityType={params.entityType}
        initialEntityId={entityId && !Number.isNaN(entityId) ? entityId : undefined}
        initialDocumentId={documentId && !Number.isNaN(documentId) ? documentId : undefined}
      />
    </div>
  );
}
