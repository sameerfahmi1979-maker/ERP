import { beforeEach, expect, it, vi } from "vitest";
import { jsPDF } from "jspdf";
import { hashFinalPdfBytes } from "@/lib/output/idempotency";
const m = vi.hoisted(() => ({ rpc: vi.fn(), service: vi.fn(), info: vi.fn(), upload: vi.fn(), download: vi.fn(), render: vi.fn(), plan: vi.fn(), ready: vi.fn(),
  state: null as unknown, object: null as Buffer | null, loseCheckpoint: false, loseFinish: false, loseUpload: false }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: m.rpc }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: m.service, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { storage_path: "original/7.pdf", generated_by: 11 }, error: null }) }) }) }), storage: { from: () => ({ info: m.info, upload: m.upload, download: m.download }) } }) }));
vi.mock("@/lib/output/html-adapter", () => ({ renderOfficialHtmlToPdf: m.render }));
vi.mock("@/lib/output/recovery-plan", async original => {
  const actual = await original<typeof import("@/lib/output/recovery-plan")>();
  return { ...actual, buildRetainedRenderPlan: m.plan, assertRecoveryReady: m.ready };
});
import { recoverDurableOutput, issuanceCommandHash } from "@/lib/output/durable-operation";
const document = new jsPDF(); document.text("F08 synthetic exact retained bytes", 20, 20);
const pdf = Buffer.from(document.output("arraybuffer")), sha = hashFinalPdfBytes(pdf);
const identity = { id: "f0800000-0000-4000-8000-000000000001", version: "v1", lastModified: "2026-10-18T00:00:00.123Z" };
function retained() { return { document: { id: 7, lifecycle_state: "rendering", storage_path: "original/7.pdf", file_name: "original.pdf", checksum: "pending", file_size_bytes: null as number | null, serial_no: "F08-ORIGINAL-7", output_code: "F08_QA", source_record_id: 1, supersedes_issuance_id: null as number | null, template_id: null, generated_at: "2026-10-18T00:00:00Z", data_snapshot_json: {}, branding_snapshot_json: null, policy_snapshot_json: { requiresSerial: true } }, plan: null as unknown, pdf: null as string | null, sha: null as string | null, size: null as number | null, renderer: null as string | null, link: null }; }
let state: ReturnType<typeof retained>;
beforeEach(() => {
  vi.resetAllMocks(); state = retained(); m.state = state; m.object = null; m.loseCheckpoint = m.loseFinish = m.loseUpload = false;
  m.plan.mockResolvedValue({ html: "<html><body>Frozen</body></html>", layoutVersion: 0 });
  m.render.mockResolvedValue({ buffer: pdf, rendererVersion: "fixture@1" });
  m.info.mockImplementation(async () => m.object ? { data: identity, error: null } : { data: null, error: { statusCode: "404" } });
  m.upload.mockImplementation(async (_path, bytes: Buffer) => { m.object = Buffer.from(bytes); return { data: {}, error: m.loseUpload ? { statusCode: "504" } : null }; });
  m.download.mockImplementation(() => ({ asStream: async () => ({ data: new Blob([new Uint8Array(m.object!)]).stream(), error: null }) }));
  m.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "f08_claim_operation") return { data: { id: 7, actorId: 11, sessionId: "f0800000-0000-4000-8000-000000000002", leaseId: args.p_lease }, error: null };
    if (name === "f08_output_actor") return { data: { actorId: 11, authSessionId: "f0800000-0000-4000-8000-000000000002" }, error: null };
    if (name === "f08_finish_operation") {
      state.document.lifecycle_state = "issued"; state.document.checksum = sha; state.document.file_size_bytes = pdf.length; state.pdf = null; state.plan = null;
      if (m.loseFinish) { m.loseFinish = false; return { data: null, error: { code: "response_lost" } }; }
    }
    return { data: { id: 7 }, error: null };
  });
  m.service.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "f08_read_operation") return { data: structuredClone(state), error: null };
    if (name === "f08_checkpoint_operation") {
      if (args.p_plan) state.plan = args.p_plan;
      if (args.p_pdf) { state.pdf = args.p_pdf as string; state.sha = sha; state.size = pdf.length; state.renderer = args.p_renderer as string;
        if (m.loseCheckpoint) { m.loseCheckpoint = false; return { data: null, error: { code: "response_lost" } }; }
      }
    }
    return { data: { id: 7 }, error: null };
  });
});
it("checkpoints plan and exact bytes before canonical upload, then issues the same original", async () => {
  expect(await recoverDurableOutput(7)).toMatchObject({ kind: "issued", issuanceId: 7, storagePath: "original/7.pdf", finalSha256: sha, serialNo: "F08-ORIGINAL-7" });
  const saved = m.service.mock.calls.filter(([name]) => name === "f08_checkpoint_operation");
  expect(saved).toHaveLength(2); expect(saved[1][1].p_pdf).toBe(pdf.toString("base64"));
  expect(m.service.mock.invocationCallOrder[2]).toBeLessThan(m.upload.mock.invocationCallOrder[0]);
  expect(m.upload).toHaveBeenCalledWith("original/7.pdf", pdf, { contentType: "application/pdf", upsert: false });
});
it("lost checkpoint acknowledgement recovers cached bytes without another render or serial", async () => {
  m.loseCheckpoint = true;
  expect((await recoverDurableOutput(7)).kind).toBe("reconciliation_required"); expect(m.upload).not.toHaveBeenCalled();
  expect((await recoverDurableOutput(7)).kind).toBe("issued"); expect(m.render).toHaveBeenCalledTimes(1); expect(m.plan).toHaveBeenCalledTimes(1);
});
it("lost upload response reconciles existing exact bytes without overwriting", async () => {
  m.loseUpload = true; expect((await recoverDurableOutput(7)).kind).toBe("issued"); expect(m.upload).toHaveBeenCalledOnce();
});
it("lost issue response replays the committed original, not rendering/uploading again", async () => {
  m.loseFinish = true; expect((await recoverDurableOutput(7)).kind).toBe("reconciliation_required");
  expect(await recoverDurableOutput(7)).toMatchObject({ kind: "issued", idempotentReplay: true, finalSha256: sha });
  expect(m.upload).toHaveBeenCalledOnce(); expect(m.render).toHaveBeenCalledOnce();
});
it("an unknown Storage status never triggers a blind upload", async () => {
  m.info.mockResolvedValue({ data: null, error: { statusCode: "503" } });
  expect(await recoverDurableOutput(7)).toMatchObject({ kind: "reconciliation_required", error: expect.stringContaining("no blind upload") }); expect(m.upload).not.toHaveBeenCalled();
});
it("different existing bytes cannot be replaced or issued", async () => {
  m.object = Buffer.from("different");
  expect((await recoverDurableOutput(7)).kind).toBe("reconciliation_required"); expect(m.upload).not.toHaveBeenCalled();
  expect(m.rpc.mock.calls.some(([name]) => name === "f08_finish_operation")).toBe(false);
});
it("lease denial or revocation stops before any protected read or external operation", async () => {
  m.rpc.mockResolvedValue({ error: { code: "42501" }, data: null });
  expect((await recoverDurableOutput(7)).kind).toBe("reconciliation_required"); expect(m.service).not.toHaveBeenCalled(); expect(m.render).not.toHaveBeenCalled(); expect(m.upload).not.toHaveBeenCalled();
});
it("refuses a missing rendered cache rather than guessing a new rendering", async () => {
  state.sha = sha; state.size = pdf.length; state.renderer = "fixture@1";
  expect((await recoverDurableOutput(7)).kind).toBe("reconciliation_required"); expect(m.render).not.toHaveBeenCalled(); expect(m.upload).not.toHaveBeenCalled();
});
it("refuses cached bytes with a different digest", async () => {
  state.pdf = pdf.toString("base64"); state.sha = "b".repeat(64); state.size = pdf.length; state.renderer = "fixture@1";
  expect((await recoverDurableOutput(7)).kind).toBe("reconciliation_required"); expect(m.upload).not.toHaveBeenCalled();
});
it("command identity normalizes key order but distinguishes every effective selection", () => {
  expect(issuanceCommandHash({ inputs: { b: "  B ", a: "A" } })).toBe(issuanceCommandHash({ inputs: { a: "A", b: "B" } }));
  expect(issuanceCommandHash({ language: "ar" })).not.toBe(issuanceCommandHash({ language: "en" }));
  expect(issuanceCommandHash({ templateId: 2 })).not.toBe(issuanceCommandHash({ templateId: 3 }));
});
