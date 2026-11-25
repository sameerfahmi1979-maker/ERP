import { createHash } from "node:crypto";
import { z } from "zod";
import { withMobileToken } from "@/lib/supabase/mobile-request";
import { createClient } from "@/lib/supabase/server";
import { extractFileContent } from "@/lib/dms/file-content-extractor";
import { readMohreEmploymentEmployer } from "@/lib/dms/ai/mohre-employment-contract";
import { createAdminClient } from "@/lib/supabase/admin";
import { readVerifiedIntakeSource } from "@/server/dms-verified-intake-source";
import { analyzeSharePointWorkPermit } from "@/server/dms-sharepoint-worker-ai";

export const runtime = "nodejs";

const maxPdfBytes = 3 * 1024 * 1024;
const maxBase64Length = 4 * Math.ceil(maxPdfBytes / 3);
const maxBodyBytes = maxBase64Length + 1024;
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const scope = { operationId: z.uuid(), sessionId: id, sharePointLease: z.uuid() };
const reviewCommands = [
  z.strictObject({ op: z.literal("stageSharePoint"), ...scope, pdfBase64: z.string().min(4).max(maxBase64Length) }),
  z.strictObject({ op: z.literal("reviewSharePoint"), ...scope }),
] as const;
const commandSchema = z.discriminatedUnion("op", [
  ...reviewCommands,
  z.strictObject({
    op: z.literal("routeEmployer"), operationId: z.uuid(), sharePointLease: z.uuid(),
    sha256, byteCount: id.max(maxPdfBytes), pdfBase64: z.string().min(4).max(maxBase64Length),
  }),
]);
type ReviewCommand = z.infer<(typeof reviewCommands)[number]>;

const identity = z.object({ operationId: z.uuid(), sessionId: id });
const sourceSchema = identity.extend({
  actorId: id,
  authSessionId: z.uuid(),
  companyId: id,
  branchId: id,
  state: z.enum(["uploading", "staged", "processing", "review_pending"]),
  path: z.string().regex(/^sessions\/[A-Za-z0-9_-]+\/[-A-Za-z0-9_.]{1,200}$/),
  filename: z.string().min(1).max(500),
  sha256,
  byteCount: id.max(maxPdfBytes),
});
const stageSchema = identity.extend({
  state: z.enum(["staged", "processing", "review_pending"]),
  sha256,
  byteCount: id.max(maxPdfBytes),
});
const claimSchema = sourceSchema.extend({
  state: z.literal("processing"),
  attemptId: z.uuid(),
  processingRevision: z.iso.datetime({ offset: true }),
  started: z.boolean(),
});
const reservationSchema = identity.extend({
  attemptId: z.uuid(),
  processingRevision: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
});
const receiptSchema = identity.extend({
  state: z.literal("review_pending"),
  resultId: id,
  reviewId: id,
  notificationEventId: id,
});

function respond(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function unavailable(status: number) {
  return respond({ success: false, error: "The SharePoint intake could not advance. Recover the same operation." }, status);
}

function blockedBy(error: { code?: string } | null) {
  if (error?.code === "42501") return unavailable(403);
  if (["55000", "PT409", "55P03"].includes(error?.code ?? "")) return unavailable(409);
  return unavailable(503);
}

class ProviderReservationDenied extends Error {
  constructor(readonly response: Response) {
    super("SharePoint provider reservation unavailable.");
  }
}

async function readCommand(request: Request) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBodyBytes)) return null;
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return commandSchema.safeParse(JSON.parse(Buffer.concat(chunks, size).toString("utf8")));
  } finally {
    reader.releaseLock();
  }
}

function exact(candidate: z.infer<typeof identity>, input: ReviewCommand) {
  return candidate.operationId === input.operationId && candidate.sessionId === input.sessionId;
}

async function advance(input: ReviewCommand, token: string) {
  const client = await createClient();
  const user = await client.auth.getUser(token);
  if (user.error || !user.data.user) return unavailable(401);

  const reference = { p_operation: input.operationId, p_session: input.sessionId, p_lease: input.sharePointLease };
  const prepared = await client.rpc("f07_prepare_sharepoint_worker_pdf", reference).retry(false);
  if (prepared.error) return blockedBy(prepared.error);
  const parsed = sourceSchema.safeParse(prepared.data);
  if (!parsed.success || !exact(parsed.data, input)) return unavailable(409);
  const plan = parsed.data;

  if (plan.state === "review_pending" && input.op === "reviewSharePoint") {
    const receipt = receiptSchema.safeParse(prepared.data);
    if (!receipt.success) return unavailable(503);
    return respond({ success: true, data: receipt.data });
  }

  const original = { path: plan.path, name: plan.filename, mime: "application/pdf", sha256: plan.sha256, size: plan.byteCount };
  const authority = { ...reference, p_actor: plan.actorId, p_auth_session: plan.authSessionId };
  const admin = createAdminClient();
  const storage = admin.storage.from("dms-temp");

  if (input.op === "stageSharePoint") {
    const bytes = Buffer.from(input.pdfBase64, "base64");
    if (bytes.byteLength !== plan.byteCount || bytes.toString("base64") !== input.pdfBase64 ||
        createHash("sha256").update(bytes).digest("hex") !== plan.sha256 ||
        !bytes.subarray(0, 1024).includes("%PDF-")) return unavailable(422);
    if (plan.state === "review_pending") {
      return respond({ success: true, data: stageSchema.parse(plan) });
    }

    // An existing object or an uncertain PUT is reconciled by retrieving and hashing
    // the immutable original. Only the native transaction can accept those bytes.
    await storage.upload(plan.path, bytes, { upsert: false, contentType: original.mime }).catch(() => null);
    const verified = await readVerifiedIntakeSource(storage, original);
    const accepted = await admin.rpc("f07_accept_sharepoint_worker_pdf", {
      ...authority, p_object: verified.object.id, p_version: verified.object.version,
      p_updated: verified.object.lastModified,
    }).retry(false);
    if (accepted.error) return blockedBy(accepted.error);
    const stage = stageSchema.safeParse(accepted.data);
    if (!stage.success || !exact(stage.data, input) ||
        stage.data.sha256 !== plan.sha256 || stage.data.byteCount !== plan.byteCount) return unavailable(503);
    return respond({ success: true, data: stage.data });
  }

  if (plan.state === "uploading") return unavailable(409);
  const verified = await readVerifiedIntakeSource(storage, original);
  const workerClaim = await admin.rpc("f07_claim_sharepoint_worker_review", authority).retry(false);
  if (workerClaim.error) return blockedBy(workerClaim.error);
  const retained = receiptSchema.safeParse(workerClaim.data);
  if (retained.success && exact(retained.data, input)) return respond({ success: true, data: retained.data });
  const claim = claimSchema.safeParse(workerClaim.data);
  if (!claim.success || !exact(claim.data, input) || !claim.data.started ||
      claim.data.path !== plan.path || claim.data.sha256 !== plan.sha256 ||
      claim.data.filename !== plan.filename || claim.data.byteCount !== plan.byteCount ||
      claim.data.actorId !== plan.actorId || claim.data.authSessionId !== plan.authSessionId ||
      claim.data.companyId !== plan.companyId || claim.data.branchId !== plan.branchId) return unavailable(409);

  const attempt = { ...authority, p_attempt: claim.data.attemptId, p_claim_at: claim.data.processingRevision };
  const output = await analyzeSharePointWorkPermit({
    client, bytes: verified.bytes, filename: plan.filename, sha256: plan.sha256,
    reserveProviderAttempt: async pin => {
      const reserved = await admin.rpc("f07_reserve_sharepoint_worker_provider_attempt", {
        ...attempt, p_provider: pin.provider, p_config: pin.configId, p_config_updated_at: pin.configUpdatedAt,
        p_model: pin.model, p_prompt: pin.promptVersion,
      }).retry(false);
      if (reserved.error) throw new ProviderReservationDenied(blockedBy(reserved.error));
      const permit = reservationSchema.safeParse(reserved.data);
      if (!permit.success || !exact(permit.data, input) || permit.data.attemptId !== attempt.p_attempt ||
          permit.data.processingRevision !== attempt.p_claim_at) throw new ProviderReservationDenied(unavailable(503));
      if (Date.parse(permit.data.expiresAt) <= Date.now()) throw new ProviderReservationDenied(unavailable(409));
    },
  });
  const published = await admin.rpc("f07_publish_sharepoint_worker_review", {
    ...attempt, p_output: output,
  }).retry(false);
  if (published.error) return blockedBy(published.error);
  const receipt = receiptSchema.safeParse(published.data);
  if (!receipt.success || !exact(receipt.data, input)) return unavailable(503);
  return respond({ success: true, data: receipt.data });
}

const employerDecision = z.discriminatedUnion("status", [
  z.object({ status: z.literal("inspect") }),
  z.object({ status: z.literal("held") }),
  z.object({ status: z.literal("bound"), companyId: id }),
]);

async function routeEmployer(input: Extract<z.infer<typeof commandSchema>, { op: "routeEmployer" }>, token: string) {
  const client = await createClient();
  const user = await client.auth.getUser(token);
  if (user.error || !user.data.user) return unavailable(401);

  const bytes = Buffer.from(input.pdfBase64, "base64");
  if (bytes.byteLength !== input.byteCount || bytes.toString("base64") !== input.pdfBase64 ||
      createHash("sha256").update(bytes).digest("hex") !== input.sha256 ||
      !bytes.subarray(0, 1024).includes("%PDF-")) return unavailable(422);

  const admin = createAdminClient();
  const binding = {
    p_operation: input.operationId, p_lease: input.sharePointLease, p_user: user.data.user.id,
    p_hash: input.sha256, p_bytes: input.byteCount,
  };
  const before = await admin.rpc("dms_route_sharepoint_employer", {
    ...binding, p_kind: "inspect", p_company_name: null,
  }).retry(false);
  if (before.error) return blockedBy(before.error);
  const retained = employerDecision.safeParse(before.data);
  if (!retained.success) return unavailable(503);
  if (retained.data.status !== "inspect") return respond({ success: true, data: retained.data });

  const extracted = await extractFileContent(bytes, "application/pdf", "source.pdf", { skipPdfPageRendering: true });
  const employer = readMohreEmploymentEmployer(extracted.text);
  const decision = await admin.rpc("dms_route_sharepoint_employer", {
    ...binding, p_kind: employer.kind, p_company_name: employer.kind === "employer" ? employer.name : null,
  }).retry(false);
  if (decision.error) return blockedBy(decision.error);
  const resolved = employerDecision.safeParse(decision.data);
  if (!resolved.success || resolved.data.status === "inspect") return unavailable(503);
  return respond({ success: true, data: resolved.data });
}

export async function POST(request: Request) {
  const workerReviewEnabled = process.env.DMS_AGENT_CENTER_SHAREPOINT_FLOW === "1";
  const employerRoutingEnabled = process.env.DMS_SHAREPOINT_EMPLOYER_ROUTING === "1";
  if (!workerReviewEnabled && !employerRoutingEnabled) return unavailable(404);
  const token = /^Bearer ([A-Za-z0-9_.-]{1,8192})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return unavailable(401);
  let parsed;
  try {
    parsed = await readCommand(request);
  } catch {
    return unavailable(400);
  }
  if (!parsed?.success) return unavailable(400);
  try {
    const input = parsed.data;
    if (input.op === "routeEmployer") {
      return employerRoutingEnabled
        ? await withMobileToken(token, () => routeEmployer(input, token))
        : unavailable(404);
    }
    return workerReviewEnabled ? await withMobileToken(token, () => advance(input, token)) : unavailable(404);
  } catch (error) {
    return error instanceof ProviderReservationDenied ? error.response : unavailable(503);
  }
}
