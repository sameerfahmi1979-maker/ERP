import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderOfficialHtmlToPdf } from "./html-adapter";
import { readValidatedPdfResponse } from "@/lib/pdf/validate-response";
import { hashFinalPdfBytes } from "./idempotency";
import { attestStoredOutput, activateVerifiedOutput } from "./verified-original";
import { buildVerificationUrl } from "@/lib/public-verification/token";
import { generateQrDataUrl } from "@/lib/public-verification/qr";
import { buildRetainedRenderPlan, assertRecoveryReady, renderPlanSchema, type RecoveryDocument } from "./recovery-plan";
import type { GenerateOfficialDocumentOptions, QrOutcome } from "./types";
import type { RunIssuanceOutcome } from "./issuance-engine";
const claimSchema = z.object({ id: z.number().int().positive(), actorId: z.number().int().positive(), sessionId: z.string().uuid(), leaseId: z.string().uuid() });
const retainedSchema = z.object({ document: z.object({ id: z.number(), lifecycle_state: z.string(), storage_path: z.string().min(1), file_name: z.string().min(1), checksum: z.string(), file_size_bytes: z.number().nullable(), serial_no: z.string().nullable(), output_code: z.string(), source_record_id: z.number(), supersedes_issuance_id: z.number().int().positive().nullable(), template_id: z.number().nullable(), generated_at: z.string(), data_snapshot_json: z.record(z.string(), z.unknown()), branding_snapshot_json: z.unknown(), policy_snapshot_json: z.unknown() }),
  plan: renderPlanSchema.nullable(), pdf: z.string().nullable(), sha: z.string().nullable(), size: z.number().nullable(), renderer: z.string().nullable(), link: z.object({ id: z.number().int().positive(), token: z.string(), status: z.string() }).nullable() });
export function issuanceCommandHash(options: GenerateOfficialDocumentOptions): string {
  return createHash("sha256").update(JSON.stringify([options.templateId ?? null, options.language ?? "en", !!options.issueQr, !!options.authorizeReissue,
    options.supersedesIssuanceId ?? null, options.reissueReason?.trim() ?? null, Object.entries(options.inputs ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, value.trim()])])).digest("hex");
}
/** One bounded original operation. Persisted render input and exact cached PDF
 * precede external rendering/upload respectively. No new issuance or serial is
 * allocated on resume, and the server never overwrites a canonical object. */
export async function recoverDurableOutput(issuanceId: number): Promise<RunIssuanceOutcome> {
  const session = await createClient(), admin = createAdminClient(), leaseId = randomUUID();
  let claimed = false;
  async function renew() {
    const response = await session.rpc("f08_claim_operation", { p_id: issuanceId, p_lease: leaseId });
    const lease = claimSchema.safeParse(response.data);
    if (response.error || !lease.success || lease.data.id !== issuanceId || lease.data.leaseId !== leaseId) throw Error("Original request is busy, inaccessible or requires reconciliation. Retry the same request; do not create a new one.");
    claimed = true; return lease.data;
  }
  try {
    const lease = await renew();
    const args = { p_id: issuanceId, p_lease: leaseId, p_actor: lease.actorId, p_session: lease.sessionId };
    const read = await admin.rpc("f08_read_operation", args), accepted = retainedSchema.safeParse(read.data);
    if (read.error || !accepted.success) throw Error("Original recovery checkpoint is unavailable.");
    const state = accepted.data, doc = state.document as RecoveryDocument;
    assertRecoveryReady(doc);
    let sha = state.sha, size = state.size, renderer = state.renderer;
    if (doc.lifecycle_state !== "issued") {
      let bytes: Buffer;
      if (state.pdf !== null) {
        bytes = Buffer.from(state.pdf, "base64");
        if (!sha || !size || !renderer || bytes.length !== size || hashFinalPdfBytes(bytes) !== sha) throw Error("Original rendered checkpoint integrity failed.");
      } else {
        if (sha) throw Error("Original checkpoint bytes are missing; automatic re-render is unsafe.");
        const verification = state.link ? { publicUrl: buildVerificationUrl(state.link.token), qrDataUrl: (await generateQrDataUrl(buildVerificationUrl(state.link.token)))! } : undefined;
        const plan = state.plan ?? await buildRetainedRenderPlan(doc, verification);
        if (!state.plan) {
          await renew(); const frozen = await admin.rpc("f08_checkpoint_operation", { ...args, p_plan: plan });
          if (frozen.error || frozen.data?.id !== issuanceId) throw Error("Render-plan checkpoint was not confirmed. The original request is retained.");
        }
        await renew();
        const rendered = await renderOfficialHtmlToPdf(plan);
        bytes = rendered.buffer; sha = hashFinalPdfBytes(bytes); size = bytes.length;
        renderer = `f08-layout@${plan.layoutVersion}/${rendered.rendererVersion}`;
        await renew(); const stored = await admin.rpc("f08_checkpoint_operation", { ...args, p_pdf: bytes.toString("base64"), p_renderer: renderer });
        if (stored.error || stored.data?.id !== issuanceId) throw Error("Rendered-byte checkpoint was not confirmed. Retry the original request before uploading.");
      }
      // Also validate recovered cache bytes, not merely a digest/HTTP success.
      await readValidatedPdfResponse(new Response(new Uint8Array(bytes), { headers: { "content-type": "application/pdf" } }));
      await renew();
      const storage = admin.storage.from("erp-generated-pdfs"), info = await storage.info(doc.storage_path);
      if (info.error) {
        const missing = String((info.error as { statusCode?: string | number }).statusCode) === "404";
        if (!missing) throw Error("Storage outcome is unknown; no blind upload was attempted.");
        await renew();
        const upload = await storage.upload(doc.storage_path, bytes, { contentType: "application/pdf", upsert: false });
        // Whether this response succeeds or is lost, exact-byte reconciliation
        // below decides the result. Never remove/replace an existing object.
        if (upload.error && String((upload.error as { statusCode?: string | number }).statusCode) !== "409") {
          const observed = await storage.info(doc.storage_path);
          if (observed.error) throw Error("Upload outcome is unconfirmed. The original bytes and request remain recoverable.");
        }
      }
      await renew();
      await attestStoredOutput({ issuanceId, expectedSha256: sha!, rendererVersion: renderer! });
      await renew();
      const issued = await session.rpc("f08_finish_operation", { p_id: issuanceId, p_lease: leaseId, p_sha: sha });
      if (issued.error || issued.data?.id !== issuanceId) throw Error("Finalization outcome is unconfirmed. Retry this original request to reconcile it.");
    } else {
      sha = doc.checksum; size = doc.file_size_bytes;
      if (!/^[a-f0-9]{64}$/.test(sha) || !Number.isSafeInteger(size) || !size || (doc.policy_snapshot_json.requiresSerial && !doc.serial_no)) throw Error("Issued original metadata requires reconciliation.");
    }
    let qr: QrOutcome = { status: "not_requested" };
    if (state.link) {
      try { await renew(); await activateVerifiedOutput(state.link.id); qr = { status: "activated", linkId: state.link.id, publicUrl: buildVerificationUrl(state.link.token) }; }
      catch { qr = { status: "activation_failed_retryable", error: "Original is issued; verification activation needs recovery." }; }
    }
    return { kind: "issued", issuanceId, finalSha256: sha!, fileSizeBytes: size!, serialNo: doc.serial_no,
      storagePath: doc.storage_path, fileName: doc.file_name, reissued: doc.supersedes_issuance_id !== null, idempotentReplay: doc.lifecycle_state === "issued", qr };
  } catch (error) {
    return { kind: "reconciliation_required", issuanceId, error: error instanceof Error ? error.message : "Original request requires recovery." };
  } finally {
    if (claimed) {
      // Unknown acknowledgement never means "cancel and generate a replacement".
      try { await session.rpc("f08_end_operation", { p_id: issuanceId, p_lease: leaseId, p_cancel: false }); } catch { /* lease expiry fences abandoned requests */ }
    }
  }
}
