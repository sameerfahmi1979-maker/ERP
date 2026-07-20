"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";

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
  document_type_id: positiveInt.optional(),
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
    hasPermission(ctx, "dms.admin");
}

function canWithdraw(ctx: AuthCtx) {
  return hasPermission(ctx, "dms.approvals.withdraw") ||
    hasPermission(ctx, "dms.admin");
}

function canViewApprovals(ctx: AuthCtx) {
  return hasPermission(ctx, "dms.approvals.view") ||
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
 * Insert a document event (non-fatal: failure is logged but does not abort workflow).
 */
async function addDocumentEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentId: number,
  eventType: string,
  description: string,
  performedBy: number | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: eventType,
      description,
      performed_by: performedBy,
      metadata_json: metadata ?? null,
    });
  } catch (err) {
    logger.error(`addDocumentEvent(${eventType}) failed — non-fatal`, err);
  }
}

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
    const now = new Date().toISOString();
    const actionUrl = PATHS.docRecord(opts.documentId);
    const actionDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    const message = buildNotificationMessage(opts.notificationCode, {
      document_no: opts.documentNo,
      title: opts.title,
      document_type: opts.documentType,
      actor_name: opts.actorName,
      action_date: actionDate,
      comments_or_reason: opts.commentsOrReason ?? "",
    });

    await admin.from("erp_notifications").insert({
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
  } catch (err) {
    logger.error("sendApprovalNotification failed — non-fatal", err);
  }
}

function buildNotificationMessage(
  code: string,
  vars: { document_no: string; title: string; document_type: string; actor_name: string; action_date: string; comments_or_reason?: string },
): { title: string; body: string } {
  switch (code) {
    case "DMS_APPROVAL_REQUESTED":
      return {
        title: `Approval Required: ${vars.document_no} — ${vars.title}`,
        body: `Document ${vars.document_no} (${vars.title}) was submitted for approval by ${vars.actor_name} on ${vars.action_date}. Document type: ${vars.document_type}.`,
      };
    case "DMS_APPROVED":
      return {
        title: `Document Approved: ${vars.document_no} — ${vars.title}`,
        body: `Document ${vars.document_no} (${vars.title}) has been approved by ${vars.actor_name} on ${vars.action_date}.`,
      };
    case "DMS_REJECTED":
      return {
        title: `Document Rejected: ${vars.document_no} — ${vars.title}`,
        body: `Document ${vars.document_no} (${vars.title}) was rejected by ${vars.actor_name} on ${vars.action_date}. Reason: ${vars.comments_or_reason ?? "—"}`,
      };
    case "DMS_APPROVAL_WITHDRAWN":
      return {
        title: `Approval Withdrawn: ${vars.document_no} — ${vars.title}`,
        body: `The approval request for ${vars.document_no} (${vars.title}) was withdrawn by ${vars.actor_name} on ${vars.action_date}.`,
      };
    default:
      return { title: `DMS notification for ${vars.document_no}`, body: "" };
  }
}

/**
 * Resolve eligible approver user IDs — users who have dms.approvals.act or dms.documents.approve.
 * For workflow steps with requires_role, also include users with that role.
 */
async function resolveApproverUserIds(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  requiresRole?: string | null,
): Promise<number[]> {
  try {
    // Users with direct act/approve permissions via role assignments
    const { data: permRows } = await supabase
      .from("user_roles")
      .select("user_profile_id, roles!inner(role_permissions!inner(permissions!inner(permission_code)))")
      .not("user_profile_id", "is", null);

    const ids = new Set<number>();

    if (permRows) {
      for (const ur of permRows as unknown as Array<{
        user_profile_id: number;
        roles: { role_permissions: { permissions: { permission_code: string } }[] };
      }>) {
        const perms = ur.roles?.role_permissions?.map((rp) => rp.permissions?.permission_code) ?? [];
        if (perms.includes("dms.approvals.act") || perms.includes("dms.documents.approve") || perms.includes("dms.admin")) {
          if (ur.user_profile_id) ids.add(ur.user_profile_id);
        }
      }
    }

    if (requiresRole) {
      const { data: roleUsers } = await supabase
        .from("user_roles")
        .select("user_profile_id, roles!inner(role_code)")
        .not("user_profile_id", "is", null);

      if (roleUsers) {
        for (const ur of roleUsers as unknown as Array<{ user_profile_id: number; roles: { role_code: string } }>) {
          if (ur.roles?.role_code === requiresRole && ur.user_profile_id) {
            ids.add(ur.user_profile_id);
          }
        }
      }
    }

    return Array.from(ids);
  } catch (err) {
    logger.error("resolveApproverUserIds failed", err);
    return [];
  }
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
};

export type WorkflowRow = {
  id: number;
  workflowCode: string;
  nameEn: string;
  nameAr: string | null;
  description: string | null;
  documentTypeId: number | null;
  documentTypeName: string | null;
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
    const { data: currentApproval } = await supabase
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
      canApprove: canAct(ctx) && d.approval_status === "pending_approval" && !isSelfApproval,
      canReject: canAct(ctx) && d.approval_status === "pending_approval" && !isSelfApproval,
      canWithdraw: d.approval_status === "pending_approval" && (canWithdraw(ctx) || d.submitted_by === profileId),
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
    const now = new Date().toISOString();
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

    // Resolve workflow for this document type
    const workflow = d.document_type_id ? await resolveWorkflow(supabase, d.document_type_id) : null;

    const initialStep = workflow?.steps.find((s) => s.isInitial) ?? workflow?.steps[0] ?? null;

    // Step 1: Invalidate old current rows
    await supabase
      .from("dms_document_approvals")
      .update({ is_current: false, updated_at: now, updated_by: profileId })
      .eq("document_id", documentId)
      .eq("is_current", true);

    // Step 2: Insert new submitted row
    const { data: approvalRow, error: approvalErr } = await supabase
      .from("dms_document_approvals")
      .insert({
        document_id: documentId,
        workflow_id: workflow?.id ?? null,
        step_id: initialStep?.id ?? null,
        action: "submitted",
        submitted_by: profileId,
        submitted_at: now,
        actioned_by: profileId,
        actioned_at: now,
        comments: parsed.data.comment ?? null,
        is_current: true,
        created_at: now,
        updated_at: now,
        updated_by: profileId,
      })
      .select("id")
      .single();

    if (approvalErr || !approvalRow) {
      return { success: false, error: approvalErr?.message ?? "Failed to create approval record" };
    }
    const ap = approvalRow as { id: number };

    // Step 3: Update document
    const { error: docUpdateErr } = await supabase
      .from("dms_documents")
      .update({
        approval_status: "pending_approval",
        submitted_by: profileId,
        submitted_at: now,
        status: "pending_review",
        updated_by: profileId,
        updated_at: now,
      })
      .eq("id", documentId);

    if (docUpdateErr) {
      logger.error("submitDocumentForApproval: document update failed", docUpdateErr);
    }

    // Step 4: Document event (non-fatal)
    await addDocumentEvent(supabase, documentId, "approval_submitted", "Document submitted for approval", profileId, {
      approval_id: ap.id,
      workflow_id: workflow?.id ?? null,
    });

    // Step 5: Notify eligible approvers
    const actorName = ctx.profile.display_name ?? ctx.profile.full_name ?? "User";
    const docTypeName = d.document_type?.name_en ?? "Document";
    const admin = createAdminClient();
    const approverIds = await resolveApproverUserIds(admin, initialStep?.requiresRole ?? null);
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
): Promise<ActionResult> {
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
    const now = new Date().toISOString();
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
    const { data: apRow, error: apErr } = await supabase
      .from("dms_document_approvals")
      .select("id, is_current")
      .eq("id", approvalId)
      .eq("document_id", documentId)
      .eq("is_current", true)
      .maybeSingle();

    if (apErr || !apRow) return { success: false, error: "Approval request is no longer current or not found" };

    // Step 2: Update approval row
    const { error: updateApErr } = await supabase
      .from("dms_document_approvals")
      .update({
        action: "approved",
        actioned_by: profileId,
        actioned_at: now,
        comments: parsed.data.comment ?? null,
        is_current: false,
        updated_at: now,
        updated_by: profileId,
      })
      .eq("id", approvalId)
      .eq("is_current", true);

    if (updateApErr) return { success: false, error: updateApErr.message };

    // Step 3: Update document
    await supabase.from("dms_documents").update({
      approval_status: "approved",
      status: "approved",
      updated_by: profileId,
      updated_at: now,
    }).eq("id", documentId);

    // Step 4: Document event
    await addDocumentEvent(supabase, documentId, "approval_approved", "Document approved", profileId, {
      approval_id: approvalId,
      comment: parsed.data.comment,
    });

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

    return { success: true };
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
    const now = new Date().toISOString();
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

    const { data: apRow, error: apErr } = await supabase
      .from("dms_document_approvals")
      .select("id, is_current")
      .eq("id", approvalId)
      .eq("document_id", documentId)
      .eq("is_current", true)
      .maybeSingle();

    if (apErr || !apRow) return { success: false, error: "Approval request is no longer current or not found" };

    // Step 2: Update approval row
    const { error: updateErr } = await supabase
      .from("dms_document_approvals")
      .update({
        action: "rejected",
        actioned_by: profileId,
        actioned_at: now,
        reason: parsed.data.reason,
        comments: parsed.data.comment ?? parsed.data.reason,
        is_current: false,
        updated_at: now,
        updated_by: profileId,
      })
      .eq("id", approvalId)
      .eq("is_current", true);

    if (updateErr) return { success: false, error: updateErr.message };

    // Step 3: Update document
    await supabase.from("dms_documents").update({
      approval_status: "rejected",
      status: "rejected",
      updated_by: profileId,
      updated_at: now,
    }).eq("id", documentId);

    // Step 4: Document event
    await addDocumentEvent(supabase, documentId, "approval_rejected", `Document rejected: ${parsed.data.reason}`, profileId, {
      approval_id: approvalId,
      reason: parsed.data.reason,
    });

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
    const now = new Date().toISOString();
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

    const { data: apRow, error: apErr } = await supabase
      .from("dms_document_approvals")
      .select("id, is_current")
      .eq("id", approvalId)
      .eq("document_id", documentId)
      .eq("is_current", true)
      .maybeSingle();

    if (apErr || !apRow) return { success: false, error: "Approval request is no longer current or not found" };

    // Step 2: Update approval row
    const { error: updateErr } = await supabase
      .from("dms_document_approvals")
      .update({
        action: "withdrawn",
        actioned_by: profileId,
        actioned_at: now,
        reason: parsed.data.reason ?? null,
        is_current: false,
        updated_at: now,
        updated_by: profileId,
      })
      .eq("id", approvalId)
      .eq("is_current", true);

    if (updateErr) return { success: false, error: updateErr.message };

    // Step 3: Return document to draft
    await supabase.from("dms_documents").update({
      approval_status: "withdrawn",
      status: "draft",
      updated_by: profileId,
      updated_at: now,
    }).eq("id", documentId);

    // Step 4: Document event
    await addDocumentEvent(supabase, documentId, "approval_withdrawn", "Approval request withdrawn", profileId, {
      approval_id: approvalId,
      reason: parsed.data.reason,
    });

    // Step 5: Notify eligible approvers
    const actorName = ctx.profile.display_name ?? ctx.profile.full_name ?? "User";
    const docTypeName = d.document_type?.name_en ?? "Document";
    const admin = createAdminClient();
    const approverIds = await resolveApproverUserIds(admin, null);
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
        owner_user_id, created_by,
        document_type:dms_document_types!document_type_id(name_en),
        submitter:user_profiles!submitted_by(display_name),
        owner:user_profiles!owner_user_id(display_name),
        current_approval:dms_document_approvals!inner(id, is_current)
      `, { count: "exact" })
      .is("deleted_at", null)
      .eq("dms_document_approvals.is_current", true);

    // Status filter
    const statusFilter = f.status && f.status !== "all" ? f.status : null;
    if (statusFilter) {
      query = query.eq("approval_status", statusFilter);
    } else {
      // Default: show pending + submitted (for own submissions) + approved/rejected for admins
      if (!isDmsAdmin(ctx)) {
        // Non-admin: see pending_approval docs they can act on OR their own submissions
        query = query.not("approval_status", "is", null);
      }
    }

    if (f.documentTypeId) query = query.eq("document_type_id", f.documentTypeId);
    if (f.search) {
      const q = f.search.trim();
      query = query.or(`title.ilike.%${q}%,document_no.ilike.%${q}%`);
    }

    // Sort
    const sortCol = f.sortBy === "document_no" ? "document_no"
      : f.sortBy === "title" ? "title"
        : "submitted_at";
    query = query.order(sortCol, { ascending: f.sortDirection === "asc" }).range(offset, offset + f.pageSize - 1);

    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message };

    const rows: ApprovalQueueRow[] = (data ?? []).map((d) => {
      const doc = d as unknown as {
        id: number; document_no: string; title: string; approval_status: string | null;
        submitted_by: number | null; submitted_at: string | null;
        owner_user_id: number | null; created_by: number | null;
        document_type: { name_en: string } | null;
        submitter: { display_name: string } | null;
        owner: { display_name: string } | null;
        current_approval: Array<{ id: number; is_current: boolean }>;
      };

      const daysPending = doc.submitted_at
        ? Math.floor((Date.now() - new Date(doc.submitted_at).getTime()) / 86400000)
        : null;

      const isOwnSubmission = doc.submitted_by === profileId;

      return {
        documentId: doc.id,
        documentNo: doc.document_no,
        title: doc.title,
        documentTypeName: doc.document_type?.name_en ?? null,
        ownerName: doc.owner?.display_name ?? null,
        submittedByName: doc.submitter?.display_name ?? null,
        submittedAt: doc.submitted_at,
        approvalStatus: doc.approval_status,
        currentApprovalId: doc.current_approval?.[0]?.id ?? null,
        daysPending,
        canAct: canAct(ctx) && doc.approval_status === "pending_approval" && !isOwnSubmission,
        canWithdraw: doc.approval_status === "pending_approval" && (canWithdraw(ctx) || isOwnSubmission),
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
  const { data: wf } = await supabase
    .from("dms_document_workflows")
    .select(`
      id, workflow_code, name_en, name_ar, description, document_type_id, is_active,
      created_at, updated_at,
      document_type:dms_document_types!document_type_id(name_en),
      steps:dms_document_workflow_steps!workflow_id(id, step_code, step_name, is_initial, is_final, requires_role, sort_order, is_active)
    `)
    .eq("document_type_id", documentTypeId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!wf) return null;

  const w = wf as unknown as {
    id: number; workflow_code: string; name_en: string; name_ar: string | null;
    description: string | null; document_type_id: number | null; is_active: boolean;
    created_at: string; updated_at: string;
    document_type: { name_en: string } | null;
    steps: Array<{
      id: number; step_code: string; step_name: string; is_initial: boolean;
      is_final: boolean; requires_role: string | null; sort_order: number; is_active: boolean;
    }>;
  };

  return {
    id: w.id,
    workflowCode: w.workflow_code,
    nameEn: w.name_en,
    nameAr: w.name_ar,
    description: w.description,
    documentTypeId: w.document_type_id,
    documentTypeName: w.document_type?.name_en ?? null,
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

export async function adminListApprovalWorkflows(): Promise<ActionResult<WorkflowRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!isDmsAdmin(ctx)) return { success: false, error: "Permission denied" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_document_workflows")
      .select(`
        id, workflow_code, name_en, name_ar, description, document_type_id, is_active,
        created_at, updated_at,
        document_type:dms_document_types!document_type_id(name_en),
        steps:dms_document_workflow_steps!workflow_id(id, is_active)
      `)
      .is("deleted_at", null)
      .order("name_en");

    if (error) return { success: false, error: error.message };

    const rows: WorkflowRow[] = (data ?? []).map((w) => {
      const wf = w as unknown as {
        id: number; workflow_code: string; name_en: string; name_ar: string | null;
        description: string | null; document_type_id: number | null; is_active: boolean;
        created_at: string; updated_at: string;
        document_type: { name_en: string } | null;
        steps: Array<{ id: number; is_active: boolean }>;
      };
      return {
        id: wf.id,
        workflowCode: wf.workflow_code,
        nameEn: wf.name_en,
        nameAr: wf.name_ar,
        description: wf.description,
        documentTypeId: wf.document_type_id,
        documentTypeName: wf.document_type?.name_en ?? null,
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
// 10. adminCreateApprovalWorkflow
// ─────────────────────────────────────────────────────────────────────────────

export async function adminCreateApprovalWorkflow(
  input: z.infer<typeof workflowCreateSchema>,
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!isDmsAdmin(ctx)) return { success: false, error: "Permission denied" };

    const parsed = workflowCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };

    const supabase = await createClient();
    const now = new Date().toISOString();
    const profileId = ctx.profile.id;

    // Check unique code
    const { data: existing } = await supabase
      .from("dms_document_workflows")
      .select("id")
      .eq("workflow_code", parsed.data.workflow_code)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) return { success: false, error: `Workflow code '${parsed.data.workflow_code}' already exists` };

    const { data: wf, error: wfErr } = await supabase
      .from("dms_document_workflows")
      .insert({
        workflow_code: parsed.data.workflow_code,
        name_en: parsed.data.name_en,
        name_ar: parsed.data.name_ar ?? null,
        description: parsed.data.description ?? null,
        document_type_id: parsed.data.document_type_id ?? null,
        is_active: true,
        created_by: profileId,
        created_at: now,
        updated_by: profileId,
        updated_at: now,
      })
      .select("id")
      .single();

    if (wfErr || !wf) return { success: false, error: wfErr?.message ?? "Failed to create workflow" };

    const wfRow = wf as { id: number };

    // Insert steps if provided
    if (parsed.data.steps?.length) {
      const steps = parsed.data.steps.map((s, i) => ({
        workflow_id: wfRow.id,
        step_code: s.step_code,
        step_name: s.step_name,
        is_initial: s.is_initial,
        is_final: s.is_final,
        requires_role: s.requires_role ?? null,
        sort_order: s.sort_order ?? i,
        is_active: true,
        created_at: now,
      }));
      await supabase.from("dms_document_workflow_steps").insert(steps);
    }

    // No document_id for workflow events — skip document event insertion
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_workflows",
      entity_id: wfRow.id,
      entity_reference: parsed.data.workflow_code,
      action: "create",
    });
    revalidatePath(PATHS.dmsApprovals);

    return { success: true, data: { id: wfRow.id } };
  } catch (err) {
    logger.error("adminCreateApprovalWorkflow error", err);
    return { success: false, error: "Failed to create workflow" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. adminUpdateApprovalWorkflow
// ─────────────────────────────────────────────────────────────────────────────

export async function adminUpdateApprovalWorkflow(
  id: number,
  input: z.infer<typeof workflowUpdateSchema>,
): Promise<ActionResult> {
  try {
    const validId = positiveInt.safeParse(id);
    if (!validId.success) return { success: false, error: "Invalid workflow ID" };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!isDmsAdmin(ctx)) return { success: false, error: "Permission denied" };

    const parsed = workflowUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };

    const supabase = await createClient();
    const now = new Date().toISOString();
    const profileId = ctx.profile.id;

    const { steps, ...wfFields } = parsed.data;

    // Update workflow record
    const updatePayload: Record<string, unknown> = { ...wfFields, updated_by: profileId, updated_at: now };
    const { error: wfErr } = await supabase
      .from("dms_document_workflows")
      .update(updatePayload)
      .eq("id", id)
      .is("deleted_at", null);

    if (wfErr) return { success: false, error: wfErr.message };

    // Deactivate old steps and insert new ones if provided
    if (steps?.length) {
      await supabase.from("dms_document_workflow_steps")
        .update({ is_active: false })
        .eq("workflow_id", id)
        .eq("is_active", true);

      const newSteps = steps.map((s, i) => ({
        workflow_id: id,
        step_code: s.step_code,
        step_name: s.step_name,
        is_initial: s.is_initial,
        is_final: s.is_final,
        requires_role: s.requires_role ?? null,
        sort_order: s.sort_order ?? i,
        is_active: true,
        created_at: now,
      }));
      await supabase.from("dms_document_workflow_steps").insert(newSteps);
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_workflows",
      entity_id: id,
      entity_reference: String(id),
      action: "update",
    });
    revalidatePath(PATHS.dmsApprovals);

    return { success: true };
  } catch (err) {
    logger.error("adminUpdateApprovalWorkflow error", err);
    return { success: false, error: "Failed to update workflow" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. adminDeactivateApprovalWorkflow
// ─────────────────────────────────────────────────────────────────────────────

export async function adminDeactivateApprovalWorkflow(id: number): Promise<ActionResult> {
  try {
    const validId = positiveInt.safeParse(id);
    if (!validId.success) return { success: false, error: "Invalid workflow ID" };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!isDmsAdmin(ctx)) return { success: false, error: "Permission denied" };

    const supabase = await createClient();
    const now = new Date().toISOString();
    const profileId = ctx.profile.id;

    const { error } = await supabase
      .from("dms_document_workflows")
      .update({ is_active: false, updated_by: profileId, updated_at: now })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_workflows",
      entity_id: id,
      entity_reference: String(id),
      action: "update",
      new_values: { is_active: false },
    });
    revalidatePath(PATHS.dmsApprovals);

    return { success: true };
  } catch (err) {
    logger.error("adminDeactivateApprovalWorkflow error", err);
    return { success: false, error: "Failed to deactivate workflow" };
  }
}
