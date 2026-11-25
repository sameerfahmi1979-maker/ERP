import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requests } from "../requests";
import { collections } from "../collections";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const invoke = vi.fn();
const parent = { entityType: "employee" as const, entityId: 7 };
const operationId = "5890339e-52b0-465e-b3cc-67edca61c910";
const hash = "c".repeat(64);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createClient).mockResolvedValue({rpc: invoke} as unknown as Awaited<ReturnType<typeof createClient>>);
});
describe("request and collection delivery", () => {
  it("recovers only the exact current evidence request in one read", async () => {
    const request = {kind:"missing" as const,parent,requestId:724,revision:3,documentTypeId:9};
    invoke.mockResolvedValueOnce({data:true}).mockResolvedValueOnce({error:{code:"PT404"}});
    expect(await requests({op:"documentRequestEvidence",...request})).toEqual({available:true});
    expect(invoke).toHaveBeenCalledExactlyOnceWith("mobile_dms_request_evidence",{p_data:request});
    await expect(requests({op:"documentRequestEvidence",...request})).rejects.toMatchObject({status:404});
    expect(invoke).toHaveBeenCalledTimes(2);
  });
  it("exposes the current checklist hash only for a requestable missing rule", async () => {
    const row = {ruleId: 2, label: "Certificate", documentTypeId: 9, state:"missing", canRequest:true, checklistHash:hash};
    invoke.mockResolvedValue({data:{rows:[row],totalCount:1,coverage:"complete",missingCount:1}});
    expect(await requests({op:"requiredChecklist",parent,page:1})).toMatchObject({rows:[row],missingCount:1});
    invoke.mockResolvedValue({data:{rows:[{...row, checklistHash:null}],totalCount:1,coverage:"complete",missingCount:1}});
    await expect(requests({op:"requiredChecklist",parent,page:1})).rejects.toMatchObject({code:"invalid_receipt"});
  });
  it("submits the retained checklist proof and keeps stale admission atomic", async () => {
    invoke.mockResolvedValue({error:{code:"PT409"}});
    const data={kind:"missing" as const,parent,ruleId:2,assigneeId:null,dueDate:null,notes:"",operationId,checklistHash:hash};
    await expect(requests({op:"documentRequestCreate",...data})).rejects.toMatchObject({status:409});
    expect(invoke).toHaveBeenCalledWith("mobile_dms_requests",{p_action:"create",p_data:data});
  });
  it("routes a renewal to the canonical renewal adapter and binds the current parent", async () => {
    invoke.mockResolvedValue({error:{code:"42501"}});
    const data={kind:"renewal" as const,parent,documentId:5,sourceHash:hash,priority:"normal" as const,assigneeId:null,dueDate:null,notes:"",operationId};
    await expect(requests({op:"documentRequestCreate",...data})).rejects.toMatchObject({status:403});
    expect(invoke).toHaveBeenCalledWith("mobile_dms_renewal_request",{p_data:data});
  });
  it("requires strict complete private filter pages and the original delete operation", async () => {
    invoke.mockResolvedValue({data:{rows:[],totalCount:3}});
    await expect(collections({op:"documentSavedFilters",page:1})).rejects.toThrow("Incomplete");
    invoke.mockResolvedValue({data:{deleted:true,id:2,operationId,replayed:true}});
    expect(await collections({op:"documentSavedFilterDelete",id:2,operationId,revision:hash})).toMatchObject({deleted:true,replayed:true});
    expect(invoke).toHaveBeenLastCalledWith("mobile_dms_collections",{p_action:"delete_filter",p_data:{id:2,operationId,revision:hash}});
  });
});
