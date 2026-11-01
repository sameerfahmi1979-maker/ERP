import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ intent: vi.fn(), handler: vi.fn() }));
vi.mock("@/lib/ai/common/assistant/intent-extractor", () => ({ extractAssistantIntent: state.intent }));
vi.mock("@/lib/ai/common/assistant/action-handlers", () => Object.fromEntries(["runSearchErpAction", "runOpenRecordAction", "runExplainRiskAction", "runExplainComplianceAction", "runExplainDuplicateAction", "runExplainDocumentAction", "runPrepareFieldUpdateDraftAction", "runPrepareEmailDraftAction", "runPrepareRenewalNoteAction", "runShowNextActionsAction"].map(key => [key, state.handler])));
import { runAssistantTurn } from "@/lib/ai/common/assistant/assistant-engine";
const request = () => ({ userMessage: "Explain the compliance findings", sessionId: 1, userPermissions: ["ai.compliance.view", "ai.actions.prepare"], persistDraft: vi.fn().mockResolvedValue(3) });
beforeEach(() => {
  vi.clearAllMocks(); state.intent.mockReset().mockResolvedValue({ intentType: "explain_compliance", candidateActions: ["EXPLAIN_COMPLIANCE"], targetEntityType: "party", targetEntityId: 7, confidence: "high" });
  state.handler.mockReset().mockResolvedValue({ responseText: "SYNTHETIC explanation", outputType: "explanation", sourceReferences: [{ entityType: "party", entityId: 7 }] });
});
describe("Assistant prerequisite integration", () => {
  it("returns an explicit read error rather than good standing", async () => {
    state.handler.mockRejectedValue(new Error("database unavailable")); const result = await runAssistantTurn(request());
    expect(result.outputType).toBe("error"); expect(result.responseText).toContain("could not be verified"); expect(result.responseText).not.toContain("good standing");
  });
  it("keeps language/model outages explicit and bounded", async () => {
    state.intent.mockRejectedValue(new Error("model down")); const r = await runAssistantTurn(request());
    expect(r.outputType).toBe("error"); expect(r.safeAuditMeta.aiCallCount).toBe(1); expect(state.handler).not.toHaveBeenCalled();
  });
  it("retains internal source references for replay authorization", async () => expect((await runAssistantTurn(request())).sourceReferences).toEqual([{ entityType: "party", entityId: 7 }]));
  it("retains a deliberate composite-source replay hold", async () => {
    state.handler.mockResolvedValue({ responseText: "SYNTHETIC", outputType: "text", historyReplayAllowed: false });
    expect((await runAssistantTurn(request())).historyReplayAllowed).toBe(false);
  });
  it("does not advertise an unsaved draft as created", async () => {
    state.intent.mockResolvedValue({ intentType: "prepare_draft", candidateActions: ["PREPARE_RENEWAL_NOTE"], confidence: "high" });
    state.handler.mockResolvedValue({ responseText: "draft", outputType: "draft_created", draftPayload: { summary: "SYNTHETIC" } });
    const req = request(); req.persistDraft.mockResolvedValue(null); expect((await runAssistantTurn(req)).outputType).toBe("error");
    req.persistDraft.mockRejectedValue(new Error("write lost")); expect((await runAssistantTurn(req)).outputType).toBe("error");
  });
  it("binds a confirmed draft to its actual source", async () => {
    state.intent.mockResolvedValue({ intentType: "prepare_draft", candidateActions: ["PREPARE_RENEWAL_NOTE"], confidence: "high" });
    state.handler.mockResolvedValue({ responseText: "draft", outputType: "draft_created", draftPayload: { summary: "SYNTHETIC" }, sourceReferences: [{ entityType: "party", entityId: 7 }] });
    const req = request(); expect((await runAssistantTurn(req)).draftIds).toEqual([3]); expect(req.persistDraft.mock.calls[0][3]).toEqual([{ entityType: "party", entityId: 7 }]);
  });
  it("checks dangerous commands before spending a model call", async () => {
    const result = await runAssistantTurn({ ...request(), userMessage: "Delete this document" }); expect(result.wasBlocked).toBe(true); expect(result.safeAuditMeta.aiCallCount).toBe(0); expect(state.handler).not.toHaveBeenCalled();
  });
  it("does not treat absent action permission as a valid source read", async () => {
    expect((await runAssistantTurn({ ...request(), userPermissions: [] })).outputType).toBe("error"); expect(state.handler).not.toHaveBeenCalled();
  });
});
