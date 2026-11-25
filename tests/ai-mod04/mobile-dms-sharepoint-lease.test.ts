import { beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { createDmsPilotClient } from "../../workers/sharepoint-agent/dms-pilot.mjs";
import { runContinuousIntake } from "../../workers/sharepoint-agent/continuous.mjs";

const state = vi.hoisted(() => ({ rpc: vi.fn(), admit: vi.fn(), acknowledge: vi.fn(), scopes: vi.fn(), start: vi.fn(), dispatchV5: vi.fn(), deliverV5: vi.fn(), active: true, upload: true, userId: "" }));
const authUserId = "11111111-2222-4333-8444-555555555555";
const operationId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const sharePointLease = "f1000000-0000-4000-8000-000000000011";
const request = {
  version: 1, operationId, authUserId, context: null, scope: { companyId: 7, branchId: null },
  metadata: { original_filename: "synthetic.pdf", mime_type: "application/pdf", file_size_bytes: 12, sha256_hash: "a".repeat(64) },
};
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: async () => ({ profile: { id: 13, auth_user_id: state.userId } }),
  canUseApplication: () => state.active,
  hasPermission: (_ctx: unknown, permission: string) => ["dms.documents.preview", "dms.documents.review_ai"].includes(permission)
    || (state.upload && permission === "dms.documents.upload"),
  hasPermissionInScope: () => false,
}));
vi.mock("@/lib/supabase/server", async () => {
  const { mobileAccessToken } = await import("@/lib/supabase/mobile-request");
  return { createClient: async () => {
    if (mobileAccessToken() !== "synthetic.erp.token") throw Error("Missing original caller authentication");
    return { rpc: state.rpc };
  } };
});
vi.mock("@/server/actions/dms/upload-sessions", () => ({ createDmsUploadSession: state.admit, acknowledgeDmsSingleUpload: state.acknowledge }));
vi.mock("@/server/reads/dms-documents", () => ({ readDmsDocumentPage: vi.fn() }));
vi.mock("@/server/actions/dms/documents", () => ({ getDmsDocumentRecordData: vi.fn() }));
vi.mock("@/server/actions/dms/upload-scope", () => ({ readDmsUploadScopes: state.scopes }));
vi.mock("@/server/actions/dms/document-links", () => ({ searchDmsLinkEntityOptions: vi.fn() }));
vi.mock("@/server/actions/dms/document-types", () => ({ getDmsDocumentTypes: vi.fn() }));
vi.mock("@/server/actions/dms/document-metadata-values", () => ({ getMetadataDefinitionsForType: vi.fn() }));
vi.mock("@/server/actions/dms/ai-intake", () => ({ getAiIntakeSession: vi.fn(), getIntakeSessionSignedUrl: vi.fn(), startAiIntakeFromUploadSession: state.start }));
vi.mock("@/server/actions/dms/intake-review", () => ({ prepareExactIntakeReview: vi.fn(), confirmExactIntakeReview: vi.fn() }));
vi.mock("@/server/numbered-ai-approval", () => ({ approveNumberedAiIntake: vi.fn() }));
vi.mock("@/server/dms-ai-approval-recovery", () => ({ recoverNumberedAiApproval: vi.fn() }));
vi.mock("@/app/api/dms/file/route", () => ({ GET: vi.fn() }));
vi.mock("@/server/actions/dms/renewals", () => ({ createDmsRenewalRequest: vi.fn() }));
vi.mock("@/server/mobile/dms-v5/documents", () => ({ employeeDocuments: vi.fn() }));
vi.mock("@/server/mobile/dms-v5", () => ({
  dispatchMobileDmsV5: state.dispatchV5,
  deliverMobileDmsV5File: state.deliverV5,
  dmsErrorResponse: () => Response.json({ success: false }, { status: 503 }),
}));
vi.mock("@/server/mobile/dms-v5/access", () => ({ DmsError: class DmsError extends Error {}, readDmsFeatureAvailability: () => ({}) }));
vi.mock("@/server/mobile/dms", () => ({
  MobileDmsError: class MobileDmsError extends Error {},
  readMobileProfile: async () => ({ userId: state.userId, capabilities: { upload: state.upload, preview: true, review: true, numbering: false } }),
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/mobile/dms/v1/route";

function post(command: unknown, bearer = "Bearer synthetic.erp.token") {
  return POST(new Request("http://localhost/api/mobile/dms/v1", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: bearer }, body: JSON.stringify(command),
  }));
}

describe("worker-held SharePoint admission lease", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.active = true;
    state.upload = true;
    state.userId = authUserId;
    vi.unstubAllEnvs();
    vi.stubEnv("DMS_AGENT_CENTER_SHAREPOINT_ADMISSION", "1");
  });

  it("passes the exact caller proof separately and returns just the retained admission receipt", async () => {
    const receipt = { id: 42, operationId, replayed: true };
    state.rpc.mockResolvedValueOnce({ data: receipt, error: null });
    const result = await post({ op: "admitSharePoint", request, sharePointLease });
    expect(await result.json()).toEqual({ success: true, data: receipt });
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("f07_admit_sharepoint_upload", { p_request: request, p_lease: sharePointLease });
    expect(state.admit).not.toHaveBeenCalled();
  });

  it("requires the isolated opt-in, live ERP session, upload capability, and exact request identity", async () => {
    const input = { op: "admitSharePoint", request, sharePointLease };
    vi.stubEnv("DMS_AGENT_CENTER_SHAREPOINT_ADMISSION", "");
    expect((await post(input)).status).toBe(404);
    vi.stubEnv("DMS_AGENT_CENTER_SHAREPOINT_ADMISSION", "1");
    expect((await post(input, "")).status).toBe(401);
    state.active = false;
    expect((await post(input)).status).toBe(403);
    state.active = true;
    state.upload = false;
    expect((await post(input)).status).toBe(403);
    state.upload = true;
    expect((await post({ ...input, request: { ...request, authUserId: operationId } })).status).toBe(403);
    expect((await post({ ...input, sharePointLease: "expired-or-invalid" })).status).toBe(400);
    expect((await post({ op: "admit", request, sharePointLease })).status).toBe(400);
    expect((await post({ ...input, request: { ...request, sharePointLease } })).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.admit).not.toHaveBeenCalled();
  });

  it("never turns a native denial or unexpected reply into a Storage capability", async () => {
    const input = { op: "admitSharePoint", request, sharePointLease };
    state.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "native detail" } });
    const denied = await post(input);
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain("native detail");
    state.rpc.mockResolvedValueOnce({ data: { id: 42, operationId, replayed: true, uploadUrl: "signed-url" }, error: null });
    expect((await post(input)).status).toBe(503);
    expect(state.admit).not.toHaveBeenCalled();
  });

  it("preserves native Mobile uploads, V5 dispatch and protected file delivery with the SharePoint opt-in off", async () => {
    vi.stubEnv("DMS_AGENT_CENTER_SHAREPOINT_ADMISSION", "");
    state.admit.mockResolvedValueOnce({ success: true, data: {
      session: { id: 42, session_code: "native-code" }, signedUrl: "native-url", uploadRequired: true, isDuplicate: false,
    } });
    state.acknowledge.mockResolvedValueOnce({ success: true });
    state.start.mockResolvedValueOnce({ success: true, data: { status: "review_pending" } });
    const details = { op: "documentDetails", documentId: 42 };
    state.dispatchV5.mockResolvedValueOnce(Response.json({ success: true, data: { id: 42 } }));
    state.deliverV5.mockResolvedValueOnce(new Response("synthetic-original"));

    expect(await (await post({ op: "admit", request })).json()).toEqual({
      success: true, data: { id: 42, code: "native-code", uploadUrl: "native-url", duplicate: false },
    });
    expect(await (await post({ op: "complete", request, sessionId: 42 })).json()).toEqual({ success: true, data: null });
    expect(state.acknowledge).toHaveBeenCalledWith(request, 42);
    expect(await (await post({ op: "start", sessionId: 42 })).json()).toEqual({ success: true, data: { status: "review_pending" } });
    expect(state.start).toHaveBeenCalledWith({ uploadSessionId: 42, onlyIfUploaded: true });
    expect(await (await post(details)).json()).toEqual({ success: true, data: { id: 42 } });
    expect(state.dispatchV5).toHaveBeenCalledWith(
      details,
      expect.objectContaining({ profile: expect.objectContaining({ auth_user_id: authUserId }) }),
      expect.any(AbortSignal),
    );

    const target = "http://localhost/api/mobile/dms/v1?fileId=42";
    expect((await GET(new NextRequest(target))).status).toBe(401);
    const file = await GET(new NextRequest(target, { headers: { Authorization: "Bearer synthetic.erp.token" } }));
    expect(await file.text()).toBe("synthetic-original");
    expect(state.rpc).not.toHaveBeenCalled();
  });

  const nativePsql = process.env.DMS_AGENT_CENTER_NATIVE_PSQL ?? "";
  const nativePort = process.env.DMS_AGENT_CENTER_NATIVE_PORT ?? "";
  it.runIf(nativePsql && /^\d{4,5}$/.test(nativePort) && Number(nativePort) <= 65535)(
    "admits and replays one native receipt through the production worker and route while fencing the first caller",
    async () => {
      const database = "agent_center_controls_native";
      function query(sql: string) {
        const reply = spawnSync(nativePsql, ["-XwqAt", "-h", "127.0.0.1", "-p", nativePort, "-U", "postgres", "-d", database,
          "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], {
          input: sql, encoding: "utf8", timeout: 4000, windowsHide: true,
          env: { ...process.env, PGHOSTADDR: "127.0.0.1" },
        });
        if (reply.status !== 0) throw Error(reply.stderr?.trim() || "Native fixture unavailable");
        return reply.stdout.trim();
      }
      expect(query(`select current_database() = '${database}' and inet_server_addr() = '127.0.0.1'::inet
        and to_regclass('erp_private.fixture_permissions') is not null
        and to_regprocedure('public.f07_admit_sharepoint_upload(jsonb,uuid)') is not null;`)).toBe("t");
      expect(query("select count(*) from erp_private.agent_pdf_work;")).toBe("0");
      const connection = "'10000000-0000-4000-8000-000000000001'";
      const nativeActor = "00000000-0000-4000-8000-000000000101";
      query(`insert into erp_private.agent_pdf_policy (connection_id,company_id,actor_id,officer_id,from_time,enabled)
        values (${connection},1,101,103,now()-interval '1 hour',true);
        insert into erp_private.dms_agent_center_controls(company_id,branch_id,agent_key,worker_bound,mode,enabled)
        values (1,null,'dms.intake',true,'execute',true);`);
      state.userId = nativeActor;
      state.scopes.mockResolvedValue({ success: true, rows: [{ companyId: 1, branchId: null }], hasMore: false });
      state.rpc.mockImplementation((rpc, { p_request, p_lease }) => {
        expect(rpc).toBe("f07_admit_sharepoint_upload");
        const json = Buffer.from(JSON.stringify(p_request)).toString("hex");
        const lease = Buffer.from(p_lease).toString("hex");
        try {
          const data = query(`begin; set local role authenticated; set local fixture.session_active = 'yes';
            set local request.jwt.claim.sub = '${nativeActor}'; select public.f07_admit_sharepoint_upload(
            convert_from(decode('${json}', 'hex'), 'UTF8')::jsonb, convert_from(decode('${lease}', 'hex'), 'UTF8')::uuid); commit;`);
          return { data: JSON.parse(data), error: null };
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes("42501")) throw error;
          return { data: null, error: { code: "42501" } };
        }
      });
      type Claim = { operation_id: string; item_id: string; version: string; lease_token: string };
      const workerQuery = (statement: string) => query(`set session authorization erp_agent_discovery_runtime; ${statement}`);
      const claim = (): Claim => JSON.parse(workerQuery(`select erp_private.claim_agent_pdf(${connection});`));
      const first = claim();
      const config = { authUserId: nativeActor, companyId: 1, continuous: true, agentCenterAdmission: true };
      const requests: { op: string; sharePointLease?: string; request?: typeof request }[] = [];
      const failedResponses: string[] = [];
      const transport: typeof fetch = async (input, options) => {
        const body = JSON.parse(String(options?.body));
        requests.push(body);
        if (body.op === "login") return Response.json({ success: true, data: {
          userId: nativeActor, accessToken: "synthetic.erp.token", expiresAt: Date.now() / 1000 + 3600,
        } });
        const result = await POST(new Request(input, options));
        if (!result.ok) failedResponses.push(`${body.op}: ${result.status} ${await result.clone().text()}`);
        return result;
      };
      const client = createDmsPilotClient(config, { fetch: transport, shutdown: undefined });
      const graph = { readDiscoveredPdf: async () => ({ name: "synthetic.pdf", bytes: Buffer.from("%PDF-fixture") }) };
      const run = (item: Claim) => runContinuousIntake({ config, client, graph, signal: undefined, ledger: {
        claimPdf: async () => item,
        advancePdf: async (current: Claim, step: string, hash?: string) => {
          expect(current).toBe(item);
          expect(["inspect", "prepare", "fence"], failedResponses.join("\n")).toContain(step);
          if (hash) expect(hash).toMatch(/^[a-f0-9]{64}$/);
          return workerQuery(`select erp_private.advance_agent_pdf(${connection}, '${item.operation_id}', '${item.lease_token}',
            '${step}', ${hash ? `'${hash}'` : "null"});`);
        },
      } });
      expect(await run(first)).toEqual(["admission_retained"]);
      const original = requests.find(body => body.op === "admitSharePoint");
      expect(original?.sharePointLease).toBe(first.lease_token);
      query(`update erp_private.agent_pdf_work set lease_until=now()-interval '1 second' where operation_id='${first.operation_id}';`);
      const second = claim();
      expect(second.operation_id).toBe(first.operation_id);
      expect(second.lease_token).not.toBe(first.lease_token);
      expect((await post(original)).status).toBe(403);
      expect(await run(second)).toEqual(["admission_retained"]);
      const replay = requests.filter(body => body.op === "admitSharePoint").at(-1);
      expect(replay?.request).toEqual(original?.request);
      expect(replay?.sharePointLease).toBe(second.lease_token);
      expect(query(`select count(*) || ':' || count(*) filter (where s.intake_status='uploading' and s.ai_result_id is null
        and s.document_id is null and not (a.request ? 'sharePointLease')) from erp_private.f07_single_upload_admissions a
        join public.dms_upload_sessions s on s.id=a.upload_session_id;`)).toBe("1:1");
      expect(requests.every(body => ["login", "profile", "scopes", "admitSharePoint"].includes(body.op))).toBe(true);
    }, 15_000,
  );
});
