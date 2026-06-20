"use server";

/**
 * ERP COMMON AI.7 — AI Assistant for Actions — Server Actions
 *
 * Safe read/navigate/draft assistant. No auto-execution of ERP mutations.
 * All writes: sessions (start/archive), messages (append-only), drafts (status-only updates).
 */

import { z } from "zod";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { runAssistantTurn, MAX_USER_MESSAGE_LENGTH } from "@/lib/ai/common/assistant/assistant-engine";
import { sanitizeForStorage } from "@/lib/ai/common/assistant/response-builder";
import type {
  AssistantSessionRow,
  AssistantMessageRow,
  AssistantDraftRow,
  AssistantActionCode,
  AssistantActionDraftPayload,
  StartAssistantSessionInput,
  SendAssistantMessageInput,
  GetAssistantSessionsInput,
} from "@/lib/ai/common/assistant/types";

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string; code?: string }
  : { success: boolean; data?: T; error?: string; code?: string };

// ── Limits ─────────────────────────────────────────────────────────────────────

const MAX_SESSION_MESSAGES = 50;

// ── Feature flag helper ────────────────────────────────────────────────────────

async function isAssistantFeatureEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "ERP_AI_ASSISTANT")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled ?? false;
  } catch {
    return false;
  }
}

// ── Permission helpers ─────────────────────────────────────────────────────────

type AuthCtx = Awaited<ReturnType<typeof getAuthContext>>;

function canUseAssistant(ctx: AuthCtx): boolean {
  return (
    hasPermission(ctx, "ai.assistant.use") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canViewAssistant(ctx: AuthCtx): boolean {
  return (
    hasPermission(ctx, "ai.assistant.use") ||
    hasPermission(ctx, "ai.assistant.view") ||
    hasPermission(ctx, "ai.assistant.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function isAdmin(ctx: AuthCtx): boolean {
  return (
    hasPermission(ctx, "ai.assistant.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canPrepareDraft(ctx: AuthCtx): boolean {
  return (
    hasPermission(ctx, "ai.actions.prepare") ||
    ctx.roleCodes.includes("system_admin")
  );
}

// ── Input schemas ──────────────────────────────────────────────────────────────

const startSessionSchema = z.object({
  title: z.string().max(200).optional(),
  contextEntityType: z.string().max(100).optional(),
  contextEntityId: z.coerce.number().int().positive().optional(),
});

const sendMessageSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
  userMessage: z.string().min(1).max(MAX_USER_MESSAGE_LENGTH),
});

const sessionIdSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
});

const draftIdSchema = z.object({
  draftId: z.coerce.number().int().positive(),
});

// ── isAssistantEnabled ─────────────────────────────────────────────────────────

export async function isAssistantEnabled(): Promise<boolean> {
  return isAssistantFeatureEnabled();
}

// ── startAssistantSession ──────────────────────────────────────────────────────

export async function startAssistantSession(
  raw: StartAssistantSessionInput
): Promise<ActionResult<AssistantSessionRow>> {
  const ctx = await getAuthContext();
  if (!ctx.profile) return { success: false, error: "Not authenticated", code: "UNAUTHORIZED" };
  if (!canUseAssistant(ctx))
    return { success: false, error: "Insufficient permissions", code: "FORBIDDEN" };

  const enabled = await isAssistantFeatureEnabled();
  if (!enabled)
    return { success: false, error: "AI Assistant feature is not enabled", code: "FEATURE_DISABLED" };

  const parsed = startSessionSchema.safeParse(raw);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input", code: "VALIDATION_ERROR" };

  const { title, contextEntityType, contextEntityId } = parsed.data;
  const profileId = ctx.profile.id;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("erp_ai_assistant_sessions")
    .insert({
      session_code: nanoid(24),
      title: title ?? null,
      owner_user_profile_id: profileId,
      context_entity_type: contextEntityType ?? null,
      context_entity_id: contextEntityId ?? null,
      status: "active",
      message_count: 0,
    })
    .select()
    .single();

  if (error || !data)
    return { success: false, error: "Failed to create session", code: "DB_ERROR" };

  await logAudit({
    module_code: "AI",
    entity_name: "erp_ai_assistant_sessions",
    entity_id: data.id as number,
    entity_reference: `assistant-session-${data.id}`,
    action: "assistant_session_started",
    new_values: { session_id: data.id },
  });

  return {
    success: true,
    data: mapSessionRow(data),
  };
}

// ── getAssistantSession ────────────────────────────────────────────────────────

export async function getAssistantSession(
  sessionId: number
): Promise<ActionResult<AssistantSessionRow & { messages: AssistantMessageRow[]; drafts: AssistantDraftRow[] }>> {
  const ctx = await getAuthContext();
  if (!ctx.profile) return { success: false, error: "Not authenticated", code: "UNAUTHORIZED" };
  if (!canViewAssistant(ctx))
    return { success: false, error: "Insufficient permissions", code: "FORBIDDEN" };

  const parsed = sessionIdSchema.safeParse({ sessionId });
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input", code: "VALIDATION_ERROR" };

  const profileId = ctx.profile.id;
  const supabase = await createClient();
  const { data: session, error: sessionError } = await supabase
    .from("erp_ai_assistant_sessions")
    .select()
    .eq("id", sessionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (sessionError || !session)
    return { success: false, error: "Session not found", code: "NOT_FOUND" };

  if (!isAdmin(ctx) && (session as Record<string, unknown>).owner_user_profile_id !== profileId)
    return { success: false, error: "Access denied", code: "FORBIDDEN" };

  const [messagesRes, draftsRes] = await Promise.all([
    supabase
      .from("erp_ai_assistant_messages")
      .select()
      .eq("session_id", sessionId)
      .order("created_at")
      .limit(MAX_SESSION_MESSAGES),
    supabase
      .from("erp_ai_assistant_action_drafts")
      .select()
      .eq("session_id", sessionId)
      .is("deleted_at", null)
      .order("created_at"),
  ]);

  return {
    success: true,
    data: {
      ...mapSessionRow(session as Record<string, unknown>),
      messages: (messagesRes.data ?? []).map(r => mapMessageRow(r as Record<string, unknown>)),
      drafts: (draftsRes.data ?? []).map(r => mapDraftRow(r as Record<string, unknown>)),
    },
  };
}

// ── getAssistantSessions ───────────────────────────────────────────────────────

export async function getAssistantSessions(
  raw?: GetAssistantSessionsInput
): Promise<ActionResult<AssistantSessionRow[]>> {
  const ctx = await getAuthContext();
  if (!ctx.profile) return { success: false, error: "Not authenticated", code: "UNAUTHORIZED" };
  if (!canViewAssistant(ctx))
    return { success: false, error: "Insufficient permissions", code: "FORBIDDEN" };

  const limit = Math.min(raw?.limit ?? 20, 50);
  const profileId = ctx.profile.id;
  const supabase = await createClient();

  let query = supabase
    .from("erp_ai_assistant_sessions")
    .select()
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (!raw?.includeArchived) {
    query = query.neq("status", "archived");
  }

  if (!isAdmin(ctx)) {
    query = query.eq("owner_user_profile_id", profileId);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: "Failed to load sessions", code: "DB_ERROR" };

  return { success: true, data: (data ?? []).map(r => mapSessionRow(r as Record<string, unknown>)) };
}

// ── archiveAssistantSession ────────────────────────────────────────────────────

export async function archiveAssistantSession(
  sessionId: number
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx.profile) return { success: false, error: "Not authenticated", code: "UNAUTHORIZED" };
  if (!canUseAssistant(ctx))
    return { success: false, error: "Insufficient permissions", code: "FORBIDDEN" };

  const parsed = sessionIdSchema.safeParse({ sessionId });
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input", code: "VALIDATION_ERROR" };

  const profileId = ctx.profile.id;
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("erp_ai_assistant_sessions")
    .select("owner_user_profile_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { success: false, error: "Session not found", code: "NOT_FOUND" };
  if (!isAdmin(ctx) && (session as Record<string, unknown>).owner_user_profile_id !== profileId)
    return { success: false, error: "Access denied", code: "FORBIDDEN" };

  const { error } = await supabase
    .from("erp_ai_assistant_sessions")
    .update({ status: "archived", deleted_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) return { success: false, error: "Failed to archive session", code: "DB_ERROR" };

  return { success: true };
}

// ── sendAssistantMessage ───────────────────────────────────────────────────────

export async function sendAssistantMessage(
  raw: SendAssistantMessageInput
): Promise<ActionResult<{
  responseText: string;
  draftIds?: number[];
  navigationLinks?: Array<{ label: string; route: string }>;
  searchResultSummary?: Array<{ title: string; subtitle?: string | null; route: string; resultType: string }>;
}>> {
  const ctx = await getAuthContext();
  if (!ctx.profile) return { success: false, error: "Not authenticated", code: "UNAUTHORIZED" };
  if (!canUseAssistant(ctx))
    return { success: false, error: "Insufficient permissions", code: "FORBIDDEN" };

  const enabled = await isAssistantFeatureEnabled();
  if (!enabled)
    return { success: false, error: "AI Assistant feature is not enabled", code: "FEATURE_DISABLED" };

  const parsed = sendMessageSchema.safeParse(raw);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input", code: "VALIDATION_ERROR" };

  const { sessionId, userMessage } = parsed.data;
  const profileId = ctx.profile.id;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("erp_ai_assistant_sessions")
    .select()
    .eq("id", sessionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!session) return { success: false, error: "Session not found", code: "NOT_FOUND" };
  const sessionRow = session as Record<string, unknown>;

  if (sessionRow.owner_user_profile_id !== profileId && !isAdmin(ctx))
    return { success: false, error: "Access denied", code: "FORBIDDEN" };
  if (sessionRow.status !== "active")
    return { success: false, error: "Session is not active", code: "SESSION_INACTIVE" };
  if ((sessionRow.message_count as number) >= MAX_SESSION_MESSAGES)
    return {
      success: false,
      error: `Session has reached the maximum of ${MAX_SESSION_MESSAGES} messages. Start a new session.`,
      code: "SESSION_FULL",
    };

  // Persist user message (append-only)
  await supabase.from("erp_ai_assistant_messages").insert({
    session_id: sessionId,
    role: "user",
    message_text: sanitizeForStorage(userMessage),
    output_type: "text",
    safe_metadata_json: {},
  });

  const userPermissions = ctx.permissionCodes;

  const persistDraft = async (
    sid: number,
    actionCode: AssistantActionCode,
    payload: AssistantActionDraftPayload
  ): Promise<number | null> => {
    if (!canPrepareDraft(ctx)) return null;
    const adminClient = await createAdminClient();
    const { data, error } = await adminClient
      .from("erp_ai_assistant_action_drafts")
      .insert({
        session_id: sid,
        action_code: actionCode,
        safety_class: "draft_only",
        target_entity_type: null,
        target_entity_id: null,
        draft_payload_json: payload,
        status: "draft",
      })
      .select("id")
      .single();

    if (error || !data) return null;

    const draftId = (data as Record<string, unknown>).id as number;

    await logAudit({
      module_code: "AI",
      entity_name: "erp_ai_assistant_action_drafts",
      entity_id: draftId,
      entity_reference: `assistant-draft-${draftId}`,
      action: "assistant_draft_created",
      new_values: { session_id: sid, action_code: actionCode },
    });

    return draftId;
  };

  const turnResult = await runAssistantTurn({
    userMessage,
    sessionId,
    contextEntityType: sessionRow.context_entity_type as string | null,
    contextEntityId: sessionRow.context_entity_id as number | null,
    userPermissions,
    persistDraft,
  });

  // Persist assistant response (append-only)
  await supabase.from("erp_ai_assistant_messages").insert({
    session_id: sessionId,
    role: "assistant",
    message_text: turnResult.responseText.slice(0, 4000),
    output_type: turnResult.outputType,
    safe_metadata_json: {
      action_codes: turnResult.safeAuditMeta.actionCodes,
      draft_count: turnResult.safeAuditMeta.draftCount,
      blocked: turnResult.wasBlocked ?? false,
      ai_call_count: turnResult.safeAuditMeta.aiCallCount,
      duration_ms: turnResult.safeAuditMeta.durationMs,
    },
  });

  if (turnResult.wasBlocked) {
    await supabase.from("erp_ai_assistant_messages").insert({
      session_id: sessionId,
      role: "system_notice",
      message_text: "A dangerous action was requested and was blocked by the assistant safety layer.",
      output_type: "blocked_notice",
      safe_metadata_json: {
        blocked_action_codes: turnResult.safeAuditMeta.blockedActionCodes,
      },
    });
  }

  const newCount = (sessionRow.message_count as number) + 2;
  await supabase
    .from("erp_ai_assistant_sessions")
    .update({ message_count: newCount })
    .eq("id", sessionId);

  await logAudit({
    module_code: "AI",
    entity_name: "erp_ai_assistant_sessions",
    entity_id: sessionId,
    entity_reference: `assistant-session-${sessionId}`,
    action: "assistant_message_sent",
    new_values: {
      action_codes: turnResult.safeAuditMeta.actionCodes,
      draft_count: turnResult.safeAuditMeta.draftCount,
      blocked_action_codes: turnResult.safeAuditMeta.blockedActionCodes,
      duration_ms: turnResult.safeAuditMeta.durationMs,
    },
  });

  if (turnResult.wasBlocked) {
    await logAudit({
      module_code: "AI",
      entity_name: "erp_ai_assistant_sessions",
      entity_id: sessionId,
      entity_reference: `assistant-session-${sessionId}`,
      action: "assistant_blocked_action_requested",
      new_values: {
        blocked_action_codes: turnResult.safeAuditMeta.blockedActionCodes,
      },
    });
  }

  return {
    success: true,
    data: {
      responseText: turnResult.responseText,
      draftIds: turnResult.draftIds,
      navigationLinks: turnResult.navigationLinks,
      searchResultSummary: turnResult.searchResultSummary,
    },
  };
}

// ── getAssistantActionDrafts ───────────────────────────────────────────────────

export async function getAssistantActionDrafts(
  sessionId: number
): Promise<ActionResult<AssistantDraftRow[]>> {
  const ctx = await getAuthContext();
  if (!ctx.profile) return { success: false, error: "Not authenticated", code: "UNAUTHORIZED" };
  if (!canViewAssistant(ctx))
    return { success: false, error: "Insufficient permissions", code: "FORBIDDEN" };

  const parsed = sessionIdSchema.safeParse({ sessionId });
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input", code: "VALIDATION_ERROR" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("erp_ai_assistant_action_drafts")
    .select()
    .eq("session_id", sessionId)
    .is("deleted_at", null)
    .order("created_at");

  if (error) return { success: false, error: "Failed to load drafts", code: "DB_ERROR" };

  return { success: true, data: (data ?? []).map(r => mapDraftRow(r as Record<string, unknown>)) };
}

// ── dismissAssistantActionDraft ────────────────────────────────────────────────

export async function dismissAssistantActionDraft(draftId: number): Promise<ActionResult> {
  return updateDraftStatus(draftId, "dismissed", "assistant_draft_dismissed");
}

// ── markAssistantActionDraftReviewed ──────────────────────────────────────────

export async function markAssistantActionDraftReviewed(draftId: number): Promise<ActionResult> {
  return updateDraftStatus(draftId, "reviewed", "assistant_draft_reviewed");
}

// ── markAssistantActionDraftAccepted ──────────────────────────────────────────

export async function markAssistantActionDraftAccepted(draftId: number): Promise<ActionResult> {
  return updateDraftStatus(draftId, "accepted_for_manual_action", "assistant_draft_accepted_for_manual_action");
}

// ── Shared draft status updater ────────────────────────────────────────────────

async function updateDraftStatus(
  draftId: number,
  newStatus: string,
  auditAction: string
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!ctx.profile) return { success: false, error: "Not authenticated", code: "UNAUTHORIZED" };
  if (!canViewAssistant(ctx))
    return { success: false, error: "Insufficient permissions", code: "FORBIDDEN" };

  const parsed = draftIdSchema.safeParse({ draftId });
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input", code: "VALIDATION_ERROR" };

  const profileId = ctx.profile.id;
  const supabase = await createClient();

  const { data: draft } = await supabase
    .from("erp_ai_assistant_action_drafts")
    .select("id, session_id, status")
    .eq("id", draftId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!draft) return { success: false, error: "Draft not found", code: "NOT_FOUND" };
  const draftRow = draft as Record<string, unknown>;

  const { data: session } = await supabase
    .from("erp_ai_assistant_sessions")
    .select("owner_user_profile_id")
    .eq("id", draftRow.session_id)
    .maybeSingle();

  if (!session) return { success: false, error: "Session not found", code: "NOT_FOUND" };
  if ((session as Record<string, unknown>).owner_user_profile_id !== profileId && !isAdmin(ctx))
    return { success: false, error: "Access denied", code: "FORBIDDEN" };

  // Only update status/review fields — never draft_payload_json, action_code, safety_class
  const { error } = await supabase
    .from("erp_ai_assistant_action_drafts")
    .update({
      status: newStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: profileId,
    })
    .eq("id", draftId);

  if (error) return { success: false, error: "Failed to update draft", code: "DB_ERROR" };

  await logAudit({
    module_code: "AI",
    entity_name: "erp_ai_assistant_action_drafts",
    entity_id: draftId,
    entity_reference: `assistant-draft-${draftId}`,
    action: auditAction,
    new_values: { session_id: draftRow.session_id, new_status: newStatus },
  });

  return { success: true };
}

// ── Row mappers ────────────────────────────────────────────────────────────────

function mapSessionRow(row: Record<string, unknown>): AssistantSessionRow {
  return {
    id: row.id as number,
    sessionCode: row.session_code as string,
    title: (row.title as string | null) ?? null,
    ownerUserProfileId: row.owner_user_profile_id as number,
    contextEntityType: (row.context_entity_type as string | null) ?? null,
    contextEntityId: (row.context_entity_id as number | null) ?? null,
    status: row.status as AssistantSessionRow["status"],
    messageCount: row.message_count as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapMessageRow(row: Record<string, unknown>): AssistantMessageRow {
  return {
    id: row.id as number,
    sessionId: row.session_id as number,
    role: row.role as AssistantMessageRow["role"],
    messageText: row.message_text as string,
    outputType: (row.output_type as AssistantMessageRow["outputType"]) ?? null,
    safeMetadataJson: (row.safe_metadata_json as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  };
}

function mapDraftRow(row: Record<string, unknown>): AssistantDraftRow {
  return {
    id: row.id as number,
    sessionId: row.session_id as number,
    actionCode: row.action_code as string,
    safetyClass: row.safety_class as AssistantDraftRow["safetyClass"],
    targetEntityType: (row.target_entity_type as string | null) ?? null,
    targetEntityId: (row.target_entity_id as number | null) ?? null,
    draftPayloadJson: (row.draft_payload_json as AssistantActionDraftPayload) ?? {},
    status: row.status as AssistantDraftRow["status"],
    createdAt: row.created_at as string,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    reviewedBy: (row.reviewed_by as number | null) ?? null,
  };
}
