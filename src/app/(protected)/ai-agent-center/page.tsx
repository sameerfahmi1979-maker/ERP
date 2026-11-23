import { redirect } from "next/navigation";
import { LoadError } from "@/components/erp/load-error";
import { AgentCenterPageClient } from "@/features/ai-agent-center/agent-center-page-client";
import { readAgentCenterSnapshot } from "@/server/reads/ai-agent-center";
import { getReadAuthContext, withReadRequest } from "@/server/reads/read-context";
import { readScopeVersion } from "@/lib/reads/scope-version";
import "@/features/ai-agent-center/agent-center.css";

export const metadata = { title: "AI Agent Center" };

export default async function AgentCenterPage() {
  const { context, result } = await withReadRequest(async () => ({
    context: await getReadAuthContext(), result: await readAgentCenterSnapshot({}),
  }));
  if (!context.profile) redirect("/access-denied");
  if (!result.success) {
    if (result.error === "Permission denied") redirect("/access-denied");
    return <LoadError title="AI Agent Center" retryHref="/ai-agent-center" />;
  }
  return <AgentCenterPageClient initial={result.data}
    seedOwner={{ authUserId: context.profile.auth_user_id, scopeVersion: readScopeVersion(context) }}
    canInspectControls={process.env.DMS_AGENT_CENTER_CONTROL_API_ENABLED === "true"} />;
}
