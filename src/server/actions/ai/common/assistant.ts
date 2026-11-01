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
import {beginQualityTurn,finishQualityTurn} from '@/server/ai/quality-turn';
import {withAiQualityUsage} from '@/server/ai/quality-usage-scope';
import { isFollowUp } from "@/lib/ai/assistant-guidance/planner";
import { entityReferenceSchema } from "@/lib/ai/foundation/contracts";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { canUseApplication } from "@/lib/rbac/scope";
import { logAudit } from "@/server/actions/audit";
import { runAssistantTurn, MAX_USER_MESSAGE_LENGTH } from "@/lib/ai/common/assistant/assistant-engine";
import { sanitizeForStorage } from "@/lib/ai/common/assistant/response-builder";
import { normalizeAssistantReference, readAuthorizedAssistantEntity } from "@/lib/ai/common/assistant/entity-access";
import { createAssistantHistoryBinding, createAssistantHistoryVerifier, HISTORY_WITHHELD, verifyAssistantSessionNow } from "@/lib/ai/common/assistant/history-access";
import type { AiEntityReference } from "@/lib/ai/foundation/contracts";
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
  return canUseApplication(ctx) && (
    hasPermission(ctx, "ai.assistant.use") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canViewAssistant(ctx: AuthCtx): boolean {
  return canUseApplication(ctx) && (
    hasPermission(ctx, "ai.assistant.use") ||
    hasPermission(ctx, "ai.assistant.view") ||
    hasPermission(ctx, "ai.assistant.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canPrepareDraft(ctx: AuthCtx): boolean {
  return canUseApplication(ctx) && (
    hasPermission(ctx, "ai.actions.prepare") ||
    ctx.roleCodes.includes("system_admin")
  );
}

// ── Input schemas ──────────────────────────────────────────────────────────────

const startSessionSchema = z.object({
  title: z.string().max(200).optional(),
  contextEntityType: z.string().max(100).optional(),
  contextEntityId: z.coerce.number().int().positive().optional(),
}).refine(v => (v.contextEntityType === undefined) === (v.contextEntityId === undefined), "Supply both context type and record identity");

const sendMessageSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
  userMessage: z.string().min(1).max(MAX_USER_MESSAGE_LENGTH),
  requestId:z.uuid().optional(),
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
  await verifyAssistantSessionNow();
  if (contextEntityType && contextEntityId && !await readAuthorizedAssistantEntity(contextEntityType, contextEntityId)) return { success: false, error: "Record context is unavailable", code: "FORBIDDEN" };
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

  if ((session as Record<string, unknown>).owner_user_profile_id !== profileId)
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

  if (messagesRes.error || draftsRes.error || !Array.isArray(messagesRes.data) || !Array.isArray(draftsRes.data)) return { success: false, error: "Conversation history could not be verified", code: "DB_ERROR" };
  await verifyAssistantSessionNow();
  const context = session.context_entity_type && session.context_entity_id ? await readAuthorizedAssistantEntity(session.context_entity_type as string, session.context_entity_id as number) : null;
  if ((session.context_entity_type || session.context_entity_id) && !context) return { success: false, error: "Record context is unavailable", code: "FORBIDDEN" };
  const verifyHistory = createAssistantHistoryVerifier(ctx, sessionId);
  const messages: AssistantMessageRow[] = [];
  for (const row of messagesRes.data ?? []) {
    const mapped = mapMessageRow(row as Record<string, unknown>);
    const valid = await verifyHistory((row.safe_metadata_json as Record<string, unknown> | null)?.ai_mod01_binding);
    messages.push(valid ? mapped : { ...mapped, messageText: HISTORY_WITHHELD, outputType: "blocked_notice", safeMetadataJson: {} });
  }
  const drafts: AssistantDraftRow[] = [];
  for (const row of draftsRes.data ?? []) {
    const mapped = mapDraftRow(row as Record<string, unknown>);
    const valid = await verifyHistory((row.draft_payload_json as Record<string, unknown> | null)?.historyBinding);
    drafts.push(valid ? mapped : { ...mapped, targetEntityType: null, targetEntityId: null, draftPayloadJson: { summary: HISTORY_WITHHELD } });
  }

  return {
    success: true,
    data: {
      ...mapSessionRow(session as Record<string, unknown>),
      title: context?.label ?? null,
      messages,
      drafts,
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

  const limitInput = z.number().int().min(1).max(50).safeParse(raw?.limit ?? 20);
  if (!limitInput.success) return { success: false, error: "Invalid session limit", code: "VALIDATION_ERROR" };
  const limit = limitInput.data;
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

  query = query.eq("owner_user_profile_id", profileId);

  const { data, error } = await query;
  if (error) return { success: false, error: "Failed to load sessions", code: "DB_ERROR" };

  await verifyAssistantSessionNow();
  const sessions: AssistantSessionRow[] = [];
  for (const row of data ?? []) {
    const context = row.context_entity_type && row.context_entity_id ? await readAuthorizedAssistantEntity(row.context_entity_type, row.context_entity_id) : null;
    if ((row.context_entity_type || row.context_entity_id) && !context) continue;
    sessions.push({ ...mapSessionRow(row as Record<string, unknown>), title: context?.label ?? null });
  }
  return { success: true, data: sessions };
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
  if ((session as Record<string, unknown>).owner_user_profile_id !== profileId)
    return { success: false, error: "Access denied", code: "FORBIDDEN" };

  const { error } = await supabase
    .from("erp_ai_assistant_sessions")
    // Archive is a retained status, not a soft-delete that conflicts with
    // the owner's existing SELECT policy or hides the retained audit record.
    .update({ status: "archived" })
    .eq("id", sessionId);

  if (error) return { success: false, error: "Failed to archive session", code: "DB_ERROR" };

  return { success: true };
}

// ── sendAssistantMessage ───────────────────────────────────────────────────────

export async function sendAssistantMessage(
  raw: SendAssistantMessageInput
): Promise<ActionResult<{
  responseText: string;
  messageId?:number;
  feedbackEligible?:boolean;
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

  const { sessionId, userMessage, requestId } = parsed.data;
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

  if (sessionRow.owner_user_profile_id !== profileId)
    return { success: false, error: "Access denied", code: "FORBIDDEN" };
  if (sessionRow.status !== "active")
    return { success: false, error: "Session is not active", code: "SESSION_INACTIVE" };
  if ((sessionRow.message_count as number) >= MAX_SESSION_MESSAGES)
    return {
      success: false,
      error: `Session has reached the maximum of ${MAX_SESSION_MESSAGES} messages. Start a new session.`,
      code: "SESSION_FULL",
    };

  await verifyAssistantSessionNow();
  const contextReference = sessionRow.context_entity_type && sessionRow.context_entity_id ? normalizeAssistantReference(sessionRow.context_entity_type as string, sessionRow.context_entity_id as number) : null;
  if ((sessionRow.context_entity_type || sessionRow.context_entity_id) && (!contextReference || !await readAuthorizedAssistantEntity(contextReference.entityType, contextReference.entityId))) return { success: false, error: "Record context is unavailable", code: "FORBIDDEN" };

  const userPermissions = ctx.permissionCodes;

  const persistDraft = async (
    sid: number,
    actionCode: AssistantActionCode,
    payload: AssistantActionDraftPayload,
    sources: readonly AiEntityReference[] = [],
  ): Promise<number | null> => {
    if (!canPrepareDraft(ctx)) return null;
    const historyBinding = await createAssistantHistoryBinding(ctx, sid, [...sources, ...(contextReference ? [contextReference] : [])]);
    if (!historyBinding) return null;
    await verifyAssistantSessionNow();
    const { data, error } = await supabase
      .from("erp_ai_assistant_action_drafts")
      .insert({
        session_id: sid,
        action_code: actionCode,
        safety_class: "draft_only",
        target_entity_type: null,
        target_entity_id: null,
        draft_payload_json: { ...payload, historyBinding },
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

  // Follow-ups reuse only a server-retained, owner/scope/source-version bound
  // subject. Neither model IDs nor an unbound old transcript confer context.
  let followUpReference = contextReference;
  if (isFollowUp(userMessage) && !followUpReference) {
    const previous = await supabase.from("erp_ai_assistant_messages").select("safe_metadata_json")
      .eq("session_id", sessionId).eq("role", "assistant").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
    if (previous.error) return { success: false, error: "Conversation context is unavailable", code: "DB_ERROR" };
    const meta = previous.data?.safe_metadata_json as Record<string, unknown> | undefined;
    const ref = entityReferenceSchema.safeParse(meta?.ai_mod03_subject);
    if (ref.success && await createAssistantHistoryVerifier(ctx, sessionId)(meta?.ai_mod03_subject_binding)) followUpReference = ref.data;
  }
  let qualityAdmission:Awaited<ReturnType<typeof beginQualityTurn>>;
  try{qualityAdmission=await beginQualityTurn(supabase,sessionId,requestId,userMessage);}catch{return {success:false,error:'This turn is paused, limited or retained for recovery. Reload the original conversation before sending again.',code:'HISTORY_UNCONFIRMED'};}
  const measured = await withAiQualityUsage(profileId,()=>runAssistantTurn({
    userMessage,
    sessionId,
    contextEntityType: followUpReference?.entityType ?? null,
    contextEntityId: followUpReference?.entityId ?? null,
    userPermissions,
    persistDraft,
  }));
  const turnResult=measured.result;

  await verifyAssistantSessionNow();
  const refs = [...(turnResult.sourceReferences ?? []), ...(contextReference ? [contextReference] : [])];
  const checkedBinding = await createAssistantHistoryBinding(ctx, sessionId, refs);
  if (refs.length && !checkedBinding) return { success: false, error: "Source access changed while processing; reopen the record before continuing", code: "FORBIDDEN" };
  const binding = turnResult.historyReplayAllowed === false ? null : checkedBinding;
  if (turnResult.guidance && checkedBinding && turnResult.guidance.evidence.some(item => {
    const current = checkedBinding.sources.find(s => s.reference.entityType === item.reference.entityType && s.reference.entityId === item.reference.entityId);
    return current && current.sourceVersion !== item.sourceVersion;
  })) return { success: false, error: "Source changed before conversation save. Reopen the current record.", code: "FORBIDDEN" };
  const followUp = turnResult.guidance?.subject;
  const subjectBinding = followUp ? await createAssistantHistoryBinding(ctx, sessionId, [followUp]) : null;
  // Append the pair atomically after its actual source binding is known.
  const saved = await supabase.from("erp_ai_assistant_messages").insert([{
    session_id: sessionId, role: "user", message_text: sanitizeForStorage(userMessage), output_type: "text",
    safe_metadata_json: { ai_mod01_binding: binding },
  }, {
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
      ai_mod01_binding: binding,
      ai_mod05_versions:{contract:'erp-ai/1',rules:'ai-mod05/1',model:measured.provenance.models.length===1?measured.provenance.models[0]:null,prompt:measured.provenance.prompts.length===1?measured.provenance.prompts[0]:null,models:measured.provenance.models,prompts:measured.provenance.prompts},
      ai_mod05_turn_request:requestId??null,
      ai_mod05_authority:qualityAdmission?.authorityHash??null,
      ai_mod03_subject: subjectBinding ? followUp : null,
      ai_mod03_subject_binding: subjectBinding,
      ai_mod03_links: binding ? turnResult.navigationLinks ?? [] : [],
    },
  }]).select('id,role');
  if (saved.error) return { success: false, error: "Conversation save is unconfirmed. Reconcile this session before retrying; processing must not be repeated automatically.", code: "HISTORY_UNCONFIRMED" };
  if(!await finishQualityTurn(supabase,qualityAdmission))return {success:false,error:'The saved conversation is retained; completion is unconfirmed. Reload it before sending another request.',code:'HISTORY_UNCONFIRMED'};

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
      messageId:saved.data?.find(row=>row.role==='assistant')?.id,
      feedbackEligible:binding!==null&&qualityAdmission!==null,
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

  const session = await getAssistantSession(sessionId);
  return session.success && session.data ? { success: true, data: session.data.drafts } : { success: false, error: session.error ?? "Drafts unavailable", code: session.code };
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
    .select("id, session_id, status, draft_payload_json")
    .eq("id", draftId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!draft) return { success: false, error: "Draft not found", code: "NOT_FOUND" };
  const draftRow = draft as Record<string, unknown>;

  await verifyAssistantSessionNow();
  if (newStatus !== "dismissed" && !await createAssistantHistoryVerifier(ctx, Number(draftRow.session_id))((draftRow.draft_payload_json as Record<string, unknown> | null)?.historyBinding)) return { success: false, error: "Draft source access is unavailable; reopen the permitted record before reviewing this draft", code: "FORBIDDEN" };

  const { data: session } = await supabase
    .from("erp_ai_assistant_sessions")
    .select("owner_user_profile_id")
    .eq("id", draftRow.session_id)
    .maybeSingle();

  if (!session) return { success: false, error: "Session not found", code: "NOT_FOUND" };
  if ((session as Record<string, unknown>).owner_user_profile_id !== profileId)
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
