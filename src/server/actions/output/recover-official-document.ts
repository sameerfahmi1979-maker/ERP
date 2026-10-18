"use server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/rbac/check";
import { getEmployeeAccess } from "@/lib/rbac/employee-access";
import { recoverDurableOutput } from "@/lib/output/durable-operation";
import { issuedFileUrl } from "@/lib/output/issued-file-access";
import { isOutputCoordinatorEnabled } from "@/lib/output/feature-flags";
import type { GenerateOfficialDocumentOutcome } from "@/lib/output/types";
import type { EffectiveOutputPolicy } from "@/lib/output/class-policy";

/** Resume by retained ID, never by reconstruction from current source data. */
export async function recoverOfficialDocument(issuanceId: number): Promise<GenerateOfficialDocumentOutcome> {
  try {
    if (!isOutputCoordinatorEnabled() || !Number.isSafeInteger(issuanceId) || issuanceId <= 0) throw Error("Invalid or disabled recovery request.");
    const ctx = await getAuthContext(), db = await createClient();
    const original = await db.from("erp_generated_pdf_documents").select("id,generated_by,source_record_id,source_record_type,policy_snapshot_json,request_key").eq("id", issuanceId).single();
    if (original.error || !original.data || original.data.generated_by !== ctx.profile?.id || original.data.source_record_type !== "employee") throw Error("Only the original issuer may recover this request. No replacement was created.");
    const access = await getEmployeeAccess(ctx, original.data.source_record_id);
    if (!access.allows("reports.pdf.generate") || !access.allows("reports.run")) throw Error("Original request is outside your current generation scope.");
    const outcome = await recoverDurableOutput(issuanceId);
    if (outcome.kind !== "issued") return { success: false, blocked: "reconciliation_required", issuanceId, error: "error" in outcome ? outcome.error : "Original request requires reconciliation." };
    return { success: true, issuanceId, requestKey: original.data.request_key, lifecycleState: "issued", storagePath: outcome.storagePath, fileName: outcome.fileName,
      finalSha256: outcome.finalSha256, fileSizeBytes: outcome.fileSizeBytes, downloadUrl: access.allows("reports.export") ? issuedFileUrl(issuanceId) : null,
      qr: outcome.qr, serialNo: outcome.serialNo, idempotentReplay: outcome.idempotentReplay, reissued: outcome.reissued, policy: original.data.policy_snapshot_json as EffectiveOutputPolicy };
  } catch (error) { return { success: false, blocked: "reconciliation_required", issuanceId, error: error instanceof Error ? error.message : "Original recovery could not be confirmed." }; }
}
