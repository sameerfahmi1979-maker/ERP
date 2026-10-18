import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashFinalPdfBytes } from "./idempotency";
import { MAX_RENDERED_PDF_BYTES } from "@/lib/pdf/validate-response";

const identity = z.object({ id: z.string().uuid(), version: z.string().min(1), lastModified: z.string().datetime({ offset: true }) });
const actor = z.object({ actorId: z.number().int().positive(), authSessionId: z.string().uuid() });

/** Service-only attestation follows an authenticated, current-scope actor check.
 * The exact object is observed before and after downloading; neither a Storage
 * success flag nor caller-supplied checksum is treated as original-byte proof.
 */
export async function attestStoredOutput(input: { issuanceId: number; expectedSha256: string; rendererVersion: string }): Promise<Buffer> {
  const session = await createClient();
  const plan = await session.rpc("f08_output_actor", { p_id: input.issuanceId });
  const principal = actor.safeParse(plan.data);
  if (plan.error || !principal.success) throw new Error("Current issuance authority could not be verified.");
  const admin = createAdminClient();
  const original = await admin.from("erp_generated_pdf_documents").select("storage_path,generated_by").eq("id", input.issuanceId).single();
  if (original.error || !original.data || original.data.generated_by !== principal.data.actorId) throw new Error("Retained original identity is unavailable.");
  const storage = admin.storage.from("erp-generated-pdfs");
  const before = await storage.info(original.data.storage_path), first = identity.safeParse(before.data);
  if (before.error || !first.success) throw new Error("Original Storage identity is unavailable.");
  const file = await storage.download(original.data.storage_path);
  if (file.error || !file.data || file.data.size < 1 || file.data.size > MAX_RENDERED_PDF_BYTES) throw new Error("Original bytes are unavailable or exceed the accepted bounds.");
  const bytes = Buffer.from(await file.data.arrayBuffer());
  const digest = hashFinalPdfBytes(bytes);
  if (digest !== input.expectedSha256) throw new Error("Original bytes do not match the retained rendering.");
  const after = await storage.info(original.data.storage_path), last = identity.safeParse(after.data);
  if (after.error || !last.success || JSON.stringify(first.data) !== JSON.stringify(last.data)) throw new Error("Original changed during verification.");
  const proof = await admin.rpc("f08_attest_pdf", {
    p_id: input.issuanceId, p_actor: principal.data.actorId, p_session: principal.data.authSessionId,
    p_object: last.data.id, p_version: last.data.version, p_updated: new Date(last.data.lastModified).toISOString(),
    p_sha: digest, p_size: bytes.length, p_renderer: input.rendererVersion,
  });
  if (proof.error) throw new Error("Original-byte verification was not confirmed. Retain this issuance for recovery.");
  return bytes;
}

export async function finalizeVerifiedOutput(issuanceId: number, checksum: string): Promise<void> {
  const result = await (await createClient()).rpc("f08_finalize_output", { p_id: issuanceId, p_sha: checksum });
  if (result.error || result.data?.id !== issuanceId) throw new Error("Finalization was not confirmed. Reconcile the original request; do not generate a replacement.");
}

export async function activateVerifiedOutput(linkId: number): Promise<void> {
  const result = await (await createClient()).rpc("f08_activate_output", { p_link: linkId });
  if (result.error || result.data?.id !== linkId) throw new Error("Verification activation was not confirmed. Review the retained link status.");
}
