import { createClient as createSdkClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assistantAuthorityFingerprint, HISTORY_WITHHELD } from "@/lib/ai/common/assistant/history-access";
import type { AiEntityReference } from "@/lib/ai/foundation/contracts";
import type { AuthContext } from "@/lib/rbac/check";
import { withDocumentReadPolicy } from "@/lib/supabase/document-read-policy";
import { getAssistantSession, sendAssistantMessage } from "@/server/actions/ai/common/assistant";

const state = vi.hoisted(() => ({
  db: undefined as SupabaseClient | undefined,
  ctx: undefined as AuthContext | undefined,
  auth: vi.fn(),
  engine: vi.fn(),
  audit: vi.fn(),
  finish: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.db }));
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: state.auth,
  hasPermission: (ctx: AuthContext, code: string) => ctx.permissionCodes.includes(code),
}));
vi.mock("@/server/actions/audit", () => ({ logAudit: state.audit }));
vi.mock("@/server/ai/quality-turn", () => ({ beginQualityTurn: async () => null, finishQualityTurn: state.finish }));
vi.mock("@/lib/ai/common/assistant/assistant-engine", () => ({ MAX_USER_MESSAGE_LENGTH: 1000, runAssistantTurn: state.engine }));

const sources = {
  company: ["owner_companies", "trade_name", "company_code"],
  party: ["parties", "display_name", "party_code"],
  branch: ["branches", "branch_name_en", "branch_code"],
  site: ["work_sites", "site_name", "site_code"],
  employee: ["employees", "full_name_en", "employee_code"],
  dependent: ["employee_dependents", "dependent_name_en", "dependent_name_en"],
  dms_document: ["dms_documents", "title", "document_no"],
} as const;

type FixtureRow = Record<string, unknown>;
type SourceCall = { table: string; ids: number[]; columns: string[]; rows: number; bytes: number; liveOnly: boolean };
const session = { id: 7, owner_user_profile_id: 11, context_entity_type: null, context_entity_id: null, status: "active", message_count: 0 };
const reference = (entityType: AiEntityReference["entityType"], entityId: number): AiEntityReference => ({ entityType, entityId });
const version = ({ entityType, entityId }: AiEntityReference) => `${entityType}-${entityId}-v1`;
let rows: Record<string, FixtureRow[]>;
let calls: SourceCall[];
let events: string[];
let protectedProjections: string[];
let inserts: FixtureRow[][];
let documentDeny: Set<number>;
let failedTables: Set<string>;
let sessionValid: boolean;
let featureEnabled: boolean;
let onSourceRead: (table: string) => void;

function seed(ref: AiEntityReference, extra: FixtureRow = {}) {
  const [table, label, code] = sources[ref.entityType];
  (rows[table] ??= []).push({
    id: ref.entityId,
    [label]: "SYNTHETIC authorization fixture with a long business label",
    [code]: "SYN-FIXTURE",
    updated_at: version(ref),
    deleted_at: null,
    ...extra,
  });
}

function savedBinding(refs: AiEntityReference[], staleVersion?: string) {
  return {
    version: 1,
    ownerProfileId: 11,
    sessionId: 7,
    authorityFingerprint: assistantAuthorityFingerprint(state.ctx!),
    sources: refs.map(ref => ({ reference: ref, sourceVersion: staleVersion ?? version(ref) })),
  };
}

function message(id: number, refs: AiEntityReference[], staleVersion?: string) {
  return {
    id,
    session_id: 7,
    role: "assistant",
    message_text: `Retained synthetic content ${id}`,
    safe_metadata_json: { ai_mod01_binding: savedBinding(refs, staleVersion) },
  };
}

async function fetchFixture(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(String(input));
  const endpoint = url.pathname.split("/").at(-1)!;
  const projections: Record<string, string> = {
    f03_read_documents: "dms_documents",
    f03_read_employee_dependents: "employee_dependents",
  };
  const table = projections[endpoint] ?? endpoint;
  if (projections[endpoint]) {
    expect(url.pathname).toContain("/rpc/");
    expect(init?.method).toBe("GET");
    protectedProjections.push(endpoint);
  }
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
  if (table === "f03_current_session_valid") {
    events.push("session fence");
    return response(sessionValid);
  }
  if (table === "f03_has_document_permission") {
    const { document_id, permission_code } = JSON.parse(String(init?.body));
    expect(permission_code).toBe("dms.documents.view");
    events.push(`document authority ${document_id}`);
    return response(!documentDeny.has(document_id));
  }
  if (table === "erp_ai_feature_flags") return response({ is_enabled: featureEnabled });
  if (table === "erp_ai_assistant_sessions" && init?.method === "PATCH") return response([]);
  if (table === "erp_ai_assistant_sessions") return response([session]);
  if (table === "erp_ai_assistant_messages" && init?.method === "POST") {
    events.push("stored pair");
    inserts.push(JSON.parse(String(init?.body)));
    return response([{ id: 70, role: "user" }, { id: 71, role: "assistant" }]);
  }
  if (table === "erp_ai_assistant_messages" || table === "erp_ai_assistant_action_drafts") return response(rows[table] ?? []);

  events.push(`source ${table}`);
  const rawFilter = url.searchParams.get("id") ?? "";
  const ids = rawFilter.startsWith("eq.") ? [Number(rawFilter.slice(3))] : rawFilter.slice(4, -1).split(",").map(Number);
  const columns = (url.searchParams.get("select") ?? "").split(",");
  const liveOnly = url.searchParams.get("deleted_at") === "is.null";
  if (failedTables.has(table)) return response({ message: "synthetic read failure", code: "57014" }, 400);
  const payload = (rows[table] ?? [])
    .filter(row => ids.includes(Number(row.id)) && row.visible !== false && (!liveOnly || row.deleted_at === null))
    .sort((a, b) => Number(b.id) - Number(a.id))
    .map(row => Object.fromEntries(columns.map(column => [column, row[column]])));
  calls.push({ table, ids, columns, rows: payload.length, bytes: Buffer.byteLength(JSON.stringify(payload)), liveOnly });
  onSourceRead(table);
  return response(payload);
}

beforeEach(() => {
  rows = {};
  calls = [];
  events = [];
  protectedProjections = [];
  inserts = [];
  documentDeny = new Set();
  failedTables = new Set();
  sessionValid = true;
  featureEnabled = true;
  onSourceRead = () => {};
  state.ctx = {
    profile: { id: 11, auth_user_id: "synthetic-user", must_change_password: false },
    isAccountActive: true,
    roleCodes: ["source_viewer"],
    permissionCodes: ["ai.assistant.use", "organizations.view", "master_data.parties.view", "branches.view", "common_md.view", "hr.employees.view", "dms.documents.view"],
    roleAssignments: [
      { roleId: 1, roleCode: "source_viewer", ownerCompanyId: 10, branchId: 101, permissionCodes: ["hr.employees.view", "dms.documents.view"] },
      { roleId: 2, roleCode: "org_viewer", ownerCompanyId: 20, branchId: 201, permissionCodes: ["organizations.view"] },
    ],
  } as AuthContext;
  state.auth.mockReset().mockImplementation(async () => state.ctx);
  state.engine.mockReset();
  state.audit.mockReset().mockImplementation(async () => { events.push("send audit"); });
  state.finish.mockReset().mockImplementation(async () => {
    events.push("finished turn");
    return true;
  });
  state.db = withDocumentReadPolicy(createSdkClient("https://assistant.synthetic.invalid", "fixture-only", {
    global: { fetch: fetchFixture },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
});

function modelResult(refs: AiEntityReference[], expectedVersions = refs.map(version)) {
  return {
    responseText: "SYNTHETIC response",
    outputType: "text",
    sourceReferences: refs,
    guidance: { evidence: refs.map((ref, i) => ({ reference: ref, sourceVersion: expectedVersions[i] })), subject: refs[0] },
    safeAuditMeta: { actionCodes: [], draftCount: 0, blockedActionCodes: [], aiCallCount: 0, durationMs: 1 },
  };
}

describe("Assistant authorization through the pinned PostgREST SDK", () => {
  it("loads 50 current history references in one exact version-only request", async () => {
    const refs = Array.from({ length: 50 }, (_, position) => reference("company", position + 1));
    refs.forEach(ref => seed(ref));
    rows.erp_ai_assistant_messages = refs.map((ref, index) => message(index + 1, [ref]));

    const started = performance.now();
    const result = await getAssistantSession(7);
    const historyMs = performance.now() - started;
    expect(result.data?.messages.map(row => row.messageText)).toEqual(refs.map(ref => `Retained synthetic content ${ref.entityId}`));
    if (process.env.ASSISTANT_SCOPE_BENCH === "1") {
      console.log(JSON.stringify({ sample: "history", auth: state.auth.mock.calls.length, requests: calls.length, rows: calls.reduce((sum, call) => sum + call.rows, 0), bytes: calls.reduce((sum, call) => sum + call.bytes, 0), ms: historyMs }));
    }
    expect(calls).toEqual([{ table: "owner_companies", ids: refs.map(ref => ref.entityId), columns: ["id", "updated_at"], rows: 50, bytes: Buffer.byteLength(JSON.stringify(refs.map(ref => ({ id: ref.entityId, updated_at: version(ref) })))), liveOnly: false }]);
    expect(state.auth).toHaveBeenCalledTimes(2);
  });

  it("withholds history if an assignment is revoked after the source read while another grant retains row visibility", async () => {
    const ref = reference("company", 1);
    seed(ref);
    rows.erp_ai_assistant_messages = [message(1, [ref])];
    onSourceRead = () => {
      state.ctx = { ...state.ctx!, roleAssignments: state.ctx!.roleAssignments?.filter(assignment => assignment.roleId !== 1) };
    };

    const result = await getAssistantSession(7);
    expect(result).toMatchObject({ success: false, code: "FORBIDDEN" });
    expect(result.data).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it("skips the final authority lookup for a history page where all retained content is withheld", async () => {
    rows.erp_ai_assistant_messages = [message(1, [reference("company", 1)])];
    const result = await getAssistantSession(7);
    expect(result.data?.messages[0].messageText).toBe(HISTORY_WITHHELD);
    expect(state.auth).toHaveBeenCalledTimes(1);
  });

  it("preserves source type, current version, deleted HR and independent DMS scope across partial history", async () => {
    const permitted = (Object.keys(sources) as AiEntityReference["entityType"][]).map(type => reference(type, 1));
    permitted.forEach(ref => seed(ref));
    const moved = reference("employee", 2);
    const revoked = reference("dms_document", 2);
    const deleted = reference("dependent", 2);
    seed(moved, { visible: false, owner_company_id: 20, branch_id: 202 });
    seed(revoked);
    documentDeny.add(revoked.entityId);
    seed(deleted, { deleted_at: "2026-11-23T00:00:00Z" });
    rows.erp_ai_assistant_messages = [
      message(1, permitted), message(2, [moved]), message(3, [revoked]), message(4, [deleted]),
      message(5, [reference("employee", 1)], version(reference("company", 1))),
      message(6, [reference("company", 1)]),
    ];
    rows.erp_ai_assistant_action_drafts = [
      { id: 10, draft_payload_json: { summary: "Current draft", historyBinding: savedBinding([reference("company", 1)]) } },
      { id: 11, draft_payload_json: { summary: "Revoked draft", historyBinding: savedBinding([revoked]) } },
    ];

    const result = await getAssistantSession(7);
    expect(result.data?.messages.map(row => row.messageText)).toEqual([
      "Retained synthetic content 1", HISTORY_WITHHELD, HISTORY_WITHHELD, HISTORY_WITHHELD, HISTORY_WITHHELD, "Retained synthetic content 6",
    ]);
    expect(result.data?.drafts.map(row => row.draftPayloadJson.summary)).toEqual(["Current draft", HISTORY_WITHHELD]);
    expect(events.filter(event => event.startsWith("document authority"))).toEqual(["document authority 1", "document authority 2"]);
    expect(calls.filter(call => call.table === "dms_documents").map(call => call.ids)).toEqual([[1]]);
    expect(calls.filter(call => call.liveOnly).map(call => call.table).sort()).toEqual(["employee_dependents", "employees"]);
    expect(protectedProjections.sort()).toEqual(["f03_read_documents", "f03_read_employee_dependents"]);
  });

  it("reports a source read failure and leaves absent permission without a source read", async () => {
    const branch = reference("branch", 1);
    const company = reference("company", 1);
    seed(branch);
    seed(company);
    state.ctx!.permissionCodes = state.ctx!.permissionCodes.filter(code => code !== "branches.view");
    rows.erp_ai_assistant_messages = [message(1, [branch]), message(2, [company])];
    failedTables.add("owner_companies");
    await expect(getAssistantSession(7)).rejects.toThrow("Record authority unavailable");
    expect(events).not.toContain("source branches");
  });

  it("keeps a withheld binding with an unreached source error from blocking the rest of history", async () => {
    const missing = reference("branch", 1);
    const unavailable = reference("party", 1);
    const permitted = reference("company", 1);
    seed(permitted);
    rows.erp_ai_assistant_messages = [message(1, [missing, unavailable]), message(2, [permitted])];
    failedTables.add("parties");

    const result = await getAssistantSession(7);
    expect(result.data?.messages.map(row => row.messageText)).toEqual([HISTORY_WITHHELD, "Retained synthetic content 2"]);
  });

  it("keeps the original 50-reference budget when messages and drafts exceed it", async () => {
    const refs = Array.from({ length: 51 }, (_, position) => reference("company", position + 1));
    refs.forEach(ref => seed(ref));
    rows.erp_ai_assistant_messages = refs.slice(0, 50).map((ref, index) => message(index + 1, [ref]));
    rows.erp_ai_assistant_action_drafts = [
      { id: 80, draft_payload_json: { summary: "Unverified beyond limit", historyBinding: savedBinding([refs[50]]) } },
      { id: 81, draft_payload_json: { summary: "Already verified", historyBinding: savedBinding([refs[0]]) } },
    ];

    const result = await getAssistantSession(7);
    expect(result.data?.drafts.map(row => row.draftPayloadJson.summary)).toEqual([HISTORY_WITHHELD, "Already verified"]);
    expect(calls.flatMap(call => call.ids)).toEqual(refs.slice(0, 50).map(ref => ref.entityId));
  });

  it("batches publication after the model and retains the independently checked follow-up subject", async () => {
    const refs = Array.from({ length: 8 }, (_, position) => reference("company", position + 1));
    refs.forEach(ref => seed(ref));
    state.engine.mockImplementation(async () => {
      events.push("model returned");
      return modelResult(refs);
    });

    const started = performance.now();
    const result = await sendAssistantMessage({ sessionId: 7, userMessage: "Summarize these records" });
    const publicationMs = performance.now() - started;
    expect(result.data?.messageId).toBe(71);
    expect(inserts[0][1].safe_metadata_json).toMatchObject({
      ai_mod01_binding: savedBinding(refs), ai_mod03_subject: refs[0], ai_mod03_subject_binding: savedBinding([refs[0]]),
    });
    if (process.env.ASSISTANT_SCOPE_BENCH === "1") {
      console.log(JSON.stringify({ sample: "publication", auth: state.auth.mock.calls.length, requests: calls.length, rows: calls.reduce((sum, call) => sum + call.rows, 0), bytes: calls.reduce((sum, call) => sum + call.bytes, 0), ms: publicationMs }));
    }
    expect(calls.map(call => call.ids)).toEqual([refs.map(ref => ref.entityId), [refs[0].entityId]]);
    expect(state.auth).toHaveBeenCalledTimes(5);
    expect(events).toEqual([
      "session fence", "model returned", "session fence", "source owner_companies", "source owner_companies",
      "stored pair", "finished turn", "send audit",
    ]);
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "assistant_message_sent" }));
  });

  it.each(["source batch", "follow-up subject"])("prevents append after assignment revocation during the %s", async stage => {
    const refs = [reference("company", 1), reference("company", 2)];
    refs.forEach(ref => seed(ref));
    state.engine.mockImplementation(async () => {
      const result = modelResult(refs);
      return stage === "source batch"
        ? { ...result, guidance: { ...result.guidance, subject: undefined } }
        : result;
    });
    const revokeAfterRead = stage === "source batch" ? 1 : 2;
    state.finish.mockResolvedValue(false);
    onSourceRead = () => {
      if (calls.length === revokeAfterRead) {
        state.ctx = { ...state.ctx!, roleAssignments: state.ctx!.roleAssignments?.filter(assignment => assignment.roleId !== 1) };
      }
    };

    const result = await sendAssistantMessage({ sessionId: 7, userMessage: "Summarize these records" });
    expect(calls.map(call => call.rows)).toEqual(stage === "source batch" ? [2] : [2, 1]);
    expect(inserts).toEqual([]);
    expect(result).toMatchObject({ success: false, code: "FORBIDDEN" });
    expect(result.data).toBeUndefined();
    expect(state.finish).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });

  it.each(["role revocation", "assignment revocation", "scope relink", "version change", "document revocation", "session revocation"])("stops publication after %s during a model turn", async change => {
    const ref = reference(change === "document revocation" ? "dms_document" : "employee", 1);
    seed(ref);
    state.engine.mockImplementation(async () => {
      if (change === "session revocation") sessionValid = false;
      if (change === "role revocation") state.ctx = { ...state.ctx!, permissionCodes: ["ai.assistant.use", "organizations.view"] };
      if (change === "assignment revocation") state.ctx = { ...state.ctx!, roleAssignments: state.ctx!.roleAssignments?.filter(assignment => assignment.roleId !== 2) };
      if (change === "scope relink") {
        rows.employees[0].visible = false;
        rows.employees[0].branch_id = 202;
      }
      if (change === "version change") rows.employees[0].updated_at = "moved-v2";
      if (change === "document revocation") documentDeny.add(ref.entityId);
      return modelResult([ref]);
    });

    const result = sendAssistantMessage({ sessionId: 7, userMessage: "Summarize this record" });
    if (change === "session revocation") await expect(result).rejects.toThrow("Current session unavailable");
    else expect((await result).code).toBe("FORBIDDEN");
    expect(inserts).toEqual([]);
    expect(state.audit).not.toHaveBeenCalled();
    if (["role revocation", "assignment revocation", "document revocation", "session revocation"].includes(change)) expect(calls).toEqual([]);
  });

  it("stops a paused send before reading history or invoking its synthetic provider", async () => {
    featureEnabled = false;
    expect((await sendAssistantMessage({ sessionId: 7, userMessage: "Summarize this record" })).code).toBe("FEATURE_DISABLED");
    expect(events).toEqual([]);
    expect(state.engine).not.toHaveBeenCalled();
  });
});
