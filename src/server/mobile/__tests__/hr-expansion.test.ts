import { describe, expect, it } from "vitest";
import { hrCommand } from "../hr-contracts";

const operationId = "51e3c6cf-941e-44c0-9d1e-fccb031ee2db";
const overtime = {kind:"overtime", employeeRevision:"3",date:"2026-11-21",hours:1.25,reason:"Warehouse shift",evidence:null};
const submit = {op:"serviceSubmit",employeeId:9,operationId,proposal:overtime};
describe("expanded HR admission", () => {
  it("rejectsUnknownServiceFields", () => {
    expect(hrCommand.safeParse(submit).success).toBe(true);
    for (const proposal of [{...overtime,approved:true},{...overtime,hours:0.001},{...overtime,reason:"a\nb"}])
      expect(hrCommand.safeParse({...submit,proposal}).success).toBe(false);
  });
  it("preservesLegacyHrCommands", () => {
    expect(hrCommand.parse({op:"home"})).toEqual({op:"home"});
    expect(hrCommand.safeParse({op:"requests",scope:"own",after:0}).success).toBe(true);
  });
  it("binds evidenced task to the original source kind", () => {
    const proposal = {kind:"task-evidence",source:{kind:"onboarding-task",id:2,revision:"1"},evidence:{documentId:4,documentVersionId:5},note:""};
    expect(hrCommand.safeParse({...submit,proposal}).success).toBe(true);
    expect(hrCommand.safeParse({...submit,proposal:{...proposal,source:{...proposal.source,kind:"asset"}}}).success).toBe(false);
  });
  it("accepts an inclusive 93-day calendar range", () => {
    const q={op:"teamCalendar",companyId:null,branchId:null,employeeId:null,page:1,search:"",from:"2026-01-01",to:"2026-04-03"};
    expect(hrCommand.safeParse(q).success).toBe(true);
    expect(hrCommand.safeParse({...q,to:"2026-04-04"}).success).toBe(false);
  });
});
