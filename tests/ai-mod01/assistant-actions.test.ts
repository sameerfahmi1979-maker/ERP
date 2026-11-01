import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ ctx: {} as Record<string, unknown>, session: {} as Record<string, unknown>, messages: [] as Record<string, unknown>[], drafts: [] as Record<string, unknown>[], tableErrors: {} as Record<string, unknown>, calls: [] as Array<[string, string, ...unknown[]]>, engine: vi.fn(), binding: vi.fn() }));
vi.mock("nanoid", () => ({ nanoid: () => "SYNTHETIC-SESSION" }));
// These history regression cases model the older deployed database. Installed
// AI05 admission/replay/failure behavior is covered by ai-mod05 tests/native SQL.
vi.mock('@/server/ai/quality-turn',()=>({beginQualityTurn:async()=>null,finishQualityTurn:async()=>true}));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: async () => state.ctx, hasPermission: (ctx: { permissionCodes: string[] }, code: string) => ctx.permissionCodes.includes(code) }));
vi.mock("@/server/actions/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/ai/common/assistant/assistant-engine", () => ({ MAX_USER_MESSAGE_LENGTH: 1000, runAssistantTurn: state.engine }));
vi.mock("@/lib/ai/common/assistant/entity-access", () => ({ normalizeAssistantReference: (entityType: string, entityId: number) => ({ entityType, entityId }), readAuthorizedAssistantEntity: async () => ({ label: "SYNTHETIC", version: "v1" }) }));
vi.mock("@/lib/ai/common/assistant/history-access", () => ({ HISTORY_WITHHELD: "SOURCE WITHHELD", verifyAssistantSessionNow: async () => {}, createAssistantHistoryBinding: state.binding, createAssistantHistoryVerifier: () => async (raw: { current?: boolean }) => raw?.current === true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from(table: string) {
  const rows = () => table === "erp_ai_assistant_messages" ? state.messages : table === "erp_ai_assistant_action_drafts" ? state.drafts : [state.session];
  let operation = "read";
  const q: Record<string, unknown> = {};
  for (const key of ["select", "eq", "is", "neq", "order", "limit", "insert", "update"]) q[key] = (...args: unknown[]) => { state.calls.push([table, key, ...args]); if (key === "insert" || key === "update") operation = key; return q; };
  q.maybeSingle = async () => ({ data: table === "erp_ai_assistant_action_drafts" ? state.drafts[0] ?? null : table === "erp_ai_assistant_messages" ? state.messages[0] ?? null : state.session, error: state.tableErrors[table] ?? null });
  q.single = async () => ({ data: table === "erp_ai_feature_flags" ? { is_enabled: true } : operation === "insert" ? { id: 99 } : state.session, error: state.tableErrors[table] ?? null });
  q.then = (done: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: state.tableErrors[table] ?? null }).then(done);
  return q;
} }) }));
import { getAssistantSession, getAssistantSessions, getAssistantActionDrafts, sendAssistantMessage, startAssistantSession, markAssistantActionDraftReviewed, archiveAssistantSession } from "@/server/actions/ai/common/assistant";

beforeEach(() => {
  state.ctx = { profile: { id: 11, must_change_password: false }, isAccountActive: true, roleCodes: ["system_admin"], permissionCodes: ["ai.assistant.use", "ai.actions.prepare"] };
  state.session = { id: 7, owner_user_profile_id: 11, context_entity_type: null, context_entity_id: null, status: "active", message_count: 0, session_code: "SYNTHETIC", title: "OLD SENSITIVE TITLE" };
  state.messages = [{ id: 1, session_id: 7, role: "assistant", message_text: "OLD SOURCE TEXT", safe_metadata_json: {} }];
  state.drafts = [{ id: 2, session_id: 7, draft_payload_json: { summary: "OLD DRAFT" } }];
  state.tableErrors = {}; state.calls = []; state.engine.mockReset().mockResolvedValue({ responseText: "SYNTHETIC", outputType: "text", safeAuditMeta: { actionCodes: [], draftCount: 0, blockedActionCodes: [], aiCallCount: 0, durationMs: 1 } });
  state.binding.mockReset().mockResolvedValue({ current: true });
});
describe("Assistant server-action history/caller adoption", () => {
  it("reuses only a verified subject binding for follow-ups", async () => {
    state.messages[0].safe_metadata_json = { ai_mod03_subject: { entityType: "employee", entityId: 31 }, ai_mod03_subject_binding: { current: true } };
    await sendAssistantMessage({ sessionId: 7, userMessage: "What about his passport?" });
    expect(state.engine.mock.calls[0][0]).toMatchObject({ contextEntityType: "employee", contextEntityId: 31 });
  });
  it("does not reuse naked or stale subject metadata", async () => {
    state.messages[0].safe_metadata_json = { ai_mod03_subject: { entityType: "employee", entityId: 31 }, ai_mod03_subject_binding: { current: false } };
    await sendAssistantMessage({ sessionId: 7, userMessage: "What about his passport?" });
    expect(state.engine.mock.calls[0][0]).toMatchObject({ contextEntityType: null, contextEntityId: null });
  });
  it("does not process a follow-up after failed context reconciliation", async () => { state.tableErrors.erp_ai_assistant_messages = {}; const r = await sendAssistantMessage({ sessionId: 7, userMessage: "What about his passport?" }); expect(r.code).toBe("DB_ERROR"); expect(state.engine).not.toHaveBeenCalled(); });
  it("loads the actual draft binding before a reviewed status transition", async () => {
    state.drafts[0].draft_payload_json = { summary: "Synthetic", historyBinding: { current: true } };
    expect((await markAssistantActionDraftReviewed(2)).success).toBe(true);
    expect(state.calls).toContainEqual(["erp_ai_assistant_action_drafts", "select", "id, session_id, status, draft_payload_json"]);
  });
  it("archives through a retained status without the legacy soft-delete conflict", async () => { expect((await archiveAssistantSession(7)).success).toBe(true); expect(state.calls).toContainEqual(["erp_ai_assistant_sessions","update",{status:"archived"}]); });
  it("denies cross-owner history to an AI/global administrator", async () => {
    state.session.owner_user_profile_id = 12; const result = await getAssistantSession(7);
    expect(result.success).toBe(false); expect(state.calls.some(c => c[0] === "erp_ai_assistant_messages")).toBe(false);
  });
  it("keeps raw legacy messages, titles and draft payloads out of returned history", async () => {
    const result = await getAssistantSession(7); expect(result.success).toBe(true);
    expect(result.data!.title).toBeNull(); expect(result.data!.messages[0].messageText).toBe("SOURCE WITHHELD"); expect(result.data!.drafts[0].draftPayloadJson.summary).toBe("SOURCE WITHHELD");
  });
  it("replays only current bound content", async () => {
    state.messages[0].safe_metadata_json = { ai_mod01_binding: { current: true } }; state.drafts[0].draft_payload_json = { summary: "CURRENT SYNTHETIC", historyBinding: { current: true } };
    const result = await getAssistantSession(7); expect(result.data!.messages[0].messageText).toBe("OLD SOURCE TEXT"); expect(result.data!.drafts[0].draftPayloadJson.summary).toBe("CURRENT SYNTHETIC");
  });
  it("does not render a failed message read as an empty history", async () => { state.tableErrors.erp_ai_assistant_messages = {}; const r = await getAssistantSession(7); expect(r.success).toBe(false); expect(r.code).toBe("DB_ERROR"); });
  it("uses owner filtering even for administrator session lists", async () => { await getAssistantSessions(); expect(state.calls).toContainEqual(["erp_ai_assistant_sessions", "eq", "owner_user_profile_id", 11]); });
  it.each([0, -1, NaN, Infinity, 51])("rejects invalid session page limit %s", async limit => expect((await getAssistantSessions({ limit })).success).toBe(false));
  it("uses the same verified reader for draft-only views", async () => { const r = await getAssistantActionDrafts(7); expect(r.data![0].draftPayloadJson.summary).toBe("SOURCE WITHHELD"); });
  it("refuses to review an unbound or revoked draft", async () => { const r = await markAssistantActionDraftReviewed(2); expect(r.success).toBe(false); expect(state.calls.some(c => c[0] === "erp_ai_assistant_action_drafts" && c[1] === "update")).toBe(false); });
  it("does not run a model on another owner's session", async () => { state.session.owner_user_profile_id = 12; expect((await sendAssistantMessage({ sessionId: 7, userMessage: "SYNTHETIC" })).success).toBe(false); expect(state.engine).not.toHaveBeenCalled(); });
  it("saves the prompt/answer pair together with current binding", async () => {
    const r = await sendAssistantMessage({ sessionId: 7, userMessage: "SYNTHETIC" }); expect(r.success).toBe(true);
    const saved = state.calls.find(c => c[0] === "erp_ai_assistant_messages" && c[1] === "insert")![2] as Array<Record<string, unknown>>;
    expect(saved).toHaveLength(2); expect(saved.map(x => x.role)).toEqual(["user", "assistant"]); expect((saved[0].safe_metadata_json as Record<string, unknown>).ai_mod01_binding).toEqual({ current: true });
  });
  it("does not claim the history was saved when the write is unconfirmed", async () => { state.tableErrors.erp_ai_assistant_messages = {}; const r = await sendAssistantMessage({ sessionId: 7, userMessage: "SYNTHETIC" }); expect(r.code).toBe("HISTORY_UNCONFIRMED"); expect(state.engine).toHaveBeenCalledTimes(1); });
  it("does not serialize replay-unsafe composite responses as verified history", async () => { state.engine.mockResolvedValue({ responseText: "SYNTHETIC", outputType: "text", historyReplayAllowed: false, safeAuditMeta: {} }); await sendAssistantMessage({ sessionId: 7, userMessage: "SYNTHETIC" }); const pair = state.calls.find(c => c[0] === "erp_ai_assistant_messages" && c[1] === "insert")![2] as Array<Record<string, unknown>>; expect((pair[1].safe_metadata_json as Record<string, unknown>).ai_mod01_binding).toBe(null); });
  it("rejects one-sided context and inactive/password-held administrators", async () => {
    expect((await startAssistantSession({ contextEntityId: 7 })).success).toBe(false);
    state.ctx.isAccountActive = false; expect((await getAssistantSession(7)).success).toBe(false);
    state.ctx.isAccountActive = true; (state.ctx.profile as Record<string, unknown>).must_change_password = true; expect((await getAssistantSessions()).success).toBe(false);
  });
});
