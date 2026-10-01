"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getAuthContext, getAuthContextForProfileId, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import { eligibleApprovalRecipient } from "@/lib/dms/approval-notification-recipient";
import { hasGlobalPermission } from "@/lib/rbac/scope";
import { assertInternalActionUrl } from "@/lib/security/action-url";

// ── Result type (matches project pattern) ─────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Revalidation paths ────────────────────────────────────────────────────────

const PATHS = {
  dmsDocuments: "/dms/documents",
  dmsApprovals: "/dms/approvals",
  notifications: "/notifications",
  docRecord: (id: number) => `/dms/documents/record/${id}`,
};

// ── Validation schemas ─────────────────────────────────────────────────────────

const positiveInt = z.number().int().positive();

const submitSchema = z.object({
  comment: z.string().max(2000).optional(),
});

const approveSchema = z.object({
  comment: z.string().max(2000).optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(5, "Rejection reason must be at least 5 characters").max(2000),
  comment: z.string().max(2000).optional(),
});

const withdrawSchema = z.object({
  reason: z.string().max(2000).optional(),
});

const listFiltersSchema = z.object({
  status: z.enum(["pending_approval", "approved", "rejected", "withdrawn", "all"]).optional(),
  documentTypeId: positiveInt.optional(),
  search: z.string().max(200).trim().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["submitted_at", "document_no", "title"]).default("submitted_at"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

const workflowCreateSchema = z.object({
  workflow_code: z.string().min(1).max(100).regex(/^[A-Z0-9_]+$/, "Code must be uppercase letters, digits, or underscores"),
  name_en: z.string().min(1).max(200),
  name_ar: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  document_type_ids: z.array(positiveInt).optional(),
  steps: z.array(z.object({
    step_code: z.string().min(1).max(100),
    step_name: z.string().min(1).max(200),
    is_initial: z.boolean().default(false),
    is_final: z.boolean().default(false),
    requires_role: z.string().max(100).optional(),
    sort_order: z.number().int().min(0),
  })).optional(),
});

const workflowUpdateSchema = workflowCreateSchema.partial().extend({
  expected_updated_at: z.string().datetime({ offset: true }).optional(),
  is_active: z.boolean().optional(),
});

// ── Permission helpers ────────────────────────────────────────────────────────

type AuthCtx = Awaited<ReturnType<typeof getAuthContext>>;

function canSubmit(ctx: AuthCtx) {
  return hasPermission(ctx, "dms.approvals.submit") ||
    hasPermission(ctx, "dms.documents.edit") ||
    hasPermission(ctx, "dms.admin");
}

function canAct(ctx: AuthCtx) {
  return hasPermission(ctx, "dms.approvals.act") ||
    hasPermission(ctx, "dms.documents.approve") ||
    hasPermission(ctx, "dms.approvals.admin") ||
    hasPermission(ctx, "dms.admin");
}

function canWithdraw(ctx: AuthCtx) {
  return hasPermission(ctx, "dms.approvals.withdraw") ||
    hasPermission(ctx, "dms.admin");
}

function canViewApprovals(ctx: AuthCtx) {
  return hasPermission(ctx, "dms.approvals.view") ||
    hasPermission(ctx, "dms.approvals.admin") ||
    hasPermission(ctx, "dms.approvals.history.view") ||
    hasPermission(ctx, "dms.approvals.act") ||
    hasPermission(ctx, "dms.documents.approve") ||
    hasPermission(ctx, "dms.admin");
}

function isDmsAdmin(ctx: AuthCtx) {
  return hasPermission(ctx, "dms.admin") ||
    hasPermission(ctx, "dms.approvals.admin");
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Insert an in-app notification directly into erp_notifications.
 * Uses admin client to bypass RLS restrictions on the notifications table.
 */
async function sendApprovalNotification(opts: {
  documentId: number;
  documentNo: string;
  title: string;
  documentType: string;
  actorName: string;
  notificationType: string;
  notificationCode: string;
  severity: "info" | "warning" | "urgent";
  channelEmail: boolean;
  recipientUserId: number;
  actionLabel: string;
  commentsOrReason?: string;
  createdBy: number | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const {data: subject,error: subjectError} = await admin.from("dms_documents").select("owning_company_id,owning_branch_id,confidentiality_level").eq("id",opts.documentId).is("deleted_at",null).maybeSingle();
    if (subjectError || !subject || !eligibleApprovalRecipient(await getAuthContextForProfileId(opts.recipientUserId), subject, null, false)) return;
    const now = new Date().toISOString();
    const actionUrl = assertInternalActionUrl(PATHS.docRecord(opts.documentId), PATHS.dmsApprovals);
    // Email/in-app previews deliberately contain no document title, number,
    // employee details, comments or reasons. Linked-subject access can change
    // before delivery; the protected ERP destination is authoritative.
    const message = opts.notificationCode === "DMS_APPROVAL_REQUESTED"
      ? {title:"Document approval requires review",body:"An approval step may require your review. Open the ERP approval queue to see documents currently available to you."}
      : {title:"Document approval updated",body:"A document approval has been updated. Open the ERP to see its current status, subject to your current access."};

    const { error: notificationError } = await admin.from("erp_notifications").insert({
      notification_code: opts.notificationCode,
      source_module: "DMS",
      source_entity_type: "dms_documents",
      source_entity_id: opts.documentId,
      notification_type: opts.notificationType,
      severity: opts.severity,
      title: message.title,
      message: message.body,
      recipient_user_id: opts.recipientUserId,
      channel_in_app: true,
      channel_email: opts.channelEmail,
      status: "unread",
      scheduled_for: now,
      action_url: actionUrl,
      action_label: opts.actionLabel,
      created_by: opts.createdBy,
      created_at: now,
      updated_at: now,
    });
    if (notificationError) logger.error("Approval notification was not queued", { code: notificationError.code });
  } catch (err) {
    logger.error("sendApprovalNotification failed — non-fatal", err);
  }
}

async function resolveApproverUserIds(admin: Awaited<ReturnType<typeof createAdminClient>>, documentId:number, requiresRole:string|null):Promise<number[]> {
  const {data:doc,error} = await admin.from("dms_documents").select("owning_company_id,owning_branch_id,confidentiality_level").eq("id",documentId).is("deleted_at",null).maybeSingle();
  if(error || !doc) return [];
  const {data:assignments,error:assignmentError} = await admin.from("user_roles").select("user_profile_id").eq("is_active",true)
    .or(doc.owning_company_id === null ? "and(owner_company_id.is.null,branch_id.is.null)" : "and(owner_company_id.is.null,branch_id.is.null),owner_company_id.eq."+doc.owning_company_id);
  if(assignmentError) return [];
  const eligible:number[]=[];
  for(const id of new Set((assignments??[]).map(row=>row.user_profile_id).filter((id):id is number=>typeof id==="number"))) {
    try { if(eligibleApprovalRecipient(await getAuthContextForProfileId(id),doc,requiresRole,true)) eligible.push(id); }
    catch { /* A disabled/removed recipient must not fail an already committed decision. */ }
  }
  return eligible;
}

type ApprovalTransition = { approvalId: number; approvalStatus: string; pending: boolean; requiresRole: string | null };
async function transitionApproval(documentId:number, approvalId:number|null, operation:string, comment?:string, reason?:string):Promise<ActionResult<ApprovalTransition>> {
  const supabase = await createClient();
  const {data,error} = await supabase.rpc("f05_transition_document_approval", {document_id:documentId,approval_id:approvalId,operation,comment_text:comment??null,reason_text:reason??null});
  if (error) return {success:false,error:error.code==="PT409" ? "The approval changed. Refresh before taking another action." : error.code==="55000" ? "The workflow needs administrator review before this action can continue." : "The approval action was not completed. Check your access and refresh the document."};
  return {success:true,data:data as ApprovalTransition};
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type ApprovalState = {
  documentId: number;
  documentNo: string;
  title: string;
  documentTypeId: number | null;
  documentTypeName: string | null;
  documentStatus: string;
  approvalStatus: string | null;
  submittedBy: number | null;
  submittedByName: string | null;
  submittedAt: string | null;
  currentApprovalId: number | null;
  currentApprovalAction: string | null;
  currentWorkflowId: number | null;
  currentStepId: number | null;
  canSubmit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canWithdraw: boolean;
  canViewHistory: boolean;
  selfApprovalBlocked: boolean;
  selfApprovalBlockReason: string | null;
  actionUnavailableReason?: string | null;
  latestComments: string | null;
  latestReason: string | null;
};

export type ApprovalHistoryRow = {
  id: number;
  documentId: number;
  action: string;
  actionedBy: number | null;
  actionedByName: string | null;
  actionedAt: string;
  submittedBy: number | null;
  submittedByName: string | null;
  submittedAt: string | null;
  reason: string | null;
  comments: string | null;
  isCurrent: boolean;
  workflowId: number | null;
  stepId: number | null;
  createdAt: string;
};

export type ApprovalQueueRow = {
  documentId: number;
  documentNo: string;
  title: string;
  documentTypeName: string | null;
  ownerName: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  approvalStatus: string | null;
  currentApprovalId: number | null;
  daysPending: number | null;
  canAct: boolean;
  canWithdraw: boolean;
  isRedacted?: boolean;
};

export type WorkflowRow = {
  id: number;
  workflowCode: string;
  nameEn: string;
  nameAr: string | null;
  description: string | null;
  documentTypeIds: number[];
  documentTypeNames: string[];
  isActive: boolean;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowWithSteps = WorkflowRow & {
  steps: {
    id: number;
    stepCode: string;
    stepName: string;
    isInitial: boolean;
    isFinal: boolean;
    requiresRole: string | null;
    sortOrder: number;
    isActive: boolean;
  }[];
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. getDocumentApprovalState
// ─────────────────────────────────────────────────────────────────────────────

export async function getDocumentApprovalState(
  documentId: number,
): Promise<ActionResult<ApprovalState>> {
  try {
    const validId = positiveInt.safeParse(documentId);
    if (!validId.success) return { success: false, error: "Invalid document ID" };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    if (!hasPermission(ctx, "dms.documents.view") && !canViewApprovals(ctx)) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select(`
        id, document_no, title, status,
        approval_status, submitted_by, submitted_at,
        document_type_id,
        owner_user_id, created_by,
        document_type:dms_document_types!document_type_id(name_en),
        submitter:user_profiles!submitted_by(display_name)
      `)
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docErr || !doc) return { success: false, error: "Document not found" };

    const d = doc as unknown as {
      id: number; document_no: string; title: string; status: string;
      approval_status: string | null; submitted_by: number | null; submitted_at: string | null;
      document_type_id: number | null; owner_user_id: number | null; created_by: number | null;
      document_type: { name_en: string } | null;
      submitter: { display_name: string } | null;
    };

    // Get current approval row
    const { data: currentApproval, error: approvalReadError } = await supabase
      .from("dms_document_approvals")
      .select("id, action, workflow_id, step_id, reason, comments")
      .eq("document_id", documentId)
      .eq("is_current", true)
      .maybeSingle();

    const ca = currentApproval as {
      id: number; action: string; workflow_id: number | null;
      step_id: number | null; reason: string | null; comments: string | null;
    } | null;

    const profileId = ctx.profile.id;
    const isSelfApproval = d.submitted_by !== null && d.submitted_by === profileId && !isDmsAdmin(ctx);
    const actionable = !approvalReadError && !!ca?.id && ca.action === "submitted";
    const stepCapability = actionable ? await supabase.rpc("f05_can_act_document_approval", { document_id: documentId, step_id: ca?.step_id ?? null }) : null;
    const canActOnStep = !stepCapability?.error && stepCapability?.data === true;

    const state: ApprovalState = {
      documentId: d.id,
      documentNo: d.document_no,
      title: d.title,
      documentTypeId: d.document_type_id,
      documentTypeName: d.document_type?.name_en ?? null,
      documentStatus: d.status,
      approvalStatus: d.approval_status,
      submittedBy: d.submitted_by,
      submittedByName: d.submitter?.display_name ?? null,
      submittedAt: d.submitted_at,
      currentApprovalId: ca?.id ?? null,
      currentApprovalAction: ca?.action ?? null,
      currentWorkflowId: ca?.workflow_id ?? null,
      currentStepId: ca?.step_id ?? null,
      canSubmit: canSubmit(ctx) && ["draft", "rejected", "withdrawn", null].includes(d.approval_status) && !["archived", "deleted"].includes(d.status),
      canApprove: actionable && canActOnStep && d.approval_status === "pending_approval" && !isSelfApproval,
      canReject: actionable && canActOnStep && d.approval_status === "pending_approval" && !isSelfApproval,
      canWithdraw: actionable && d.approval_status === "pending_approval" && (canWithdraw(ctx) || d.submitted_by === profileId),
      actionUnavailableReason: d.approval_status === "pending_approval" && !actionable ? "The current approval request is unavailable. Refresh or ask your administrator to check approval access before taking action." : null,
      canViewHistory: canViewApprovals(ctx),
      selfApprovalBlocked: isSelfApproval && d.approval_status === "pending_approval",
      selfApprovalBlockReason: isSelfApproval ? "You submitted this document for approval and cannot act on it." : null,
      latestComments: ca?.comments ?? null,
      latestReason: ca?.reason ?? null,
    };

    return { success: true, data: state };
  } catch (err) {
    logger.error("getDocumentApprovalState error", err);
    return { success: false, error: "Failed to load approval state" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. submitDocumentForApproval
// ─────────────────────────────────────────────────────────────────────────────

export async function submitDocumentForApproval(
  documentId: number,
  input: { comment?: string },
): Promise<ActionResult<{ approvalId: number }>> {
  try {
    const validId = positiveInt.safeParse(documentId);
    if (!validId.success) return { success: false, error: "Invalid document ID" };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canSubmit(ctx)) return { success: false, error: "Not allowed to submit this document" };

    const parsed = submitSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };

    const supabase = await createClient();
    const profileId = ctx.profile.id;

    // Fetch document
    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select("id, document_no, title, status, approval_status, document_type_id, owner_user_id, created_by, document_type:dms_document_types!document_type_id(name_en)")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docErr || !doc) return { success: false, error: "Document not found" };

    const d = doc as unknown as {
      id: number; document_no: string; title: string; status: string;
      approval_status: string | null; document_type_id: number | null;
      owner_user_id: number | null; created_by: number | null;
      document_type: { name_en: string } | null;
    };

    if (["archived", "deleted"].includes(d.status)) {
      return { success: false, error: "Document is archived or deleted and cannot be submitted for approval" };
    }
    if (d.approval_status === "pending_approval") {
      return { success: false, error: "Approval request already pending for this document" };
    }

    const transition = await transitionApproval(documentId, null, "submit", parsed.data.comment, undefined);
    if (!transition.success || !transition.data) return { success: false, error: transition.error };
    const outcome = transition.data;
    const ap = { id: outcome.approvalId };


    // Step 5: Notify eligible approvers
    const actorName = ctx.profile.display_name ?? ctx.profile.full_name ?? "User";
    const docTypeName = d.document_type?.name_en ?? "Document";
    const admin = createAdminClient();
    const approverIds = await resolveApproverUserIds(admin, documentId, outcome.requiresRole);
    for (const uid of approverIds) {
      if (uid === profileId) continue; // Don't notify self
      await sendApprovalNotification({
        documentId, documentNo: d.document_no, title: d.title,
        documentType: docTypeName, actorName,
        notificationType: "approval_requested",
        notificationCode: "DMS_APPROVAL_REQUESTED",
        severity: "info", channelEmail: true,
        recipientUserId: uid, actionLabel: "Review Document",
        createdBy: profileId,
      });
    }

    // Audit log
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: documentId,
      entity_reference: d.document_no,
      action: "update",
      new_values: { approval_status: "pending_approval", approval_id: ap.id },
    });

    revalidatePath(PATHS.docRecord(documentId));
    revalidatePath(PATHS.dmsDocuments);
    revalidatePath(PATHS.dmsApprovals);
    revalidatePath(PATHS.notifications);

    return { success: true, data: { approvalId: ap.id } };
  } catch (err) {
    logger.error("submitDocumentForApproval error", err);
    return { success: false, error: "Failed to submit document for approval" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. approveDocument
// ─────────────────────────────────────────────────────────────────────────────

export async function approveDocument(
  documentId: number,
  approvalId: number,
  input: { comment?: string },
): Promise<ActionResult<ApprovalTransition>> {
  try {
    const validDoc = positiveInt.safeParse(documentId);
    const validAp = positiveInt.safeParse(approvalId);
    if (!validDoc.success || !validAp.success) return { success: false, error: "Invalid ID" };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canAct(ctx)) return { success: false, error: "Not eligible to approve" };

    const parsed = approveSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };

    const supabase = await createClient();
    const profileId = ctx.profile.id;

    // Fetch document + current approval in one go
    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select("id, document_no, title, status, approval_status, submitted_by, document_type_id, owner_user_id, created_by, document_type:dms_document_types!document_type_id(name_en)")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docErr || !doc) return { success: false, error: "Document not found" };

    const d = doc as unknown as {
      id: number; document_no: string; title: string; status: string;
      approval_status: string | null; submitted_by: number | null;
      document_type_id: number | null; owner_user_id: number | null; created_by: number | null;
      document_type: { name_en: string } | null;
    };

    if (d.approval_status !== "pending_approval") {
      return { success: false, error: "Document is not pending approval" };
    }
    if (["archived", "deleted"].includes(d.status)) {
      return { success: false, error: "Cannot approve an archived or deleted document" };
    }
    // Self-approval check
    if (d.submitted_by === profileId && !isDmsAdmin(ctx)) {
      return { success: false, error: "Self-approval is not allowed. You submitted this document for approval." };
    }

    // Verify approvalId is the current row
    const transition = await transitionApproval(documentId, approvalId, "approve", parsed.data.comment, undefined);
    if (!transition.success || !transition.data) return { success: false, error: transition.error };
    const outcome = transition.data;

    if (outcome.pending) {
      // A completed review step is not a final document approval.
      const admin=createAdminClient();
      for(const uid of await resolveApproverUserIds(admin,documentId,outcome.requiresRole)) {
        if(uid===profileId || uid===d.submitted_by) continue;
        await sendApprovalNotification({documentId,documentNo:d.document_no,title:d.title,documentType:d.document_type?.name_en??"Document",actorName:"Reviewer",notificationType:"approval_requested",notificationCode:"DMS_APPROVAL_REQUESTED",severity:"info",channelEmail:true,recipientUserId:uid,actionLabel:"Review Document",createdBy:profileId});
      }

      revalidatePath(PATHS.docRecord(documentId)); revalidatePath(PATHS.dmsDocuments); revalidatePath(PATHS.dmsApprovals);
      return { success: true, data: outcome };
    }

    // Step 5: Notify submitter and owner/creator
    const actorName = ctx.profile.display_name ?? ctx.profile.full_name ?? "User";
    const docTypeName = d.document_type?.name_en ?? "Document";
    const notifyIds = new Set<number>();
    if (d.submitted_by) notifyIds.add(d.submitted_by);
    if (d.owner_user_id && d.owner_user_id !== d.submitted_by) notifyIds.add(d.owner_user_id);
    if (d.created_by && d.created_by !== d.submitted_by) notifyIds.add(d.created_by);

    for (const uid of notifyIds) {
      if (uid === profileId) continue;
      await sendApprovalNotification({
        documentId, documentNo: d.document_no, title: d.title,
        documentType: docTypeName, actorName,
        notificationType: "approval_approved",
        notificationCode: "DMS_APPROVED",
        severity: "info", channelEmail: true,
        recipientUserId: uid, actionLabel: "View Document",
        createdBy: profileId,
      });
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: documentId,
      entity_reference: d.document_no,
      action: "update",
      new_values: { approval_status: "approved" },
    });

    revalidatePath(PATHS.docRecord(documentId));
    revalidatePath(PATHS.dmsDocuments);
    revalidatePath(PATHS.dmsApprovals);
    revalidatePath(PATHS.notifications);

    return { success: true, data: outcome };
  } catch (err) {
    logger.error("approveDocument error", err);
    return { success: false, error: "Failed to approve document" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. rejectDocument
// ─────────────────────────────────────────────────────────────────────────────

export async function rejectDocument(
  documentId: number,
  approvalId: number,
  input: { reason: string; comment?: string },
): Promise<ActionResult> {
  try {
    const validDoc = positiveInt.safeParse(documentId);
    const validAp = positiveInt.safeParse(approvalId);
    if (!validDoc.success || !validAp.success) return { success: false, error: "Invalid ID" };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canAct(ctx)) return { success: false, error: "Not eligible to reject" };

    const parsed = rejectSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Rejection reason is required" };

    const supabase = await createClient();
    const profileId = ctx.profile.id;

    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select("id, document_no, title, status, approval_status, submitted_by, document_type_id, owner_user_id, created_by, document_type:dms_document_types!document_type_id(name_en)")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docErr || !doc) return { success: false, error: "Document not found" };

    const d = doc as unknown as {
      id: number; document_no: string; title: string; status: string;
      approval_status: string | null; submitted_by: number | null;
      document_type_id: number | null; owner_user_id: number | null; created_by: number | null;
      document_type: { name_en: string } | null;
    };

    if (d.approval_status !== "pending_approval") {
      return { success: false, error: "Document is not pending approval" };
    }
    if (["archived", "deleted"].includes(d.status)) {
      return { success: false, error: "Cannot reject an archived or deleted document" };
    }
    if (d.submitted_by === profileId && !isDmsAdmin(ctx)) {
      return { success: false, error: "Self-approval is not allowed. You submitted this document for approval." };
    }

    const transition = await transitionApproval(documentId, approvalId, "reject", parsed.data.comment, parsed.data.reason);
    if (!transition.success || !transition.data) return { success: false, error: transition.error };



    // Step 5: Notify submitter and owner/creator
    const actorName = ctx.profile.display_name ?? ctx.profile.full_name ?? "User";
    const docTypeName = d.document_type?.name_en ?? "Document";
    const notifyIds = new Set<number>();
    if (d.submitted_by) notifyIds.add(d.submitted_by);
    if (d.owner_user_id && d.owner_user_id !== d.submitted_by) notifyIds.add(d.owner_user_id);
    if (d.created_by && d.created_by !== d.submitted_by) notifyIds.add(d.created_by);

    for (const uid of notifyIds) {
      if (uid === profileId) continue;
      await sendApprovalNotification({
        documentId, documentNo: d.document_no, title: d.title,
        documentType: docTypeName, actorName,
        notificationType: "approval_rejected",
        notificationCode: "DMS_REJECTED",
        severity: "urgent", channelEmail: true,
        recipientUserId: uid, actionLabel: "View Document",
        commentsOrReason: parsed.data.reason,
        createdBy: profileId,
      });
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: documentId,
      entity_reference: d.document_no,
      action: "update",
      new_values: { approval_status: "rejected", reason: parsed.data.reason },
    });

    revalidatePath(PATHS.docRecord(documentId));
    revalidatePath(PATHS.dmsDocuments);
    revalidatePath(PATHS.dmsApprovals);
    revalidatePath(PATHS.notifications);

    return { success: true };
  } catch (err) {
    logger.error("rejectDocument error", err);
    return { success: false, error: "Failed to reject document" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. withdrawDocumentApproval
// ─────────────────────────────────────────────────────────────────────────────

export async function withdrawDocumentApproval(
  documentId: number,
  approvalId: number,
  input: { reason?: string },
): Promise<ActionResult> {
  try {
    const validDoc = positiveInt.safeParse(documentId);
    const validAp = positiveInt.safeParse(approvalId);
    if (!validDoc.success || !validAp.success) return { success: false, error: "Invalid ID" };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    const parsed = withdrawSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };

    const supabase = await createClient();
    const profileId = ctx.profile.id;

    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select("id, document_no, title, status, approval_status, submitted_by, document_type_id, owner_user_id, created_by, document_type:dms_document_types!document_type_id(name_en)")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docErr || !doc) return { success: false, error: "Document not found" };

    const d = doc as unknown as {
      id: number; document_no: string; title: string; status: string;
      approval_status: string | null; submitted_by: number | null;
      document_type_id: number | null; owner_user_id: number | null; created_by: number | null;
      document_type: { name_en: string } | null;
    };

    if (d.approval_status !== "pending_approval") {
      return { success: false, error: "Document is not pending approval" };
    }

    // Must be submitter OR have explicit withdraw/admin permission
    const isSubmitter = d.submitted_by === profileId;
    if (!isSubmitter && !canWithdraw(ctx)) {
      return { success: false, error: "Only the submitter or an admin can withdraw this approval request" };
    }

    const transition = await transitionApproval(documentId, approvalId, "withdraw", undefined, parsed.data.reason);
    if (!transition.success || !transition.data) return { success: false, error: transition.error };



    // Step 5: Notify eligible approvers
    const actorName = ctx.profile.display_name ?? ctx.profile.full_name ?? "User";
    const docTypeName = d.document_type?.name_en ?? "Document";
    const admin = createAdminClient();
    const approverIds = await resolveApproverUserIds(admin, documentId, null);
    for (const uid of approverIds) {
      if (uid === profileId) continue;
      await sendApprovalNotification({
        documentId, documentNo: d.document_no, title: d.title,
        documentType: docTypeName, actorName,
        notificationType: "approval_withdrawn",
        notificationCode: "DMS_APPROVAL_WITHDRAWN",
        severity: "warning", channelEmail: false,
        recipientUserId: uid, actionLabel: "View Document",
        commentsOrReason: parsed.data.reason,
        createdBy: profileId,
      });
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: documentId,
      entity_reference: d.document_no,
      action: "update",
      new_values: { approval_status: "withdrawn" },
    });

    revalidatePath(PATHS.docRecord(documentId));
    revalidatePath(PATHS.dmsDocuments);
    revalidatePath(PATHS.dmsApprovals);
    revalidatePath(PATHS.notifications);

    return { success: true };
  } catch (err) {
    logger.error("withdrawDocumentApproval error", err);
    return { success: false, error: "Failed to withdraw approval request" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. getDocumentApprovalHistory
// ─────────────────────────────────────────────────────────────────────────────

export async function getDocumentApprovalHistory(
  documentId: number,
): Promise<ActionResult<ApprovalHistoryRow[]>> {
  try {
    const validId = positiveInt.safeParse(documentId);
    if (!validId.success) return { success: false, error: "Invalid document ID" };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    const profileId = ctx.profile.id;
    const canView = canViewApprovals(ctx) || hasPermission(ctx, "dms.documents.view");

    if (!canView) {
      // Check if they are submitter or actioned_by on any row
      const supabase = await createClient();
      const { data: ownRows } = await supabase
        .from("dms_document_approvals")
        .select("id")
        .eq("document_id", documentId)
        .or(`submitted_by.eq.${profileId},actioned_by.eq.${profileId}`)
        .limit(1);

      if (!ownRows || ownRows.length === 0) {
        return { success: false, error: "Permission denied" };
      }
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_document_approvals")
      .select(`
        id, document_id, action, actioned_by, actioned_at,
        submitted_by, submitted_at, reason, comments, is_current,
        workflow_id, step_id, created_at,
        actioned_by_profile:user_profiles!actioned_by(display_name),
        submitted_by_profile:user_profiles!submitted_by(display_name)
      `)
      .eq("document_id", documentId)
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const rows: ApprovalHistoryRow[] = (data ?? []).map((r) => {
      const row = r as unknown as {
        id: number; document_id: number; action: string; actioned_by: number | null;
        actioned_at: string; submitted_by: number | null; submitted_at: string | null;
        reason: string | null; comments: string | null; is_current: boolean;
        workflow_id: number | null; step_id: number | null; created_at: string;
        actioned_by_profile: { display_name: string } | null;
        submitted_by_profile: { display_name: string } | null;
      };
      return {
        id: row.id,
        documentId: row.document_id,
        action: row.action,
        actionedBy: row.actioned_by,
        actionedByName: row.actioned_by_profile?.display_name ?? null,
        actionedAt: row.actioned_at,
        submittedBy: row.submitted_by,
        submittedByName: row.submitted_by_profile?.display_name ?? null,
        submittedAt: row.submitted_at,
        reason: row.reason,
        comments: row.comments,
        isCurrent: row.is_current,
        workflowId: row.workflow_id,
        stepId: row.step_id,
        createdAt: row.created_at,
      };
    });

    return { success: true, data: rows };
  } catch (err) {
    logger.error("getDocumentApprovalHistory error", err);
    return { success: false, error: "Failed to load approval history" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. listPendingDocumentApprovalsForCurrentUser
// ─────────────────────────────────────────────────────────────────────────────

export async function listPendingDocumentApprovalsForCurrentUser(
  filters: {
    status?: string;
    documentTypeId?: number;
    search?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDirection?: "asc" | "desc";
  } = {},
): Promise<ActionResult<{ rows: ApprovalQueueRow[]; total: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    if (!canViewApprovals(ctx)) {
      return { success: false, error: "Permission denied" };
    }

    const parsed = listFiltersSchema.safeParse(filters);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid filters" };

    const f = parsed.data;
    const profileId = ctx.profile.id;
    const supabase = await createClient();
    const offset = (f.page - 1) * f.pageSize;

    let query = supabase
      .from("dms_documents")
      .select(`
        id, document_no, title, approval_status, submitted_by, submitted_at,
        owner_user_id, created_by, confidentiality_level,
        document_type:dms_document_types!document_type_id(name_en),
        submitter:user_profiles!submitted_by(display_name),
        owner:user_profiles!owner_user_id(display_name),
        current_approval:dms_document_approvals(id, is_current)
      `, { count: "exact" })
      .is("deleted_at", null)
      .eq("current_approval.is_current", true)
      .not("approval_status", "is", null);

    // Status filter
    const statusFilter = f.status && f.status !== "all" ? f.status : null;
    if (statusFilter) {
      query = query.eq("approval_status", statusFilter);
    }

    if (f.documentTypeId) query = query.eq("document_type_id", f.documentTypeId);
    if (f.search) {
      const q = f.search.trim();
      // Quote PostgREST values so punctuation cannot become filter syntax.
      const pattern = `"%${q.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "\\%").replaceAll("_", "\\_")}%"`;
      query = query.or(`title.ilike.${pattern},document_no.ilike.${pattern}`);
    }

    // Sort
    const sortCol = f.sortBy === "document_no" ? "document_no"
      : f.sortBy === "title" ? "title"
        : "submitted_at";
    query = query.order(sortCol, { ascending: f.sortDirection === "asc" }).order("id").range(offset, offset + f.pageSize - 1);

    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message };

    const ids = (data ?? []).map(row => row.id as number);
    const capabilities = ids.length ? await supabase.rpc("f05_document_approval_capabilities", {document_ids:ids}) : {data:[],error:null};
    if (capabilities.error) return {success:false,error:"Approval access could not be verified. Refresh and try again."};
    const allowed = new Map<number,{can_act:boolean;can_withdraw:boolean}>((capabilities.data as Array<{document_id:number;can_act:boolean;can_withdraw:boolean}>).map(row=>[row.document_id,row]));
    const rows: ApprovalQueueRow[] = (data ?? []).map((d) => {
      const doc = d as unknown as {
        id: number; document_no: string; title: string; approval_status: string | null;
        submitted_by: number | null; submitted_at: string | null;
        owner_user_id: number | null; created_by: number | null;
        confidentiality_level: string | null;
        document_type: { name_en: string } | null;
        submitter: { display_name: string } | null;
        owner: { display_name: string } | null;
        current_approval: Array<{ id: number; is_current: boolean }>;
      };

      const daysPending = doc.submitted_at
        ? Math.floor((Date.now() - new Date(doc.submitted_at).getTime()) / 86400000)
        : null;

      const isOwnSubmission = doc.submitted_by === profileId;
      const isOwnerOrCreator = doc.owner_user_id === profileId || doc.created_by === profileId;
      const level = doc.confidentiality_level ?? "internal";
      const isSensitive = ["hr", "finance", "legal", "executive"].includes(level);
      const isActorOnPendingApproval = canAct(ctx) && doc.approval_status === "pending_approval" && !isOwnSubmission;

      const canSeeSensitiveDetails =
        !isSensitive
        || isDmsAdmin(ctx)
        || isOwnerOrCreator
        || hasPermission(ctx, `dms.documents.view.${level}`)
        || isActorOnPendingApproval;

      return {
        documentId: doc.id,
        documentNo: canSeeSensitiveDetails ? doc.document_no : "—",
        title: canSeeSensitiveDetails ? doc.title : "[Restricted Document]",
        documentTypeName: canSeeSensitiveDetails ? (doc.document_type?.name_en ?? null) : null,
        ownerName: doc.owner?.display_name ?? null,
        submittedByName: doc.submitter?.display_name ?? null,
        submittedAt: doc.submitted_at,
        approvalStatus: doc.approval_status,
        currentApprovalId: doc.current_approval?.[0]?.id ?? null,
        daysPending,
        canAct: allowed.get(doc.id)?.can_act === true,
        canWithdraw: allowed.get(doc.id)?.can_withdraw === true,
        isRedacted: !canSeeSensitiveDetails,
      };
    });

    return { success: true, data: { rows, total: count ?? rows.length } };
  } catch (err) {
    logger.error("listPendingDocumentApprovalsForCurrentUser error", err);
    return { success: false, error: "Failed to load approval queue" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. getApprovalWorkflowForDocumentType
// ─────────────────────────────────────────────────────────────────────────────

async function resolveWorkflow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentTypeId: number,
): Promise<WorkflowWithSteps | null> {
  // Find active workflow IDs that cover this document type via junction table
  const { data: junctionRows } = await supabase
    .from("dms_workflow_document_types")
    .select("workflow_id")
    .eq("document_type_id", documentTypeId);

  const workflowIds = (junctionRows ?? []).map((r) => (r as unknown as { workflow_id: number }).workflow_id);

  if (workflowIds.length === 0) return null;

  const { data: wf } = await supabase
    .from("dms_document_workflows")
    .select(`
      id, workflow_code, name_en, name_ar, description, is_active,
      created_at, updated_at,
      doc_types:dms_workflow_document_types!workflow_id(
        document_type_id,
        doc_type:dms_document_types!document_type_id(name_en)
      ),
      steps:dms_document_workflow_steps!workflow_id(id, step_code, step_name, is_initial, is_final, requires_role, sort_order, is_active)
    `)
    .in("id", workflowIds)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!wf) return null;

  const w = wf as unknown as {
    id: number; workflow_code: string; name_en: string; name_ar: string | null;
    description: string | null; is_active: boolean;
    created_at: string; updated_at: string;
    doc_types: Array<{ document_type_id: number; doc_type: { name_en: string } | null }>;
    steps: Array<{
      id: number; step_code: string; step_name: string; is_initial: boolean;
      is_final: boolean; requires_role: string | null; sort_order: number; is_active: boolean;
    }>;
  };

  const docTypes = w.doc_types ?? [];
  return {
    id: w.id,
    workflowCode: w.workflow_code,
    nameEn: w.name_en,
    nameAr: w.name_ar,
    description: w.description,
    documentTypeIds: docTypes.map((dt) => dt.document_type_id),
    documentTypeNames: docTypes.map((dt) => dt.doc_type?.name_en ?? "").filter(Boolean),
    isActive: w.is_active,
    stepCount: (w.steps ?? []).filter((s) => s.is_active).length,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    steps: (w.steps ?? [])
      .filter((s) => s.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({
        id: s.id,
        stepCode: s.step_code,
        stepName: s.step_name,
        isInitial: s.is_initial,
        isFinal: s.is_final,
        requiresRole: s.requires_role,
        sortOrder: s.sort_order,
        isActive: s.is_active,
      })),
  };
}

export async function getApprovalWorkflowForDocumentType(
  documentTypeId: number,
): Promise<ActionResult<WorkflowWithSteps | null>> {
  try {
    const validId = positiveInt.safeParse(documentTypeId);
    if (!validId.success) return { success: false, error: "Invalid document type ID" };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    const supabase = await createClient();
    const workflow = await resolveWorkflow(supabase, documentTypeId);
    return { success: true, data: workflow };
  } catch (err) {
    logger.error("getApprovalWorkflowForDocumentType error", err);
    return { success: false, error: "Failed to load workflow" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. adminListApprovalWorkflows
// ─────────────────────────────────────────────────────────────────────────────

export async function adminListApprovalRoleOptions(): Promise<ActionResult<Array<{ code: string; name: string }>>> {
  try {
    const ctx = await getAuthContext();
    if (!hasGlobalPermission(ctx, "dms.admin") && !hasGlobalPermission(ctx, "dms.approvals.admin")) return { success: false, error: "Permission denied" };
    // Configuration is global. This does not grant document access or expose role members.
    const { data, error } = await createAdminClient().from("roles").select("role_code,role_name").eq("is_active", true).order("role_name").limit(1000);
    if (error) return { success: false, error: "Could not load approval roles" };
    return { success: true, data: (data ?? []).map(r => ({ code: r.role_code, name: r.role_name })) };
  } catch {
    return { success: false, error: "Could not load approval roles" };
  }
}

export async function adminListApprovalWorkflows(): Promise<ActionResult<WorkflowRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!isDmsAdmin(ctx)) return { success: false, error: "Permission denied" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_document_workflows")
      .select(`
        id, workflow_code, name_en, name_ar, description, is_active,
        created_at, updated_at,
        doc_types:dms_workflow_document_types!workflow_id(
          document_type_id,
          doc_type:dms_document_types!document_type_id(name_en)
        ),
        steps:dms_document_workflow_steps!workflow_id(id, is_active)
      `)
      .is("deleted_at", null)
      .order("name_en");

    if (error) return { success: false, error: error.message };

    const rows: WorkflowRow[] = (data ?? []).map((w) => {
      const wf = w as unknown as {
        id: number; workflow_code: string; name_en: string; name_ar: string | null;
        description: string | null; is_active: boolean;
        created_at: string; updated_at: string;
        doc_types: Array<{ document_type_id: number; doc_type: { name_en: string } | null }>;
        steps: Array<{ id: number; is_active: boolean }>;
      };
      const docTypes = wf.doc_types ?? [];
      return {
        id: wf.id,
        workflowCode: wf.workflow_code,
        nameEn: wf.name_en,
        nameAr: wf.name_ar,
        description: wf.description,
        documentTypeIds: docTypes.map((dt) => dt.document_type_id),
        documentTypeNames: docTypes.map((dt) => dt.doc_type?.name_en ?? "").filter(Boolean),
        isActive: wf.is_active,
        stepCount: (wf.steps ?? []).filter((s) => s.is_active).length,
        createdAt: wf.created_at,
        updatedAt: wf.updated_at,
      };
    });

    return { success: true, data: rows };
  } catch (err) {
    logger.error("adminListApprovalWorkflows error", err);
    return { success: false, error: "Failed to list workflows" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9b. adminGetApprovalWorkflow — fetch single workflow with full step details
// ─────────────────────────────────────────────────────────────────────────────

export async function adminGetApprovalWorkflow(id: number): Promise<ActionResult<WorkflowWithSteps>> {
  try {
    const validId = positiveInt.safeParse(id);
    if (!validId.success) return { success: false, error: "Invalid workflow ID" };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!isDmsAdmin(ctx)) return { success: false, error: "Permission denied" };

    const supabase = await createClient();
    const { data: wf, error } = await supabase
      .from("dms_document_workflows")
      .select(`
        id, workflow_code, name_en, name_ar, description, is_active,
        created_at, updated_at,
        doc_types:dms_workflow_document_types!workflow_id(
          document_type_id,
          doc_type:dms_document_types!document_type_id(name_en)
        ),
        steps:dms_document_workflow_steps!workflow_id(id, step_code, step_name, is_initial, is_final, requires_role, sort_order, is_active)
      `)
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error || !wf) return { success: false, error: error?.message ?? "Workflow not found" };

    const w = wf as unknown as {
      id: number; workflow_code: string; name_en: string; name_ar: string | null;
      description: string | null; is_active: boolean;
      created_at: string; updated_at: string;
      doc_types: Array<{ document_type_id: number; doc_type: { name_en: string } | null }>;
      steps: Array<{
        id: number; step_code: string; step_name: string; is_initial: boolean;
        is_final: boolean; requires_role: string | null; sort_order: number; is_active: boolean;
      }>;
    };

    const docTypes = w.doc_types ?? [];
    const result: WorkflowWithSteps = {
      id: w.id,
      workflowCode: w.workflow_code,
      nameEn: w.name_en,
      nameAr: w.name_ar,
      description: w.description,
      documentTypeIds: docTypes.map((dt) => dt.document_type_id),
      documentTypeNames: docTypes.map((dt) => dt.doc_type?.name_en ?? "").filter(Boolean),
      isActive: w.is_active,
      stepCount: (w.steps ?? []).filter((s) => s.is_active).length,
      createdAt: w.created_at,
      updatedAt: w.updated_at,
      steps: (w.steps ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({
          id: s.id,
          stepCode: s.step_code,
          stepName: s.step_name,
          isInitial: s.is_initial,
          isFinal: s.is_final,
          requiresRole: s.requires_role,
          sortOrder: s.sort_order,
          isActive: s.is_active,
        })),
    };

    return { success: true, data: result };
  } catch (err) {
    logger.error("adminGetApprovalWorkflow error", err);
    return { success: false, error: "Failed to load workflow" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. adminCreateApprovalWorkflow
// ─────────────────────────────────────────────────────────────────────────────

export async function adminCreateApprovalWorkflow(
  input: z.infer<typeof workflowCreateSchema>,
): Promise<ActionResult<{ id: number }>> {
  const parsed = workflowCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  return saveWorkflowConfiguration(null, null, parsed.data);
}

export async function adminUpdateApprovalWorkflow(
  id: number, input: z.infer<typeof workflowUpdateSchema>,
): Promise<ActionResult> {
  if (!positiveInt.safeParse(id).success) return { success: false, error: "Invalid workflow ID" };
  const parsed = workflowUpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  const { expected_updated_at, ...fields } = parsed.data;
  return saveWorkflowConfiguration(id, expected_updated_at ?? null, fields);
}

export async function adminDeactivateApprovalWorkflow(id: number, expectedUpdatedAt?: string): Promise<ActionResult> {
  return adminUpdateApprovalWorkflow(id, { is_active: false, expected_updated_at: expectedUpdatedAt });
}

async function saveWorkflowConfiguration(id: number | null, expected: string | null, input: Record<string, unknown>): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile || !isDmsAdmin(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const result = await supabase.rpc("f05_save_dms_workflow", { p_id: id, p_expected_updated_at: expected, p_input: input });
    if (result.error || !result.data) {
      const code = result.error?.code;
      return { success: false, error: code === "PT409" ? "This workflow changed. Refresh and review it before saving again."
        : code === "55000" ? "This workflow has a pending approval. Complete or withdraw it before changing the steps or assignments."
        : code === "23505" ? "Check duplicate workflow or step codes and existing document-type assignments."
        : code === "22023" ? "Check workflow names, step order, required roles and document-type selections."
        : "The workflow was not saved. Check your access and entries, then refresh before retrying." };
    }
    const saved = result.data as { id: number };
    await logAudit({ module_code: "DMS", entity_name: "dms_document_workflows", entity_id: saved.id,
      entity_reference: String(saved.id), action: id === null ? "create" : "update" });
    revalidatePath(PATHS.dmsApprovals);
    revalidatePath("/admin/dms/approval-workflows");
    return { success: true, data: saved };
  } catch (err) {
    logger.error("saveWorkflowConfiguration failed", err);
    return { success: false, error: "The save could not be confirmed. Refresh the workflow before retrying." };
  }
}
