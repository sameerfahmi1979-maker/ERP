import {beforeEach,expect,it,vi} from 'vitest';
import {HR_DASHBOARD_METRICS,hrDashboardSchema,type HrDashboard} from '@/lib/reads/hr-dashboard-schema';
const state=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/server/reads/hr-dashboard',()=>({readHrDashboard:state.read}));
import * as actions from '@/server/actions/hr/dashboard';
let data:HrDashboard;
beforeEach(()=>{
 state.read.mockReset();
 data=hrDashboardSchema.parse({filters:{expiryThresholdDays:60},asOf:'2026-10-24T00:00:00Z',...Object.fromEntries(Object.entries(HR_DASHBOARD_METRICS).map(([section,keys])=>[section,Object.fromEntries(keys.map(key=>[key,{status:'ready',value:0}]))])),headcount:{status:'ready',items:[],total:0},attention:{items:[],failedSources:[],availableSources:6,limited:false}});
 state.read.mockImplementation(async()=>({success:true,data}));
});
it('compatibility employee counts delegate once to the complete authorized read',async()=>{
 data.employee.total={status:'ready',value:1371};expect((await actions.getHrDashboardEmployeeOverview({ownerCompanyId:1})).total).toBe(1371);expect(state.read).toHaveBeenCalledExactlyOnceWith({ownerCompanyId:1});
});
it.each(['failed','restricted']as const)('%s cannot become successful zero',async status=>{
 data.employee.total={status};await expect(actions.getHrDashboardEmployeeOverview()).rejects.toThrow('unavailable or restricted');
});
it('undefined medical/absence definitions are not invented zero',async()=>{
 data.compliance.medical_expired={status:'unavailable',reason:'definition'};expect((await actions.getHrDashboardComplianceOverview()).medical_expired).toBeNull();expect((await actions.getHrDashboardTimeOverview()).absent_today).toBeNull();
});
it('mixed restricted banking hides aggregate but a failed dependent read still fails',async()=>{
 data.payroll.wps_ready={status:'restricted'};expect(await actions.getHrDashboardPayrollOverview()).toBeNull();data.payroll.on_payroll_hold={status:'failed'};await expect(actions.getHrDashboardPayrollOverview()).rejects.toThrow();
});
it('failed attention cannot be all clear; headcount failures are generic',async()=>{
 data.attention.failedSources=['compliance'];await expect(actions.getHrDashboardAttentionItems()).rejects.toThrow();data.headcount={status:'failed'};expect(await actions.getHeadcountByCategory()).toEqual({success:false,error:'Headcount unavailable or restricted'});
});
it('shared denial never exposes details through any compatibility adapter',async()=>{
 state.read.mockResolvedValue({success:false,error:'SYNTHETIC_PRIVATE'});await expect(actions.getHrDashboardSummary()).rejects.toThrow('Dashboard sources unavailable or restricted');expect(JSON.stringify(await actions.getHeadcountByCategory())).not.toContain('PRIVATE');
});
