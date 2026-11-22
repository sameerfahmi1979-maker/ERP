import { redirect } from "next/navigation";
import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
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
    hasGlobalPermission(ctx, "ai.duplicates.view") ||
    hasGlobalPermission(ctx, "ai.common.admin");

  if (!canView) {
    redirect("/access-denied");
  }

  const params = await searchParams;
  const summaryResult = await getDuplicateCandidateSummary();
  const defaultSummary = {
    pending: null,
    highConfidence: null,
    confirmed: null,
    ignoredResolved: null,
    featureEnabled: null,
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
