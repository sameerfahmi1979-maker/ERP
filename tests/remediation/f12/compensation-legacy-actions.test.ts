import {afterEach, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({read: vi.fn(), inquiry: vi.fn(), overview: vi.fn()}));
vi.mock("@/server/reads/hr-payroll-records", () => ({readPayrollPoint: state.read}));
vi.mock("@/server/reads/hr-payroll-inquiries", () => ({readPayrollInquiry: state.inquiry}));
vi.mock("@/server/reads/employee-overview", () => ({readEmployeeOverview: state.overview}));
import {calculateEmployeeBasicSalary, calculateEmployeeGrossSalary, getEmployeeWpsReadiness, listGlobalSalaryProfiles, listWpsReadiness, getEmployeePayrollSummary} from "@/server/actions/hr/payroll";
afterEach(() => vi.resetAllMocks());
it("legacy gross uses the same current scoped dated read as the employee record", async () => {
  state.read.mockResolvedValue({success: true, data: {value: {gross: 1000.01, basic: 800, activeCount: 2}}});
  expect(await calculateEmployeeGrossSalary(8)).toEqual({success: true, data: {gross: 1000.01}});
  expect(state.read).toHaveBeenCalledWith({kind: "salary-totals", employeeId: 8});
});
it("legacy salary list preserves server-side filters and exact count", async()=>{
  state.inquiry.mockResolvedValue({success:true,data:{kind:'salary',rows:[],totalCount:1107}});
  expect(await listGlobalSalaryProfiles({page:2,page_size:50,owner_company_id:9,payroll_status:'inactive'})).toEqual({success:true,data:{data:[],count:1107}});
  expect(state.inquiry).toHaveBeenCalledWith({kind:'salary',page:2,pageSize:50,ownerCompanyId:9,status:'inactive'});
});
it("legacy WPS list uses banking-gated inquiry and hold/status filters", async()=>{
  state.inquiry.mockResolvedValue({success:true,data:{kind:'wps',rows:[],totalCount:1107}});
  expect(await listWpsReadiness({page:2,page_size:50,wps_status:'hold',on_hold:true})).toEqual({success:true,data:{data:[],count:1107}});
  expect(state.inquiry).toHaveBeenCalledWith({kind:'wps',page:2,pageSize:50,ownerCompanyId:null,status:'hold',activeHoldOnly:true});
});
it.each([{missing_iban:true},{missing_labour_card:true},{page:0},{page_size:1000},{role:'admin'}])("unsupported legacy WPS criteria are not silently ignored",async input=>{
  expect((await listWpsReadiness(input)).success).toBe(false);expect(state.inquiry).not.toHaveBeenCalled();
});
it.each([listGlobalSalaryProfiles,listWpsReadiness])("unavailable global read never becomes a successful empty page",async action=>{
 state.inquiry.mockResolvedValue({success:false,error:'Permission denied'});expect(await action()).toEqual({success:false,error:'Permission denied'});
});
it("legacy summary uses current source and preserves explicit readiness reasons",async()=>{
 const readiness={status:'incomplete',missingRequirements:['Payroll profile is not active']};
 state.overview.mockResolvedValue({success:true,data:{sections:{payroll:{status:'ready',data:{payrollStatus:'inactive',grossSalary:1000.01,hasActiveHold:false,wpsStatus:'active',wpsReadiness:readiness}}}}});
 expect(await getEmployeePayrollSummary(8)).toMatchObject({success:true,data:{grossSalary:1000.01,wpsReadiness:readiness}});
 expect(state.overview).toHaveBeenCalledWith({employeeId:8,sections:['payroll']});
});
it.each(['failed','restricted'])("legacy %s summary is not authoritative zero/empty/Ready",async status=>{
 state.overview.mockResolvedValue({success:true,data:{sections:{payroll:{status}}}});expect((await getEmployeePayrollSummary(8)).success).toBe(false);
});
it("legacy basic keeps Basic separate from gross", async () => {
  state.read.mockResolvedValue({success: true, data: {value: {gross: 1000.01, basic: 800, activeCount: 2}}});
  expect(await calculateEmployeeBasicSalary(8)).toEqual({success: true, data: {basic: 800}});
  expect(state.read).toHaveBeenCalledWith({kind: "salary-totals", employeeId: 8});
});
it("legacy readiness uses the payroll plus independent banking subject gate", async () => {
  const readiness = {status: "on_hold", missingRequirements: ["Active payroll hold exists"]};
  state.read.mockResolvedValue({success: true, data: {value: {profile: null, readiness}}});
  expect(await getEmployeeWpsReadiness(8)).toEqual({success: true, data: readiness});
  expect(state.read).toHaveBeenCalledWith({kind: "wps", employeeId: 8});
});
it.each([calculateEmployeeBasicSalary, calculateEmployeeGrossSalary, getEmployeeWpsReadiness])("unavailable/denied reads never become zero pay or Ready", async action => {
  for (const error of ["Permission denied", "Payroll detail could not be completely loaded. Please retry."]) {
    state.read.mockResolvedValue({success: false, error});
    expect(await action(8)).toEqual({success: false, error});
  }
});
