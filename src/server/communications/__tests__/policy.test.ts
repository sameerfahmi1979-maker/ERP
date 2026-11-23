import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ rpc: vi.fn(), permit: vi.fn() }));
vi.mock("../budget", () => ({ reserveCommunicationBudget: fake.permit }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: fake.rpc }) }));

import { dispatchPolicy } from "../policy";

const mutation = "d8148641-55af-46e2-886a-3bd82768740f";
const actor = {
  profileId: "23", authUserId: "5c4cf2c5-7d29-403c-9cd7-e3f2d36b5966",
  authSessionId: "121cabf4-5ecc-487f-aa4f-4206f6055d1d", isGlobalSystemAdmin: false,
};

beforeEach(() => vi.resetAllMocks());

describe("communication safety command boundary", () => {
  it("fetches bounded policy status without claiming a budget permit or publication", async () => {
    const data = {
      currentVersion: null, acceptedVersion: null, accepted: false,
      termsText: null, canModerate: false, privacyPath: "/communications-disclosure.html",
    };
    fake.rpc.mockResolvedValue({ data, error: null });
    const command = {op: "policy.status", args: {}};
    expect(await dispatchPolicy(command, actor)).toEqual(data);
    expect(fake.rpc).toHaveBeenCalledWith("erp_communications_policy_v1", {p_request: command});
    expect(fake.permit).not.toHaveBeenCalled();
  });

  it("rejects forged identities, permits, invalid targets and excessive evidence before RPC", async () => {
    const report = {kind: "user", targetId: "24", reason: "privacy", clientMutationId: mutation};
    const candidates = [
      {op: "policy.status", args: {profileId: "24"}},
      {op: "policy.block", args: {targetProfileId: "23", blocked: true, clientMutationId: mutation}},
      {op: "policy.block", args: {targetProfileId: "9223372036854775808", blocked: true, clientMutationId: mutation}},
      {op: "policy.report", args: {...report, targetId: mutation}},
      {op: "policy.report", args: {...report, details: "x".repeat(1001)}},
      {op: "policy.report", args: {...report, _budgetPermitId: mutation}},
      {op: "policy.report", args: {...report, kind: "ptt_transmission"}},
      {op: "policy.moderate", args: {caseId: mutation, action: "restrictCommunication", clientMutationId: mutation}},
      {op: "policy.cases", args: {limit: 101}},
      {op: "policy.publish", args: {}},
    ];
    for (const command of candidates) {
      await expect(dispatchPolicy(command, actor)).rejects.toMatchObject({code: "invalid_request", status: 400});
    }
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("preserves a held reserve denial without trying to create a paid fallback", async () => {
    fake.rpc.mockResolvedValue({data: null, error: {code: "PT503", message: "policy_control_allocation_unavailable"}});
    const command = {op: "policy.block", args: {targetProfileId: "24", blocked: true, clientMutationId: mutation}};
    await expect(dispatchPolicy(command, actor)).rejects.toMatchObject({code: "temporarily_unavailable", status: 503});
    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.permit).not.toHaveBeenCalled();
  });

  it("returns a neutral denial without unpublished details", async () => {
    fake.rpc.mockResolvedValue({data: null, error: {code: "PT404", message: "protected content"}});
    const command = {op: "policy.report", args: {kind: "chat_message", targetId: mutation,
      reason: "privacy", clientMutationId: mutation}};
    await expect(dispatchPolicy(command, actor)).rejects.toMatchObject({
      code: "unavailable", status: 404, message: "The requested item is unavailable.",
    });
    expect(fake.permit).not.toHaveBeenCalled();
  });
});
