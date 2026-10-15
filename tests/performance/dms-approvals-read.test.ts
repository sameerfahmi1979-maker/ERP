import {beforeEach, describe, expect, it, vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
import {syntheticAuthContext} from "./fixtures/auth-context";
import {readDmsApprovals} from "@/server/reads/dms-approvals";
import {POST} from "@/app/api/reads/dms-approvals/route";
import {dmsApprovalRequestSchema, dmsApprovalQueueCriteriaSchema, dmsApprovalHistoryPageSchema} from "@/lib/reads/dms-approvals-schema";
import {literalContains} from "@/lib/reads/search";
const mocks = vi.hoisted(() => ({auth: vi.fn(), create: vi.fn(), resolve: vi.fn()}));
vi.mock("@/lib/rbac/check", async actual => ({...await actual<typeof import("@/lib/rbac/check")>(), getAuthContext: mocks.auth}));
vi.mock("@/lib/supabase/server", () => ({createClient: mocks.create}));
type Call = [string, ...unknown[]];
const calls: {source: string; args: unknown; calls: Call[]}[] = [];
let queueDocs: ReturnType<typeof doc>[] = [];
function chain(source: string, args?: unknown) {
  const entry = {source, args, calls: [] as Call[]}; calls.push(entry);
  const q: Record<string, unknown> = {};
  for (const name of ["select", "eq", "in", "is", "not", "or", "limit", "range", "order", "abortSignal"])
    q[name] = (...values: unknown[]) => {entry.calls.push([name, ...values]); return q;};
  q.then = (resolve: (value: unknown) => void, reject: (error: unknown) => void) => Promise.resolve().then(()=>{
    if(source==="dms_document_approvals"&&entry.calls.some(c=>c[0]==="select"&&c[1]==="id,document_id,is_current")){
      const rows=queueDocs.flatMap(d=>d.current_approval.map(a=>({...a,document_id:d.id})));return{data:rows,count:rows.length,error:null};
    }
    const r=mocks.resolve(entry);if(source==="dms_documents"&&Array.isArray(r?.data))queueDocs=r.data;return r;
  }).then(resolve,reject);
  return q;
}
function context(codes = ["dms.approvals.view"]): AuthContext {return syntheticAuthContext(codes, {id: 6, auth_user_id: "synthetic"});}
const doc = (id = 1) => ({id, document_no: `SYN-${id}`, title: `Synthetic ${id}`, approval_status: "pending_approval", submitted_by: 9, submitted_at: null,
  owner_user_id: 9, created_by: 9, document_type: null, submitter: null, confidentiality_level: "internal", owner: null, current_approval: [{id: id + 5000, is_current: true}]});
const history = (id = 1) => ({id, document_id: 1, action: "approved", actioned_by: 9, actioned_at: "2026-10-05T00:00:00Z", submitted_by: 9,
  submitted_at: null, reason: null, comments: `Comment ${id}`, is_current: false, workflow_id: null, step_id: null, created_at: "2026-10-05T00:00:00Z",
  actioned_by_profile: null, submitted_by_profile: null});
const current = {id: 31, action: "submitted", workflow_id: null, step_id: null, reason: null, comments: "Private comment"};
beforeEach(() => {vi.clearAllMocks(); calls.length = 0;queueDocs=[]; mocks.auth.mockResolvedValue(context());
  mocks.create.mockResolvedValue({from: (name: string) => chain(name), rpc: (name: string, args: unknown) => chain(name, args)});
  mocks.resolve.mockImplementation(entry => entry.source === "f05_document_approval_capabilities"
    ? {data: (entry.args as {document_ids: number[]}).document_ids.map(document_id => ({document_id, can_act: false, can_withdraw: false})), error: null}
    : {data: [doc()], count: 1, error: null});
});
describe("bounded approval readers", () => {
  it("reads beyond the old default cap, with complete counted page and only page-ID capability checks", async () => {
    const rows = Array.from({length: 1301}, (_, i) => doc(i + 1));
    mocks.resolve.mockImplementation(entry => {
      if (entry.source === "f05_document_approval_capabilities") return {data: entry.args.document_ids.map((document_id: number) => ({document_id, can_act: false, can_withdraw: false})), error: null};
      const [from, to] = entry.calls.find((c: Call) => c[0] === "range").slice(1) as number[];
      return {data: rows.slice(from, to + 1), count: rows.length, error: null};
    });
    const result = await readDmsApprovals({mode: "queue", page: 51});
    expect(result.success).toBe(true); if (!result.success || !("rows" in result.data)) throw Error("wrong response");
    expect(result.data.totalCount).toBe(1301); expect(result.data.rows).toHaveLength(20);
    expect(result.data.rows[0]).toMatchObject({documentId: 1001});
    expect(calls.find(c=>c.source==="f05_document_approval_capabilities")!.args).toEqual({document_ids: Array.from({length: 20}, (_, i) => 1001 + i)});
    expect(calls[0].calls).toContainEqual(["range", 1000, 1019]);
    expect(calls[1].calls).toContainEqual(["in","document_id",Array.from({length:20},(_,i)=>1001+i)]);
    expect(calls[1].calls).toContainEqual(["eq","is_current",true]);
    expect(calls[1].calls).toContainEqual(["range",0,20]);
  });
  it("passes literal wildcard/quote/whitespace search, status/type/order and deterministic ID tie to the authorized relation", async () => {
    const search = ' a%,_("ب")\\ ';
    await readDmsApprovals({mode: "queue", status: "rejected", search, documentTypeId: 4, sortBy: "title", sortDirection: "asc"});
    expect(calls[0].calls).toContainEqual(["or", `title.ilike.${literalContains(search)},document_no.ilike.${literalContains(search)}`]);
    expect(calls[0].calls).toContainEqual(["eq", "approval_status", "rejected"]);
    expect(calls[0].calls).toContainEqual(["eq", "document_type_id", 4]);
    expect(calls[0].calls.filter(c => c[0] === "order")).toEqual([["order", "title", {ascending: true}], ["order", "id", {ascending: true}]]);
    const projection = calls[0].calls.find(c => c[0] === "select")![1] as string;
    expect(projection).not.toContain("*"); expect(projection).not.toContain("!inner");
    expect(projection).not.toMatch(/comments|reason|file_path|storage|signature/);
  });
  it("all status does not add an approval-status equality or broaden deleted/nonnull constraints", async () => {
    await readDmsApprovals({mode: "queue", status: "all"});
    expect(calls[0].calls).toContainEqual(["is", "deleted_at", null]);
    expect(calls[0].calls).toContainEqual(["not", "approval_status", "is", null]);
    expect(calls[0].calls.filter(c => c[0] === "eq" && c[1] === "approval_status")).toEqual([]);
  });
  it("keeps confidential redaction and independently hidden related labels", async () => {
    mocks.resolve.mockImplementation(entry => entry.source.startsWith("f05_") ? {data: [{document_id: 1, can_act: false, can_withdraw: false}], error: null}
      : {data: [{...doc(), confidentiality_level: "finance", document_type: {name_en: "Hidden type"}}], count: 1, error: null});
    const result = await readDmsApprovals({mode: "queue"});
    expect(result).toMatchObject({success: true, data: {rows: [{title: "[Restricted Document]", documentNo: "—", documentTypeName: null, isRedacted: true, ownerName: null, submittedByName: null}]}});
  });
  it.each(["count-null", "short-page", "duplicate-current", "missing-capability", "duplicate-capability", "wrong-capability", "string-capability", "read-error"])("fails honestly for %s", async mode => {
    mocks.resolve.mockImplementation(entry => {
      if (entry.source.startsWith("f05_")) {const row = {document_id: mode === "wrong-capability" ? 2 : 1, can_act: mode === "string-capability" ? "true" : false, can_withdraw: false};
        return {data: mode === "missing-capability" ? [] : mode === "duplicate-capability" ? [row, row] : [row], error: null};}
      return {data: [{...doc(), current_approval: mode === "duplicate-current" ? [{id: 2, is_current: true}, {id: 3, is_current: true}] : doc().current_approval}],
        count: mode === "count-null" ? null : mode === "short-page" ? 30 : 1, error: mode === "read-error" ? {message: "PRIVATE SQL"} : null};
    });
    const result = await readDmsApprovals({mode: "queue"}); expect(result).toMatchObject({success: false, kind: "unavailable"});
    expect(JSON.stringify(result)).not.toContain("PRIVATE SQL"); expect(result).not.toHaveProperty("data");
  });
  it("retains the original true-only grant for legitimate SQL NULL capability expressions", async () => {
    mocks.resolve.mockImplementation(entry => entry.source.startsWith("f05_") ? {data: [{document_id: 1, can_act: null, can_withdraw: null}], error: null}
      : {data: [{...doc(), submitted_by: null}], count: 1, error: null});
    expect(await readDmsApprovals({mode: "queue"})).toMatchObject({success: true, data: {rows: [{canAct: false, canWithdraw: false}]}});
  });
  it("recounts a legitimate out-of-range page without disguising other failures as empty", async () => {
    mocks.resolve.mockImplementation(entry => (entry.calls.find((c: Call) => c[0] === "select")?.[2] as {head: boolean})?.head
      ? {data: null, count: 10, error: null} : {data: null, count: null, status: 416, error: {code: "PGRST103"}});
    expect(await readDmsApprovals({mode: "queue", page: 2})).toMatchObject({success: true, data: {rows: [], totalCount: 10}});
    expect(calls).toHaveLength(2);
  });
  it("does not admit missing, inactive, forced-password or unpermitted principals", async () => {
    for (const auth of [{...context(), profile: null}, {...context(), isAccountActive: false}, {...context(), profile: {...context().profile!, must_change_password: true}}, context([])])
      expect(await readDmsApprovals({mode: "queue"}, auth)).toMatchObject({success: false, error: "Permission denied"});
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("honors cancellation before client creation and after a read without disclosing stale rows", async () => {
    const before = new AbortController(); before.abort(); await expect(readDmsApprovals({mode: "queue"}, context(), before.signal)).rejects.toMatchObject({name: "AbortError"});
    expect(mocks.create).not.toHaveBeenCalled();
    const after = new AbortController(); mocks.resolve.mockImplementation(() => {after.abort(); return {data: [doc()], count: 1, error: null};});
    await expect(readDmsApprovals({mode: "queue"}, context(), after.signal)).rejects.toMatchObject({name: "AbortError"});
    expect(calls[0].calls).toContainEqual(["abortSignal", after.signal]); expect(calls).toHaveLength(1);
  });
});
describe("lazy document state/history authorization", () => {
  function stateSetup(submittedBy = 9, capabilityValue: unknown = true, currentRows = [current]) {mocks.resolve.mockImplementation(entry => entry.source === "dms_documents"
    ? {data: [{...doc(), submitted_by: submittedBy, status: "active", document_type_id: null}], count: 1, error: null}
    : entry.source === "dms_document_approvals" ? {data: currentRows, count: currentRows.length, error: null}
    : {data: [{document_id: 1, can_act: submittedBy === 6 ? false : capabilityValue, can_withdraw: submittedBy === 6}], error: null});}
  it("preserves self-exclusion and submitter withdrawal, without fetching history", async () => {
    stateSetup(6); expect(await readDmsApprovals({mode: "state", documentId: 1})).toMatchObject({success: true, data: {record: {canApprove: false, canReject: false, canWithdraw: true, selfApprovalBlocked: true}}});
    expect(calls.filter(c => c.source === "dms_document_approvals")).toHaveLength(1);
    expect(calls[1].calls).toContainEqual(["eq", "is_current", true]);
  });
  it("preserves native actor admission, rather than approving from a client role alone", async () => {
    stateSetup(9, false); expect(await readDmsApprovals({mode: "state", documentId: 1}, context(["dms.approvals.act"]))).toMatchObject({success: true, data: {record: {canApprove: false, canReject: false}}});
  });
  it("treats hidden/missing subjects equally and incomplete capability state as unavailable", async () => {
    mocks.resolve.mockResolvedValue({data: [], count: 0, error: null});
    expect(await readDmsApprovals({mode: "state", documentId: 1})).toMatchObject({error: "Permission denied"});
    stateSetup(9, "true"); expect(await readDmsApprovals({mode: "state", documentId: 1})).toMatchObject({success: false, kind: "unavailable"});
    stateSetup(9, true, [current, {...current, id: 32}]); expect(await readDmsApprovals({mode: "state", documentId: 1})).toMatchObject({success: false, kind: "unavailable"});
  });
  it("preserves true-only action admission for NULL native capabilities but never hides an RPC error", async () => {
    stateSetup(9, null); expect(await readDmsApprovals({mode: "state", documentId: 1})).toMatchObject({success: true, data: {record: {canApprove: false, canReject: false}}});
    const base = mocks.resolve.getMockImplementation()!;
    mocks.resolve.mockImplementation(entry => entry.source.startsWith("f05_") ? {data: null, error: {code: "42501"}} : base(entry));
    expect(await readDmsApprovals({mode: "state", documentId: 1})).toMatchObject({success: false, kind: "unavailable"});
  });
  it("distinguishes a missing current request from an approval the user can action", async () => {
    stateSetup(9, true, []); expect(await readDmsApprovals({mode: "state", documentId: 1})).toMatchObject({success: true, data: {record: {canApprove: false, currentApprovalId: null, actionUnavailableReason: expect.stringContaining("unavailable")}}});
    expect(calls).toHaveLength(2);
  });
  it("reads complete history beyond 1000 with stable timestamp/ID ties and no queue/state cascade", async () => {
    mocks.resolve.mockImplementation(entry => entry.source === "dms_documents" ? {data: [{id: 1}], count: 1, error: null}
      : {data: Array.from({length: 20}, (_, i) => history(1010 - i)), count: 1107, error: null});
    const result = await readDmsApprovals({mode: "history", documentId: 1, page: 51});
    expect(result).toMatchObject({success: true, data: {totalCount: 1107}}); expect(calls).toHaveLength(2);
    expect(calls[0].calls).toContainEqual(["select", "id", {count: "exact"}]);
    expect(calls[1].calls).toContainEqual(["range", 1000, 1019]);
    expect(calls[1].calls.filter(c => c[0] === "order")).toEqual([["order", "created_at", {ascending: false}], ["order", "id", {ascending: false}]]);
  });
  it("preserves the existing own-submitter/actioner fallback under ordinary RLS", async () => {
    mocks.resolve.mockResolvedValueOnce({data: [{id: 1}], count: 1, error: null})
      .mockResolvedValueOnce({data: [{id: 1}], error: null}).mockResolvedValueOnce({data: [history()], count: 1, error: null});
    expect(await readDmsApprovals({mode: "history", documentId: 1}, context([]))).toMatchObject({success: true});
    expect(calls[1].calls).toContainEqual(["or", "submitted_by.eq.6,actioned_by.eq.6"]); expect(calls[1].calls).toContainEqual(["limit", 1]);
    calls.length = 0; mocks.resolve.mockImplementation(entry => entry.source === "dms_documents" ? {data: [{id: 1}], count: 1, error: null} : {data: [], error: null});
    expect(await readDmsApprovals({mode: "history", documentId: 1}, context([]))).toMatchObject({error: "Permission denied"}); expect(calls).toHaveLength(2);
  });
});
describe("strict protocol and uncached route", () => {
  it.each([{mode: "queue", page: 0}, {mode: "queue", pageSize: 101}, {mode: "queue", search: "a".repeat(201)}, {mode: "queue", sortBy: "owner_name"},
    {mode: "history", documentId: 0}, {mode: "state", documentId: 1, admin: true}])("rejects unsupported input %j before creating a client", async input => {
    expect(dmsApprovalRequestSchema.safeParse(input).success).toBe(false); expect(await readDmsApprovals(input)).toMatchObject({kind: "invalid_input"}); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("retains literal spaces and rejects unrelated history IDs/partial counts", () => {
    expect(dmsApprovalQueueCriteriaSchema.parse({search: "   "}).search).toBe("   ");
    expect(dmsApprovalHistoryPageSchema.safeParse({criteria: {mode: "history", documentId: 1, page: 1, pageSize: 20}, rows: [], totalCount: 1}).success).toBe(false);
  });
  it.each(["denied", "invalid", "failure", "success"])("uses the proper %s response without caching or private errors", async mode => {
    if (mode === "denied") mocks.auth.mockResolvedValue(context([]));
    if (mode === "failure") mocks.resolve.mockRejectedValue(Error("PRIVATE detail"));
    const response = await POST(new Request("http://local.test/api/reads/dms-approvals", {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({mode: "queue", ...(mode === "invalid" ? {page: 0} : {})})}));
    expect(response.status).toBe({denied: 403, invalid: 400, failure: 503, success: 200}[mode]);
    expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(response.headers.get("Vary")).toBe("Cookie");
    expect(await response.text()).not.toContain("PRIVATE detail");
  });
});

describe("subject-bound history and action hints", () => {
  it("does not call an invisible or missing document's history an empty success", async () => {
    mocks.resolve.mockResolvedValue({data: [], count: 0, error: null});
    expect(await readDmsApprovals({mode: "history", documentId: 1})).toMatchObject({success: false, kind: "forbidden"});
    expect(calls.map(c => c.source)).toEqual(["dms_documents"]);
    expect(calls[0].calls).toContainEqual(["select", "id", {count: "exact"}]);
    expect(calls[0].calls).toContainEqual(["eq", "id", 1]);
    expect(calls[0].calls).toContainEqual(["is", "deleted_at", null]);
    expect(calls[0].calls).toContainEqual(["range", 0, 0]);
  });
  it.each(["failed", "uncounted", "wrong-id", "duplicate"])("rejects %s history subject admission before reading history", async mode => {
    mocks.resolve.mockImplementation(entry => entry.source === "dms_documents"
      ? {data: mode === "duplicate" ? [{id: 1}, {id: 1}] : [{id: mode === "wrong-id" ? 2 : 1}], count: mode === "uncounted" ? null : mode === "duplicate" ? 2 : 1, error: mode === "failed" ? {message: "PRIVATE"} : null}
      : {data: [], count: 0, error: null});
    expect(await readDmsApprovals({mode: "history", documentId: 1})).toMatchObject({success: false, kind: "unavailable"});
    expect(calls.map(c => c.source)).toEqual(["dms_documents"]);
  });
  function scopedState(options: {pending?: boolean; own?: boolean; canAct?: boolean; canWithdraw?: boolean; submitPermission?: string; archived?: boolean; current?: boolean} = {}) {
    mocks.resolve.mockImplementation(entry => {
      if (entry.source === "dms_documents") return {data: [{...doc(), approval_status: options.pending ? "pending_approval" : "draft", submitted_by: options.own ? 6 : 9,
        status: options.archived ? "archived" : "active", document_type_id: null}], count: 1, error: null};
      if (entry.source === "dms_document_approvals") return {data: options.current || options.pending ? [current] : [], count: options.current || options.pending ? 1 : 0, error: null};
      if (entry.source === "f05_document_approval_capabilities") return {data: [{document_id: 1, can_act: options.canAct ?? false, can_withdraw: options.canWithdraw ?? false}], error: null};
      if (entry.source === "f05_can_act_document_approval") return {data: options.canAct ?? false, error: null};
      if (entry.source === "f03_has_document_permission") return {data: entry.args.permission_code === options.submitPermission, error: null};
      throw Error("Unexpected read");
    });
  }
  it("does not borrow submit/edit/admin grants from a different assignment scope", async () => {
    scopedState();
    expect(await readDmsApprovals({mode: "state", documentId: 1}, context(["dms.documents.view", "dms.documents.edit", "dms.approvals.submit", "dms.admin"])))
      .toMatchObject({success: true, data: {record: {canSubmit: false}}});
    expect(calls.filter(c => c.source === "f03_has_document_permission").map(c => c.args)).toEqual([
      {document_id: 1, permission_code: "dms.approvals.submit"}, {document_id: 1, permission_code: "dms.documents.edit"}, {document_id: 1, permission_code: "dms.admin"},
    ]);
  });
  it.each(["dms.approvals.submit", "dms.documents.edit", "dms.admin"])("preserves the existing subject-scoped %s submission alternative", async code => {
    scopedState({submitPermission: code});
    expect(await readDmsApprovals({mode: "state", documentId: 1}, context(["dms.documents.view", code])))
      .toMatchObject({success: true, data: {record: {canSubmit: true}}});
    expect(calls.filter(c => c.source === "f03_has_document_permission").map(c => c.args)).toEqual([{document_id: 1, permission_code: code}]);
  });
  it("does not advertise withdrawal from a permission in another company", async () => {
    scopedState({pending: true});
    expect(await readDmsApprovals({mode: "state", documentId: 1}, context(["dms.documents.view", "dms.approvals.withdraw"])))
      .toMatchObject({success: true, data: {record: {canWithdraw: false}}});
    expect(calls.find(c => c.source === "f05_document_approval_capabilities")?.args).toEqual({document_ids: [1]});
  });
  it("preserves a native subject-scoped administrator's ability to act on their own submission", async () => {
    scopedState({pending: true, own: true, canAct: true, canWithdraw: true});
    expect(await readDmsApprovals({mode: "state", documentId: 1}, context(["dms.documents.view", "dms.approvals.admin"])))
      .toMatchObject({success: true, data: {record: {canApprove: true, canWithdraw: true, selfApprovalBlocked: false}}});
  });
  it("reports self-approval blocking when an administrator grant belongs to another scope", async () => {
    scopedState({pending: true, own: true, canWithdraw: true});
    expect(await readDmsApprovals({mode: "state", documentId: 1}, context(["dms.documents.view", "dms.approvals.admin"])))
      .toMatchObject({success: true, data: {record: {canApprove: false, canWithdraw: true, selfApprovalBlocked: true}}});
  });
  it.each(["submit", "act"])("does not offer %s for an archived document", async mode => {
    scopedState({archived: true, pending: mode === "act", submitPermission: "dms.admin", canAct: true, canWithdraw: true});
    expect(await readDmsApprovals({mode: "state", documentId: 1}, context(["dms.documents.view", "dms.admin"])))
      .toMatchObject({success: true, data: {record: {canSubmit: false, canApprove: false, canReject: false, canWithdraw: false}}});
  });
  it("does not offer resubmission while a current approval record still exists", async () => {
    scopedState({current: true, submitPermission: "dms.admin"});
    expect(await readDmsApprovals({mode: "state", documentId: 1}, context(["dms.documents.view", "dms.admin"])))
      .toMatchObject({success: true, data: {record: {canSubmit: false}}});
  });
  it.each(["error", "wrong-id", "missing", "duplicate", "bad-value"])("fails closed for %s state capability data", async mode => {
    scopedState({pending: true}); const original = mocks.resolve.getMockImplementation()!;
    mocks.resolve.mockImplementation(entry => entry.source === "f05_document_approval_capabilities"
      ? {data: mode === "missing" ? [] : Array.from({length: mode === "duplicate" ? 2 : 1}, () => ({document_id: mode === "wrong-id" ? 2 : 1, can_act: mode === "bad-value" ? "true" : true, can_withdraw: true})), error: mode === "error" ? {code: "42501"} : null}
      : original(entry));
    expect(await readDmsApprovals({mode: "state", documentId: 1})).toMatchObject({success: false, kind: "unavailable"});
  });
  it.each(["error", "string"])("does not turn a submission capability %s into a grant or harmless denial", async mode => {
    scopedState(); const original = mocks.resolve.getMockImplementation()!;
    mocks.resolve.mockImplementation(entry => entry.source === "f03_has_document_permission"
      ? {data: mode === "string" ? "true" : null, error: mode === "error" ? {message: "PRIVATE"} : null} : original(entry));
    expect(await readDmsApprovals({mode: "state", documentId: 1}, context(["dms.documents.view", "dms.approvals.submit"])))
      .toMatchObject({success: false, kind: "unavailable"});
  });
  it("reads independent submission alternatives together instead of adding a serial waterfall", async () => {
    scopedState(); const original = mocks.resolve.getMockImplementation()!;
    const releases: ((value: unknown) => void)[] = [];
    mocks.resolve.mockImplementation(entry => entry.source === "f03_has_document_permission" ? new Promise(resolve => releases.push(resolve)) : original(entry));
    const pending = readDmsApprovals({mode: "state", documentId: 1}, context(["dms.documents.view", "dms.approvals.submit", "dms.documents.edit", "dms.admin"]));
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases.forEach((resolve, i) => resolve({data: i === 2, error: null}));
    expect(await pending).toMatchObject({success: true, data: {record: {canSubmit: true}}});
  });
  it("does not read history after cancellation during subject admission", async () => {
    const controller = new AbortController();
    mocks.resolve.mockImplementation(() => {controller.abort(); return {data: [{id: 1}], count: 1, error: null};});
    await expect(readDmsApprovals({mode: "history", documentId: 1}, context(), controller.signal)).rejects.toMatchObject({name: "AbortError"});
    expect(calls).toHaveLength(1); expect(calls[0].calls).toContainEqual(["abortSignal", controller.signal]);
  });
});
