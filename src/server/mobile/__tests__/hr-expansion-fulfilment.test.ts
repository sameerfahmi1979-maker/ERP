import { expect,it,vi,beforeEach } from "vitest";
import { fulfilService } from "../hr-fulfilment";
import { serviceReadWrite } from "../hr-services";
import type { Db } from "../hr-reads";
const dep=vi.hoisted(()=>({generate:vi.fn(),recover:vi.fn(),verify:vi.fn(),finalise:vi.fn()}));
vi.mock("@/server/actions/output/generate-official-document",()=>({generateOfficialDocument:dep.generate}));
vi.mock("@/server/actions/output/recover-official-document",()=>({recoverOfficialDocument:dep.recover}));
vi.mock("@/server/issued-file-delivery",()=>({deliverIssuedFile:dep.verify}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:dep.finalise})}));
const op="8b37b95a-5b42-472c-a1af-4826ae697df2",checksum="a".repeat(64);
const context={employeeId:8,id:3,revision:"2",operationId:op,op:"serviceFulfil" as const};
const proposal={kind:"letter",employeeRevision:"1",outputCode:"HR_EMBASSY_LETTER",language:"en",recipient:"The embassy",purpose:"Visa",neededBy:null,evidence:null};
const pending={pending:true,proposal};
const done={effect:"fulfilled",operationId:op,employeeId:8,id:3,revision:"3",replayed:false,canonical:{kind:"issued-document",id:5,issuanceId:5,operationId:null,revision:null}};
const rpc=vi.fn(),db={rpc,auth:{getClaims:async()=>({data:{claims:{sub:"actor",session_id:"session"}}})}} as unknown as Db;
beforeEach(()=>{vi.resetAllMocks();rpc.mockResolvedValue({data:pending});dep.finalise.mockResolvedValue({data:done});dep.verify.mockResolvedValue(new Response("original"));});
it("failedOutputIsNotIssued",async()=>{
 dep.recover.mockResolvedValue({success:false,blocked:"reconciliation_required",issuanceId:5});
 await expect(fulfilService(db,{...context,command:{kind:"recover-letter",issuanceId:5}})).rejects.toMatchObject({status:503,uncertain:true});
 expect(dep.verify).not.toHaveBeenCalled();expect(dep.finalise).not.toHaveBeenCalled();
});
it("links an already issued letter after exact-byte verification",async()=>{
 expect(await fulfilService(db,{...context,command:{kind:"link-issued-letter",issuanceId:5,checksum}})).toEqual(done);
 expect(dep.verify).toHaveBeenCalledWith(5,{employeeId:8,checksum,mode:"download"});
 expect(dep.generate).not.toHaveBeenCalled();expect(dep.finalise).toHaveBeenCalledOnce();
});
it("cannot attach an output whose verification failed",async()=>{
 dep.verify.mockResolvedValue(new Response(null,{status:409}));
 await expect(fulfilService(db,{...context,command:{kind:"link-issued-letter",issuanceId:5,checksum}})).rejects.toMatchObject({status:409});
 expect(dep.finalise).not.toHaveBeenCalled();
});
it("reconciles an uncertain generated output using the exact retained operation",async()=>{
 dep.generate.mockResolvedValue({success:true,lifecycleState:"issued",issuanceId:5,finalSha256:checksum});
 const command={kind:"issue-letter" as const,outputCode:"HR_EMBASSY_LETTER",language:"en" as const,sourceId:null,sourceReviewId:null,templateId:null};
 expect(await fulfilService(db,{...context,command})).toEqual(done);
 expect(dep.generate).toHaveBeenCalledWith("HR_EMBASSY_LETTER",8,expect.objectContaining({clientRequestToken:op,language:"en",inputs:expect.objectContaining({addressee:"The embassy",purpose:"Visa"})}));
 rpc.mockResolvedValue({data:{...done,replayed:true}});
 expect(await fulfilService(db,{...context,command})).toEqual({...done,replayed:true});
 expect(dep.generate).toHaveBeenCalledOnce();
});
it("rejects a full proposal smuggled into a summary-only opening",async()=>{
 rpc.mockResolvedValue({data:{id:3,employeeId:8,employeeLabel:null,revision:"2",kind:null,title:"Employee service",createdAt:"2026-11-21T00:00:00Z",
  review:"approved",fulfilment:"not-started",canRead:false,canDecide:false,canFulfil:false,visibility:"summary",proposal,decidedAt:null,decisionReason:null,fulfilledAt:null,result:null,fields:[]}});
 await expect(serviceReadWrite(db,{op:"serviceOpening",employeeId:8,id:3,revision:"2"})).rejects.toThrow();
});
