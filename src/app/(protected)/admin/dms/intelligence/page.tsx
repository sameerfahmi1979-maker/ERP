import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getDmsIntelligenceAdminStats } from "@/server/actions/dms/intelligence-admin";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsIntelligenceAdminPageClient } from "@/features/dms/admin/dms-intelligence-admin-page-client";
export const metadata = {
  title: "DMS Intelligence Admin | ERP",
  description: "DMS AI Content Intelligence — Admin Tools",
};

export default async function DmsIntelligencePage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.admin") && !ctx.roleCodes.includes("system_admin")) {
    redirect("/admin/dms");
  }

  const statsResult = await getDmsIntelligenceAdminStats();

  const defaultStats = {
    totalDocuments: 0,
    documentsWithExtractedText: 0,
    documentsMissingExtractedText: 0,
    documentsWithAiSummary: 0,
    documentsMissingAiSummary: 0,
    documentsWithCompletenessScore: 0,
    highRiskDocuments: 0,
    criticalRiskDocuments: 0,
    pendingTagSuggestions: 0,
    pendingLinkSuggestions: 0,
    documentsWithEmbedding: 0,
    documentsMissingEmbedding: 0,
    failedEmbeddings: 0,
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="DMS Intelligence Admin"
        description="Manage content extraction, AI summaries, completeness/risk scoring, and monitor AI suggestion health"
        breadcrumbs={[
          { label: "Admin", href: "/dashboard" },
          { label: "DMS Admin", href: "/admin/dms" },
          { label: "AI Intelligence" },
        ]}
      />

      {!statsResult.success && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          Failed to load intelligence stats: {statsResult.error}
        </div>
      )}

      <DmsIntelligenceAdminPageClient
        stats={statsResult.data ?? defaultStats}
      />
    </div>
  );
}
