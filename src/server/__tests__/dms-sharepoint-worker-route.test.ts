import { createHash } from "node:crypto";
import { jsPDF } from "jspdf";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), admin: vi.fn(), verify: vi.fn(), analyze: vi.fn(), upload: vi.fn(),
}));
vi.mock("@/lib/supabase/mobile-request", () => ({ withMobileToken: (_: string, run: () => unknown) => run() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: (...args: unknown[]) => ({ retry: () => mocks.user(...args) }), auth: { getUser: async () => ({ data: { user: { id: "fixture" } } }) } }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: (...args: unknown[]) => ({ retry: () => mocks.admin(...args) }), storage: { from: () => ({ upload: mocks.upload }) } }),
}));
vi.mock("@/server/dms-verified-intake-source", () => ({ readVerifiedIntakeSource: mocks.verify }));
vi.mock("@/server/dms-sharepoint-worker-ai", () => ({ analyzeSharePointWorkPermit: mocks.analyze }));

import { POST } from "@/app/api/internal/agents/sharepoint-intake/route";

const operationId = "745a559c-3615-4e7b-897e-22f8a36bcb4e";
const sharePointLease = "bed07e1f-8b4d-4b6b-bb25-cbd8e5d29bb1";
const authSessionId = "77c63c89-2a30-4e09-a9a8-dae298dfdaa4";
const attemptId = "df691874-aac6-424f-9069-d4724cac6a5d";
const object = {
  id: "76e98b5d-916f-46ac-a789-87d38c6354f9",
  version: "retained-version",
  lastModified: "2026-11-23T00:00:00Z",
};
const bytes = Buffer.from("%PDF-1.7\nsynthetic");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const source = {
  operationId, sessionId: 42, actorId: 51, authSessionId, companyId: 1, branchId: 1,
  path: "sessions/fixture/original.pdf", filename: "original.pdf", sha256, byteCount: bytes.length,
};
const receipt = {
  operationId, sessionId: 42, state: "review_pending", resultId: 19, reviewId: 20, notificationEventId: 8,
};
const processingRevision = "2026-11-23T00:01:00Z";
const claim = { ...source, state: "processing", attemptId, processingRevision, started: true };
const providerPin = {
  provider: "openai", model: "gpt-6.1-sol", configId: 3, configUpdatedAt: "2026-11-23T00:00:00Z",
  promptVersion: "v3.7-source-dates",
};
const reservation = { operationId, sessionId: 42, attemptId, processingRevision, expiresAt: "2099-01-01T00:00:00Z" };

function post(body: unknown) {
  return POST(new Request("https://fixture.invalid/api/internal/agents/sharepoint-intake", {
    method: "POST",
    headers: { Authorization: "Bearer fixture.token.value", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DMS_AGENT_CENTER_SHAREPOINT_FLOW", "1");
  vi.stubEnv("DMS_SHAREPOINT_EMPLOYER_ROUTING", "0");
  mocks.verify.mockResolvedValue({ bytes, object, proof: { sha256 } });
});

describe("supervised SharePoint intake boundary", () => {
  it("keeps the protected lane off by default", async () => {
    vi.stubEnv("DMS_AGENT_CENTER_SHAREPOINT_FLOW", "0");
    expect((await post({ op: "reviewSharePoint", operationId, sharePointLease, sessionId: 42 })).status).toBe(404);
    expect(mocks.user).not.toHaveBeenCalled();
  });

  it("does not accept interrupted storage when native authority changed", async () => {
    mocks.user.mockResolvedValue({ data: { ...source, state: "uploading" } });
    mocks.upload.mockResolvedValue({});
    mocks.admin.mockResolvedValue({ error: { code: "55000" } });
    const response = await post({ op: "stageSharePoint", operationId, sharePointLease, sessionId: 42, pdfBase64: bytes.toString("base64") });
    expect(response.status).toBe(409);
    expect(mocks.admin).toHaveBeenCalledWith("f07_accept_sharepoint_worker_pdf", expect.objectContaining({
      p_operation: operationId, p_lease: sharePointLease, p_object: object.id,
    }));
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("does not retry the provider after an already committed response was lost", async () => {
    mocks.user.mockResolvedValue({ data: { ...source, ...receipt } });
    const response = await post({ op: "reviewSharePoint", operationId, sharePointLease, sessionId: 42 });
    expect(await response.json()).toEqual({ success: true, data: receipt });
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("recovers a result published while waiting for the native claim", async () => {
    mocks.user.mockResolvedValue({ data: { ...source, state: "processing" } });
    mocks.admin.mockResolvedValue({ data: { ...source, ...receipt, started: false } });
    const response = await post({ op: "reviewSharePoint", operationId, sharePointLease, sessionId: 42 });
    expect(await response.json()).toEqual({ success: true, data: receipt });
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("uses the exact claimed attempt and cannot publish after a pause during AI Fill", async () => {
    mocks.user.mockResolvedValue({ data: { ...source, state: "staged" } });
    mocks.admin
      .mockResolvedValueOnce({ data: claim })
      .mockResolvedValueOnce({ data: reservation })
      .mockResolvedValueOnce({ error: { code: "55000" } });
    const extracted = { classification: "synthetic" };
    mocks.analyze.mockImplementation(async ({ reserveProviderAttempt }) => {
      await reserveProviderAttempt(providerPin);
      return extracted;
    });
    const response = await post({ op: "reviewSharePoint", operationId, sharePointLease, sessionId: 42 });
    expect(response.status).toBe(409);
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    expect(mocks.admin).toHaveBeenNthCalledWith(2, "f07_reserve_sharepoint_worker_provider_attempt", {
      p_operation: operationId, p_session: 42, p_lease: sharePointLease, p_actor: source.actorId,
      p_auth_session: authSessionId, p_attempt: attemptId, p_claim_at: processingRevision,
      p_provider: "openai", p_config: 3, p_config_updated_at: providerPin.configUpdatedAt,
      p_model: "gpt-6.1-sol", p_prompt: "v3.7-source-dates",
    });
    expect(mocks.admin).toHaveBeenLastCalledWith("f07_publish_sharepoint_worker_review", expect.objectContaining({
      p_actor: source.actorId, p_auth_session: authSessionId, p_attempt: attemptId, p_claim_at: processingRevision, p_output: extracted,
    }));
  });

  it.each([
    [{ error: { code: "PT409" } }, 409],
    [{ error: { code: "42501" } }, 403],
    [{ data: null }, 503],
    [{ data: { ...reservation, attemptId: sharePointLease } }, 503],
    [{ data: { ...reservation, expiresAt: "2020-01-01T00:00:00Z" } }, 409],
  ])("stops before provider dispatch and publication when the reservation cannot authorize this request", async (native, status) => {
    mocks.user.mockResolvedValue({ data: { ...source, state: "staged" } });
    mocks.admin.mockResolvedValueOnce({ data: claim }).mockResolvedValueOnce(native);
    const dispatch = vi.fn();
    mocks.analyze.mockImplementation(async ({ reserveProviderAttempt }) => {
      await reserveProviderAttempt(providerPin);
      dispatch();
    });

    const response = await post({ op: "reviewSharePoint", operationId, sharePointLease, sessionId: 42 });
    expect(response.status).toBe(status);
    expect(mocks.admin).toHaveBeenCalledTimes(2);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not dispatch when the reservation response is lost or its original lease is replayed", async () => {
    mocks.user.mockResolvedValue({ data: { ...source, state: "processing" } });
    mocks.admin.mockResolvedValueOnce({ data: claim }).mockRejectedValueOnce(new Error("Disconnected"))
      .mockResolvedValueOnce({ data: { ...claim, started: false } });
    const dispatch = vi.fn();
    mocks.analyze.mockImplementation(async ({ reserveProviderAttempt }) => {
      await reserveProviderAttempt(providerPin);
      dispatch();
    });
    const command = { op: "reviewSharePoint", operationId, sharePointLease, sessionId: 42 };

    expect((await post(command)).status).toBe(503);
    expect((await post(command)).status).toBe(409);
    expect(mocks.admin.mock.calls.map(([rpc]) => rpc)).toEqual([
      "f07_claim_sharepoint_worker_review", "f07_reserve_sharepoint_worker_provider_attempt", "f07_claim_sharepoint_worker_review",
    ]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("refuses mismatched bytes before storage and refuses a second provider claim", async () => {
    mocks.user.mockResolvedValue({ data: { ...source, state: "uploading" } });
    const stage = await post({ op: "stageSharePoint", operationId, sharePointLease, sessionId: 42, pdfBase64: Buffer.from("different").toString("base64") });
    expect(stage.status).toBe(422);
    expect(mocks.upload).not.toHaveBeenCalled();

    mocks.user.mockResolvedValue({ data: { ...source, state: "processing" } });
    mocks.admin.mockResolvedValue({ data: { ...source, state: "processing", attemptId, processingRevision: "2026-11-23T00:01:00Z", started: false } });
    expect((await post({ op: "reviewSharePoint", operationId, sharePointLease, sessionId: 42 })).status).toBe(409);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
});

function employerCommand() {
  const doc = new jsPDF();
  doc.text([
    "MINISTRY OF HUMAN RESOURCES",
    "AND EMIRATISATION",
    "EMPLOYMENT CONTRACT FULL WORK",
    "Work Style: Full Work",
    "Transaction Number: MB100000000AE",
    "1. Establishment Name",
    "7 ORYX GENERAL TRANSPORT L L C",
    "Establishment No: 1000",
    "Article 2 - Employment Terms and Conditions",
  ], 20, 20);
  const pdf = Buffer.from(doc.output("arraybuffer"));
  return {
    op: "routeEmployer", operationId, sharePointLease, pdfBase64: pdf.toString("base64"),
    byteCount: pdf.byteLength, sha256: createHash("sha256").update(pdf).digest("hex"),
  };
}

describe("employer routing before SharePoint admission", () => {
  it("extracts the literal establishment name from the verified PDF and binds the returned company", async () => {
    vi.stubEnv("DMS_AGENT_CENTER_SHAREPOINT_FLOW", "0");
    vi.stubEnv("DMS_SHAREPOINT_EMPLOYER_ROUTING", "1");
    const command = employerCommand();
    mocks.admin
      .mockResolvedValueOnce({ data: { status: "inspect" } })
      .mockResolvedValueOnce({ data: { status: "bound", companyId: 4 } });
    const response = await post(command);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { status: "bound", companyId: 4 } });
    const binding = {
      p_operation: operationId, p_lease: sharePointLease, p_bytes: command.byteCount, p_hash: command.sha256,
    };
    expect(mocks.admin).toHaveBeenNthCalledWith(1, "dms_route_sharepoint_employer", expect.objectContaining({
      ...binding, p_kind: "inspect", p_company_name: null,
    }));
    expect(mocks.admin).toHaveBeenNthCalledWith(2, "dms_route_sharepoint_employer", expect.objectContaining({
      ...binding, p_kind: "employer", p_company_name: "7 ORYX GENERAL TRANSPORT L L C",
    }));
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("rejects a forged hash and preserves an already bound decision without another extraction", async () => {
    const command = employerCommand();
    expect((await post(command)).status).toBe(404);
    vi.stubEnv("DMS_SHAREPOINT_EMPLOYER_ROUTING", "1");
    expect((await post({ ...command, sha256 })).status).toBe(422);
    expect(mocks.admin).not.toHaveBeenCalled();

    mocks.admin.mockResolvedValue({ data: { status: "bound", companyId: 4 } });
    expect((await post(command)).status).toBe(200);
    expect(mocks.admin).toHaveBeenCalledTimes(1);
  });
});
