import "server-only";
import { createClient } from "@/lib/supabase/server";
import { canUseApplication, type AuthContext } from "@/lib/rbac/check";

/** No owner/creator/admin-module exception. The RPC resolves current scope and confidentiality. */
export async function checkDocumentConfidentialityAccess(
  client: Awaited<ReturnType<typeof createClient>>, documentId: number, ctx: AuthContext,
  capability = "dms.documents.view",
): Promise<{ allowed: boolean; error?: string }> {
  if (!canUseApplication(ctx) || !Number.isSafeInteger(documentId) || documentId <= 0) return { allowed: false, error: "Document access is restricted." };
  const { data, error } = await client.rpc("f03_has_document_permission", { document_id: documentId, permission_code: capability });
  return !error && data === true ? { allowed: true } : { allowed: false, error: "Document access is restricted." };
}
