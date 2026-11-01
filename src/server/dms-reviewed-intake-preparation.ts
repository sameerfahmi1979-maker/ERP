import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentJobClaim } from "@/lib/dms/ai-jobs/claim-scope";
import { preparationHash, preparationId } from "@/lib/dms/preparation/contracts";

const preparedSchema = z.object({ version: z.literal(1), sourceHash: preparationHash, typeCode: z.string().nullable(), summary: z.string().max(8000).nullable(), tagNames: z.array(z.string().max(100)).max(30), semantic: z.enum(["not_applicable", "pending_accepted_review"]) }).passthrough();
/** Reuse only a human-accepted result tied to this exact retained source and current version. */
export async function readReviewedIntakePreparation(documentId: number, uploadSessionId: number) {
  const claim = currentJobClaim(); if (!claim) throw Error("Reviewed preparation requires the original worker claim.");
  const db = createAdminClient();
  const assert = async () => { const r = await db.rpc("f07_ai_worker", { p_action: "assert", p_data: { jobId: claim.jobId, token: claim.token } }); if (r.error || r.data?.success !== true) throw Error("Preparation source authority changed."); };
  await assert();
  const s = await db.from("dms_upload_sessions").select("id,document_id,ai_result_id,intake_status").eq("id", uploadSessionId).maybeSingle();
  if (s.error) throw Error("Reviewed preparation source unavailable.");
  if (!s.data?.ai_result_id) return null; // Historical intake, using the existing path.
  const r = await db.from("dms_ai_extraction_results").select("id,job_id,document_id,upload_session_id,ai_status,review_action,reviewed_by,raw_response_json,raw_ocr_text").eq("id", s.data.ai_result_id).maybeSingle();
  if (r.error || !r.data) throw Error("Reviewed preparation result unavailable.");
  const raw = r.data.raw_response_json as Record<string, unknown> | null;
  if (!raw?.preparation) return null;
  const prepared = preparedSchema.parse(raw.preparation);
  if (s.data.document_id !== documentId || s.data.intake_status !== "approved" || r.data.document_id !== documentId || r.data.upload_session_id !== uploadSessionId || r.data.ai_status !== "accepted" || r.data.review_action !== "accepted" || !preparationId.safeParse(r.data.reviewed_by).success) throw Error("Preparation still requires accepted human review.");
  const d = await db.from("dms_documents").select("id,current_version_id,document_type_id").eq("id", documentId).is("deleted_at", null).maybeSingle();
  if (d.error || !d.data?.current_version_id) throw Error("Preparation document version unavailable.");
  const [type, files, job] = await Promise.all([
    db.from("dms_document_types").select("type_code").eq("id", d.data.document_type_id).is("deleted_at", null).maybeSingle(),
    db.from("dms_document_files").select("id").eq("document_id", documentId).eq("version_id", d.data.current_version_id).eq("sha256_hash", prepared.sourceHash).eq("file_role", "original").is("deleted_at", null).limit(2),
    db.from("dms_ai_extraction_jobs").select("model,provider,prompt_version").eq("id", r.data.job_id).maybeSingle(),
  ]);
  if (type.error || type.data?.type_code !== prepared.typeCode || files.error || files.data?.length !== 1 || job.error || !job.data) throw Error("Reviewed preparation no longer matches the selected type or original.");
  await assert();
  return { ...prepared, model: job.data.model as string | null, provider: job.data.provider as string | null, promptVersion: job.data.prompt_version as string | null, inputCharacters: (r.data.raw_ocr_text as string | null)?.length ?? 0,
    portrait: ["EMPLOYEE_PHOTO", "DEPENDENT_PHOTO"].includes(type.data.type_code) };
}
