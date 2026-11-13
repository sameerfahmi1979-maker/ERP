import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, canUseApplication, hasPermission, hasPermissionInScope } from "@/lib/rbac/check";
import { createMobileSupabaseClient, withMobileToken } from "@/lib/supabase/mobile-request";
import { createClient } from "@/lib/supabase/server";
import { allowSecurityRequest } from "@/lib/auth/security-email";
import { loginSchema } from "@/lib/validation/auth";
import { readDmsDocumentPage } from "@/server/reads/dms-documents";
import { getDmsDocumentRecordData } from "@/server/actions/dms/documents";
import { readDmsUploadScopes } from "@/server/actions/dms/upload-scope";
import { searchDmsLinkEntityOptions } from "@/server/actions/dms/document-links";
import { getDmsDocumentTypes } from "@/server/actions/dms/document-types";
import { getMetadataDefinitionsForType } from "@/server/actions/dms/document-metadata-values";
import { acknowledgeDmsSingleUpload, createDmsUploadSession } from "@/server/actions/dms/upload-sessions";
import { singleUploadRequestSchema } from "@/lib/dms/single-upload-admission";
import { getAiIntakeSession, getIntakeSessionSignedUrl, startAiIntakeFromUploadSession } from "@/server/actions/dms/ai-intake";
import { prepareExactIntakeReview, confirmExactIntakeReview } from "@/server/actions/dms/intake-review";
import { intakeReviewConfirmationSchema } from "@/lib/dms/intake-review";
import { aiApprovalInputSchema } from "@/lib/dms/numbered-ai-approval";
import { approveNumberedAiIntake } from "@/server/numbered-ai-approval";
import { recoverNumberedAiApproval } from "@/server/dms-ai-approval-recovery";
import { DMS_CONFIDENTIALITY_LEVELS } from "@/features/dms/documents/dms-document-constants";
import { GET as deliverDocument } from "@/app/api/dms/file/route";

export const runtime = "nodejs";

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const page = z.number().int().min(1).max(100_000);
const text = z.string().trim().max(100);
const code = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const command = z.discriminatedUnion("op", [
  loginSchema.extend({ op: z.literal("login") }).strict(),
  z.strictObject({ op: z.literal("refresh"), refreshToken: z.string().min(1).max(4096) }),
  z.strictObject({ op: z.literal("logout") }),
  z.strictObject({ op: z.literal("profile") }),
  z.strictObject({ op: z.literal("documents"), search: z.string().trim().max(200), typeId: id.optional(), page }),
  z.strictObject({ op: z.literal("document"), id }),
  z.strictObject({ op: z.literal("scopes"), search: text, after: z.strictObject({ companyId: id, branchId: z.number().int().nonnegative() }).nullable() }),
  z.strictObject({ op: z.literal("records"), search: text, entityType: z.enum(["employee", "site"]) }),
  z.strictObject({ op: z.literal("admit"), request: singleUploadRequestSchema }),
  z.strictObject({ op: z.literal("complete"), request: singleUploadRequestSchema, sessionId: id }),
  z.strictObject({ op: z.literal("uploads"), beforeId: id.optional() }),
  z.strictObject({ op: z.literal("start"), sessionId: id }),
  z.strictObject({ op: z.literal("intake"), code }),
  z.strictObject({ op: z.literal("intakeFile"), sessionId: id }),
  z.strictObject({ op: z.literal("types") }),
  z.strictObject({ op: z.literal("fields"), typeId: id }),
  z.strictObject({ op: z.literal("verify"), sessionId: id, typeId: id, expiryDate: z.iso.date().nullable() }),
  z.strictObject({ op: z.literal("approve"), operationId: z.uuid(), input: aiApprovalInputSchema, review: intakeReviewConfirmationSchema }),
  z.strictObject({ op: z.literal("recoverApproval"), sessionId: id }),
]);
type Command = z.infer<typeof command>;

const headers = { "Cache-Control": "private, no-store", Vary: "Authorization", "X-Content-Type-Options": "nosniff" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
const ok = (data: unknown) => json({ success: true, data });
const fail = (error: string, status = 400) => json({ success: false, error }, status);
const bearer = (request: Request) => /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/i.exec(request.headers.get("Authorization")?.slice(0, 8193) ?? "")?.[1];

async function readCommand(request: Request) {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json" || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262_144) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return command.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))));
  } catch { return null; }
}

async function signIn(input: Extract<Command, { op: "login" | "refresh" }>) {
  const client = createMobileSupabaseClient();
  if (input.op === "login" && !await allowSecurityRequest("login", input.email)) return fail("Sign-in is temporarily unavailable.", 429);
  const response = input.op === "login"
    ? await client.auth.signInWithPassword({ email: input.email, password: input.password })
    : await client.auth.refreshSession({ refresh_token: input.refreshToken });
  const session = response.data.session;
  if (response.error || !session) return fail("Sign in with your ERP account.", 401);
  const ctx = await withMobileToken(session.access_token, getAuthContext);
  if (!canUseApplication(ctx)) {
    await client.auth.admin.signOut(session.access_token, "local");
    return fail("ERP access is unavailable. Check your account or complete the required password change on the ERP website.", 403);
  }
  return ok({ accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: session.expires_at, userId: session.user.id });
}

function approvalResponse(result: Awaited<ReturnType<typeof approveNumberedAiIntake>>) {
  return result.success ? ok(result.data) : json({ success: false, error: result.error,
    uncertain: result.uncertain === true, recoveryRequired: result.recoveryRequired === true, retryWithChanges: !!result.preparationRejected });
}

function admit(request: Extract<Command, { op: "admit" }>["request"]) {
  return createDmsUploadSession({ ...request.metadata, context: request.context ?? undefined, scope: request.scope },
    { operationId: request.operationId, authUserId: request.authUserId });
}

async function dispatch(input: Exclude<Command, { op: "login" | "refresh" }>, token: string) {
  const ctx = await getAuthContext();
  if (!ctx.profile) return fail("Your ERP session ended. Sign in again.", 401);
  if (!canUseApplication(ctx)) return fail("ERP access is unavailable for this account.", 403);
  const allowed = (p: string) => hasPermission(ctx, p) || hasPermission(ctx, "dms.admin");
  const capabilities = {
    view: allowed("dms.documents.view"), upload: allowed("dms.documents.upload"),
    preview: allowed("dms.documents.preview"), download: allowed("dms.documents.download"),
    review: allowed("dms.documents.review_ai"), numbering: hasPermission(ctx, "numbering.rules.generate"),
  };
  if (input.op === "logout") {
    const result = await createMobileSupabaseClient().auth.admin.signOut(token, "local");
    return result.error ? fail("Sign-out could not be confirmed.", 503) : ok(null);
  }
  if (input.op === "profile") return ok({ userId: ctx.profile.auth_user_id, name: ctx.profile.full_name, capabilities });
  if (["admit", "complete", "scopes", "start"].includes(input.op) && !capabilities.upload) return fail("Upload permission required.", 403);
  if (["uploads", "intake", "intakeFile", "types", "fields"].includes(input.op) && !capabilities.upload && !capabilities.review && !capabilities.view) {
    return fail("DMS permission required.", 403);
  }
  if (["verify", "approve", "recoverApproval"].includes(input.op) && (!capabilities.review || !capabilities.preview)) {
    return fail("Preview and AI review permission required.", 403);
  }
  switch (input.op) {
    case "documents": {
      const result = await readDmsDocumentPage({ page: input.page, pageSize: 25, filters: { search: input.search, document_type_id: input.typeId, excludeArchived: true } }, ctx);
      if (!result.success || !result.data) return fail(result.error ?? "Documents unavailable.", capabilities.view ? 503 : 403);
      return ok({ total: result.data.totalCount, rows: result.data.rows.map(row => ({ id: row.id, title: row.title, number: row.document_no, expiry: row.expiry_date, type: row.document_type?.name_en })) });
    }
    case "document": {
      const result = await getDmsDocumentRecordData(input.id);
      if (!result.success || !result.data) return fail("Document unavailable.", 404);
      const row = result.data;
      const client = await createClient();
      const [versions, files] = await Promise.all([
        client.from("dms_document_versions").select("id,version_number,version_label,is_current").eq("document_id", input.id).order("version_number", { ascending: false }).limit(100),
        client.from("dms_document_files").select("id,version_id,file_name,mime_type").eq("document_id", input.id).eq("file_role", "original").is("deleted_at", null).limit(100),
      ]);
      if (versions.error || files.error) return fail("Document versions are unavailable.", 503);
      return ok({ id: row.id, title: row.title, number: row.document_no, type: row.document_type?.name_en,
        issue: row.issue_date, expiry: row.expiry_date, description: row.description, status: row.status, versions: versions.data, files: files.data });
    }
    case "scopes": {
      const result = await readDmsUploadScopes(input.search, input.after);
      return result.success ? ok({ rows: result.rows, more: result.hasMore }) : fail(result.error, 503);
    }
    case "records": return json(await searchDmsLinkEntityOptions(input.entityType, input.search, 30));
    case "admit": {
      const request = input.request;
      if (request.authUserId !== ctx.profile.auth_user_id) return fail("This draft belongs to another account.", 403);
      const result = await admit(request);
      if (!result.success || !result.data) return json({ success: false, error: result.error, uncertain: result.uncertain, recovery: result.recovery, cancelled: result.cancelled });
      const { session, signedUrl, uploadRequired, isDuplicate } = result.data;
      return ok({ id: session.id, code: session.session_code, uploadUrl: uploadRequired ? signedUrl : null, duplicate: isDuplicate });
    }
    case "complete": {
      if (input.request.authUserId !== ctx.profile.auth_user_id) return fail("This draft belongs to another account.", 403);
      const acknowledged = await acknowledgeDmsSingleUpload(input.request, input.sessionId);
      if (acknowledged.success) return ok(null);
      const verified = await admit(input.request);
      if (!verified.success) return json({ success: false, error: verified.error, uncertain: verified.uncertain });
      if (!verified.data || verified.data.session.id !== input.sessionId || verified.data.uploadRequired) {
        return json({ success: false, error: "The original file transfer is unconfirmed. Retry the same upload.", uncertain: true });
      }
      return json(await acknowledgeDmsSingleUpload(input.request, input.sessionId));
    }
    case "uploads": {
      const client = await createClient();
      let query = client.from("dms_upload_sessions").select("id,session_code,intake_status,original_filename,document_id,uploaded_at")
        .is("deleted_at", null).is("batch_id", null).not("status", "in", "(cancelled,expired)").order("id", { ascending: false }).limit(31);
      if (!capabilities.review) query = query.eq("uploaded_by", ctx.profile.id);
      if (input.beforeId) query = query.lt("id", input.beforeId);
      const result = await query;
      if (result.error) return fail("Upload status unavailable.", 503);
      return ok({ rows: result.data.slice(0, 30), more: result.data.length > 30 });
    }
    case "start": {
      const result = await startAiIntakeFromUploadSession({ uploadSessionId: input.sessionId, onlyIfUploaded: true });
      return json({ success: result.success, data: result.data, uncertain: result.uncertain,
        error: result.success ? undefined : result.data?.status === "provider_not_configured" ? "AI is not configured for this ERP." : "AI start could not be confirmed. Refresh this upload before retrying." });
    }
    case "intake": {
      const client = await createClient();
      const { data: row, error } = await client.from("dms_upload_sessions")
        .select("id,session_code,status,intake_status,original_filename,mime_type,document_id,origin_entity_type,origin_entity_id,owning_company_id,owning_branch_id,uploaded_by,is_duplicate,ai_result_id,batch_draft_operation_id")
        .eq("session_code", input.code).is("deleted_at", null).is("batch_id", null).maybeSingle();
      if (error || !row) return fail("Intake unavailable or outside your access.", 404);
      const scoped = (p: string) => row.owning_company_id != null && (hasPermissionInScope(ctx, p, row.owning_company_id, row.owning_branch_id) || hasPermissionInScope(ctx, "dms.admin", row.owning_company_id, row.owning_branch_id));
      const canPreview = scoped("dms.documents.preview");
      const mayReview = canPreview && scoped("dms.documents.review_ai");
      if (row.uploaded_by !== ctx.profile.id && !mayReview) return fail("Intake unavailable or outside your access.", 404);
      const reviewReady = ["review_pending", "review_in_progress"].includes(row.intake_status);
      const detail = mayReview && reviewReady && !row.document_id ? await getAiIntakeSession(input.code) : null;
      const entityId = row.origin_entity_id;
      const entityType = row.origin_entity_type;
      let entityLabel: string | undefined;
      if (entityId && (entityType === "employee" || entityType === "site")) {
        const { data: entity } = await client.from(entityType === "employee" ? "employees" : "work_sites")
          .select(entityType === "employee" ? "full_name_en" : "site_name").eq("id", entityId).maybeSingle();
        if (entity && typeof entity === "object") {
          const name = (entity as Record<string, unknown>)[entityType === "employee" ? "full_name_en" : "site_name"];
          if (typeof name === "string") entityLabel = name;
        }
      }
      const ai = detail?.success ? detail.data?.ai_result : null;
      const canUpload = scoped("dms.documents.upload");
      const canApprove = mayReview && canUpload && scoped("dms.documents.edit") && scoped("dms.documents.view") && capabilities.numbering;
      const canStart = mayReview && canUpload && row.uploaded_by === ctx.profile.id && row.status === "uploaded" && row.intake_status === "uploaded" && !row.is_duplicate && !row.document_id && !row.ai_result_id && !row.batch_draft_operation_id;
      return ok({ id: row.id, code: row.session_code, status: row.intake_status, name: row.original_filename, mime: row.mime_type,
        documentId: row.document_id, entityType, entityId, entityLabel,
        canPreview, canStart, duplicate: row.is_duplicate, confidentialityLevels: DMS_CONFIDENTIALITY_LEVELS,
        canReview: canApprove && !!detail?.success && !row.document_id,
        ai: ai ? { id: ai.id, title: ai.suggested_title, description: ai.suggested_description, issue: ai.issue_date_suggestion,
          expiry: ai.expiry_date_suggestion, typeId: ai.suggested_document_type_id, fields: ai.extracted_fields_json } : null,
        draft: detail?.data?.draft_values?.map(v => ({ scope: v.field_scope, code: v.field_code, value: v.reviewed_value_json })) });
    }
    case "intakeFile": return json(await getIntakeSessionSignedUrl(input.sessionId));
    case "types": {
      const result = await getDmsDocumentTypes({ is_active: true });
      return result.success ? ok(result.data?.map(row => ({ id: row.id, label: row.name_en, expiryRequired: row.requires_expiry_tracking,
        confidentiality: row.default_confidentiality }))) : fail("Document types unavailable.", 503);
    }
    case "fields": {
      const result = await getMetadataDefinitionsForType(input.typeId, "intake");
      return result.success ? ok(result.data?.map(row => ({ id: row.id, code: row.field_code, label: row.field_label_en, type: row.field_type, required: row.is_required }))) : fail(result.error ?? "Review fields unavailable.", 403);
    }
    case "verify": return json(await prepareExactIntakeReview({ sessionId: input.sessionId, typeId: input.typeId, expiryDate: input.expiryDate }));
    case "recoverApproval": {
      const result = await recoverNumberedAiApproval(input.sessionId);
      if (!result.success) return fail(result.error, 403);
      if (!result.data) return ok(null);
      const retained = result.data;
      return approvalResponse(retained.receipt ? { success: true, data: retained.receipt } : await approveNumberedAiIntake(retained.input, retained.contract));
    }
    case "approve": {
      const { review, input: values, operationId } = input;
      if (values.prepared || values.owningCompanyId !== undefined || values.owningBranchId !== undefined || (values.allowDuplicate && !review.override) || review.documentId || review.sessionId !== values.uploadSessionId || review.typeId !== values.documentTypeId || review.expiryDate !== (values.expiryDate ?? null)) return fail("The approval and reviewed original must match.");
      const recovered = await recoverNumberedAiApproval(values.uploadSessionId);
      if (!recovered.success) return fail(recovered.error, 403);
      if (recovered.data) {
        if (recovered.data.contract.operationId !== operationId) return json({ success: false, recoveryRequired: true, error: "An earlier approval is retained. Use Recover approval." });
        return approvalResponse(recovered.data.receipt ? { success: true, data: recovered.data.receipt } : await approveNumberedAiIntake(recovered.data.input, recovered.data.contract));
      }
      const client = await createClient();
      const { data: source, error } = await client.from("dms_upload_sessions").select("owning_company_id,owning_branch_id,batch_id,document_id")
        .eq("id", values.uploadSessionId).is("deleted_at", null).maybeSingle();
      if (error) return fail("The original upload scope could not be checked. Retry the same approval.", 503);
      if (!source?.owning_company_id || source.batch_id || source.document_id) return fail("The original upload is unavailable.", 404);
      const checked = await confirmExactIntakeReview(review);
      if (!checked.success) return json({ ...checked, retryWithChanges: !("uncertain" in checked && checked.uncertain) });
      const contract = { operationId, revision: null };
      const scopedValues = { ...values, owningCompanyId: source.owning_company_id, owningBranchId: source.owning_branch_id };
      const prepared = await approveNumberedAiIntake(scopedValues, contract);
      if (prepared.success || !prepared.prepared) return approvalResponse(prepared);
      return approvalResponse(await approveNumberedAiIntake({ ...scopedValues, prepared: prepared.prepared.snapshot }, contract));
    }
  }
}

export async function POST(request: Request) {
  try {
    const parsed = await readCommand(request);
    if (!parsed?.success) return fail("Invalid Mobile DMS request.");
    if (parsed.data.op === "login" || parsed.data.op === "refresh") return await signIn(parsed.data);
    const token = bearer(request);
    if (!token) return fail("Sign in with your ERP account.", 401);
    const data = parsed.data;
    return await withMobileToken(token, () => dispatch(data, token));
  } catch { return fail("Mobile DMS is temporarily unavailable. Retry the same request.", 503); }
}

export async function GET(request: NextRequest) {
  const token = bearer(request);
  if (!token) return fail("Sign in with your ERP account.", 401);
  return withMobileToken(token, () => deliverDocument(request));
}
