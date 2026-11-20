import { describe, expect, it, vi } from "vitest";
import { hrCommand } from "../hr-contracts";
import { balanceRow, normalizeReceipt, formatProposal, HrError } from "../hr-shapes";
import { POST } from "@/app/api/mobile/hr/v1/route";
const { auth, dispatch } = vi.hoisted(() => ({ auth: vi.fn(), dispatch: vi.fn() }));
vi.mock("@/lib/rbac/check", async load => ({ ...await load<typeof import("@/lib/rbac/check")>(), getAuthContext: auth }));
vi.mock("@/lib/supabase/mobile-request", () => ({ withMobileToken: (_: string, f: () => unknown) => f() }));
vi.mock("../hr", () => ({ dispatchHr: dispatch }));
const uid = "69cfc140-a4c8-4ce5-a7ca-4692f08a9e22";
const write = { operationId:uid, employeeId:12, revision:"3" };
describe("mobile HR input and private projections", () => {
  it("enforces the canonical contact maxima at the HTTP boundary",()=>{
    for(const [key,max] of [["mobile_number",40],["emergency_contact_mobile",40],["emergency_contact_name",160]] as const){
      expect(hrCommand.safeParse({op:"profileCorrection",...write,changes:{[key]:"a".repeat(max)}}).success).toBe(true);
      expect(hrCommand.safeParse({op:"profileCorrection",...write,changes:{[key]:"a".repeat(max+1)}}).success).toBe(false);
    }
  });
  it("identifies two same-kind compliance source records by exact ID and revision",()=>{
    const opening=(sourceId:number,sourceRevision:string)=>formatProposal("compliance-renewal",{sourceKind:"training-certificate",sourceId,sourceRevision,reason:"Renew"});
    expect(opening(71,"3")).toContainEqual({label:"Source record",value:"Training certificate #71"});
    expect(opening(71,"3")).toContainEqual({label:"Source revision",value:"3"});
    expect(opening(72,"8")).toContainEqual({label:"Source record",value:"Training certificate #72"});
    expect(opening(72,"8")).toContainEqual({label:"Source revision",value:"8"});
  });
  it("rejects extra authority flags and tampered fields", () => {
    expect(hrCommand.safeParse({op:"profile",isAdmin:true}).success).toBe(false);
    for(const key of ["salary","bank_account","employee_status","blood_group","uae_address"])
      expect(hrCommand.safeParse({op:"profileCorrection",...write,changes:{[key]:"99"}}).success).toBe(false);
  });
  it("keeps the established evidence picker and restricts certificate purposes",()=>{
    const original={op:"evidence",employeeId:12,page:1};
    expect(hrCommand.parse(original)).toMatchObject({purpose:"renewal"});
    expect(hrCommand.parse({...original,purpose:"leave"})).toMatchObject({purpose:"leave"});
    expect(hrCommand.safeParse({...original,purpose:"payroll"}).success).toBe(false);
  });
  it("requires original revision and attachment version pairs", () => {
    expect(hrCommand.safeParse({op:"timeCorrection", ...write,id:null,date:"2026-11-20",reason:"Missing end time"}).success).toBe(false);
    expect(hrCommand.safeParse({op:"leaveSubmit",employeeId:12,operationId:uid,leaveTypeId:3,startDate:"2026-11-21",endDate:"2026-11-22",reason:"Annual",documentId:4,documentVersionId:null}).success).toBe(false);
  });
  it("keeps unknown balances distinct from genuine zero", () => {
    const period = {id:1,leave_type_id:3,leave_year:2026,period_start:null,period_end:null,period_basis:null,entitled_days:5,used_days:3,reserved_days:2,known:false};
    expect(balanceRow(period,"Annual")).toMatchObject({known:false,available:null});
    expect(balanceRow({...period,known:true},"Annual")).toMatchObject({known:true,available:0});
  });
  it("rejects receipt for a different employee, original UUID or record", () => {
    const receipt={operationId:uid,id:3,employeeId:12,revision:4,replayed:false};
    expect(normalizeReceipt(receipt,uid,12,3).revision).toBe("4");
    for(const data of [{...receipt,id:4},{...receipt,employeeId:13},{...receipt,operationId:"wrong"}])
      expect(()=>normalizeReceipt(data,uid,12,3)).toThrow(HrError);
  });
  it("allowlists structured proposal fields", () => {
    const fields=formatProposal("profile-correction",{changes:{mobile_number:"1234",blood_group:"secret",salary:"secret"}});
    expect(JSON.stringify(fields)).toContain("1234");
    expect(JSON.stringify(fields)).not.toContain("secret");
  });
});
function http(body:unknown, token=true) {
  return POST(new Request("http://local/api/mobile/hr/v1",{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer aaa.bbb.ccc"}:{})},body:JSON.stringify(body)}));
}
describe("mobile HR route",()=>{
  it("requires a current bearer and rejects a revoked or inactive account",async()=>{
    expect((await http({op:"profile"},false)).status).toBe(401);
    auth.mockResolvedValue({profile:null});expect((await http({op:"profile"})).status).toBe(401);
    auth.mockResolvedValue({profile:{must_change_password:true},isAccountActive:true});expect((await http({op:"profile"})).status).toBe(403);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("returns unconfirmed operations as private non-cacheable errors",async()=>{
    auth.mockResolvedValue({profile:{must_change_password:false},isAccountActive:true});
    dispatch.mockRejectedValue(new HrError(503,"Original receipt unavailable.",true));
    const response=await http({op:"rosterReceipt",operationId:uid});
    expect(response.status).toBe(503);expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toEqual({success:false,error:"Original receipt unavailable.",uncertain:true});
  });
});
