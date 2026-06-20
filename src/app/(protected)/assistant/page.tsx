import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { AssistantPageClient } from "@/features/ai/common/assistant";
import {
  getAssistantSessions,
  isAssistantEnabled,
} from "@/server/actions/ai/common/assistant";

export const metadata = {
  title: "AI Assistant | ERP",
  description:
    "Read-only AI assistant for searching, explaining, and preparing draft actions across the ERP",
};

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; entityId?: string }>;
}) {
  const ctx = await getAuthContext();
  const canAccess =
    hasPermission(ctx, "ai.assistant.use") ||
    hasPermission(ctx, "ai.assistant.view") ||
    hasPermission(ctx, "ai.assistant.admin") ||
    ctx.roleCodes.includes("system_admin");

  if (!canAccess) {
    redirect("/dashboard");
  }

  const enabled = await isAssistantEnabled();
  const params = await searchParams;

  const sessionsResult = await getAssistantSessions({ limit: 20 });
  const initialSessions = sessionsResult.data ?? [];

  if (!enabled) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-6">
        <ERPPageHeader
          title="AI Assistant"
          description="AI-powered read-only assistant for ERP search, explanations, and draft preparation."
          breadcrumbs={[
            { label: "Admin", href: "/dashboard" },
            { label: "AI Assistant" },
          ]}
        />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-sm text-amber-800 font-medium">
            AI Assistant is not currently enabled.
          </p>
          <p className="text-xs text-amber-600 mt-1">
            Contact your system administrator to enable this feature in AI Settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="AI Assistant"
        description="Ask me to search, explain risk or compliance, and prepare draft notes. All actions require your explicit human review — nothing is executed automatically."
        breadcrumbs={[
          { label: "Admin", href: "/dashboard" },
          { label: "AI Assistant" },
        ]}
      />

      <AssistantPageClient
        initialSessions={initialSessions}
        initialEntityType={params.entityType}
        initialEntityId={params.entityId ? parseInt(params.entityId, 10) : undefined}
      />
    </div>
  );
}
