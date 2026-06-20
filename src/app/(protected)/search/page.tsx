import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { SearchPageClient } from "@/features/ai/common/search";
import { getRecentSearches, isAiSearchEnabled } from "@/server/actions/ai/common/search";

export const metadata = {
  title: "AI Search | ERP",
  description: "Global AI-powered search across organizations, parties, branches, sites, and documents",
};

export default async function SearchPage() {
  const ctx = await getAuthContext();
  const canAccess =
    hasPermission(ctx, "ai.search.use") ||
    hasPermission(ctx, "ai.search.view") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin");

  if (!canAccess) {
    redirect("/dashboard");
  }

  const [recentResult, flagsResult] = await Promise.all([
    getRecentSearches(),
    isAiSearchEnabled(),
  ]);

  const initialRecent = recentResult.data ?? [];
  const flags = flagsResult.data ?? { enabled: false, semanticEnabled: false };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="AI Search"
        description="Search across organizations, parties, branches, work sites, and documents. Results are read-only — use record links to open and act on items."
        breadcrumbs={[
          { label: "Admin", href: "/dashboard" },
          { label: "AI Search" },
        ]}
      />

      <SearchPageClient
        initialRecent={initialRecent}
        aiSearchEnabled={flags.enabled}
        semanticEnabled={flags.semanticEnabled}
      />
    </div>
  );
}
