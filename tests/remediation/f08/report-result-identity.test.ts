import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const m=vi.hoisted(()=>({code:'F08_ANALYTICAL',registryError:false,admissionError:false,completionError:false,zeroCompletion:false,ctx:null as unknown as AuthContext,fetch:vi.fn(),resolve:vi.fn(),fresh:vi.fn(),interactive:vi.fn(),employee:vi.fn(),writes:[] as Record<string,unknown>[]}));
vi.mock('@/lib/rbac/check',async()=>({...await vi.importActual('@/lib/rbac/scope'),assertAccountActive:(ctx:AuthContext)=>{if(!ctx.isAccountActive)throw Error('Inactive');},getAuthContextForProfileId:m.fresh,getAuthContext:m.interactive}));
vi.mock('@/server/actions/audit',()=>({logAudit:vi.fn()}));
vi.mock('@/lib/report-center/branding-resolver',()=>({resolveReportBranding:m.resolve}));
vi.mock('@/lib/report-center/report-fetchers',()=>({REPORT_FETCHERS:{F08_ANALYTICAL:{fetch:m.fetch},HR_F08_SCOPED:{fetch:m.fetch},HR_WPS_READINESS:{fetch:m.fetch}}}));
vi.mock('@/lib/report-center/scoped-read-client',()=>({createScopedReportReadClient:vi.fn(),revalidateScopedReportReadClient:vi.fn()}));
vi.mock('@/lib/rbac/employee-access',()=>({getEmployeeAccess:m.employee}));
vi.mock('@/lib/logger',()=>({logger:{error:vi.fn()}}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
 let write:Record<string,unknown>|undefined;const q={select:()=>q,eq:()=>q,is:()=>q,insert:(v:Record<string,unknown>)=>{write=v;m.writes.push(v);return q;},update:(v:Record<string,unknown>)=>{write=v;m.writes.push(v);return q;},
 maybeSingle:async()=>table==='erp_report_registry'?{error:m.registryError?{}:null,data:{id:1,report_code:m.code,required_permissions:['reports.run'],sensitive_profile:'normal',branding_strategy:'auto_by_owner_company'}}:{data:m.zeroCompletion?null:{id:7},error:m.completionError&&write?.run_status==='success'?{}:null},
 single:async()=>({data:{id:7},error:m.admissionError?{}:null}),then:(f:(v:{error:null})=>unknown)=>Promise.resolve({error:null}).then(f)};return q;
}})}));
import {runReport} from '@/lib/report-center/report-runner';
import {runReportAction} from '@/server/actions/reports/runner';
import {collectedCompanyIds,reportAuthorityIdentity} from '@/lib/report-center/result-identity';
afterEach(()=>vi.unstubAllEnvs());
beforeEach(()=>{vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.invalid');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-report-page-key');vi.clearAllMocks();m.code='F08_ANALYTICAL';m.registryError=false;m.admissionError=false;m.completionError=false;m.zeroCompletion=false;m.writes=[];
 m.ctx={profile:{id:11,owner_company_id:1,branch_id:null},isAccountActive:true,permissionCodes:['reports.run'],roleCodes:[],roleAssignments:[{roleId:1,roleCode:'QA',ownerCompanyId:1,branchId:null,permissionCodes:['reports.run']}]} as unknown as AuthContext;
 m.fresh.mockImplementation(async()=>structuredClone(m.ctx));m.fetch.mockResolvedValue({columns:['name'],rows:[{name:'Synthetic',owner_company_id:2}],meta:{ownerCompanyIds:[2]}});
 m.resolve.mockResolvedValue({resolvedTemplate:{id:21},resolvedBrandingProfile:{id:3,owner_company_id:2},requiresManualTemplateSelection:false});
});
const run=(ownerCompanyIds?:number[])=>runReport({reportCode:'F08_ANALYTICAL',requestedByUserId:11,outputFormat:'screen',ownerCompanyIds},m.ctx);
it('rebinds actual collected company identity before any output and corrects the run log',async()=>{expect((await run()).success).toBe(true);expect(m.resolve.mock.calls[0][0].ownerCompanyIds).toEqual([]);expect(m.resolve.mock.calls[1][0].ownerCompanyIds).toEqual([2]);expect(m.writes.at(-1)).toMatchObject({owner_company_ids:[2],resolved_branding_profile_id:3,selected_template_id:21});});
it('never brands one company using a stale caller company hint',async()=>{const r=await run([1]);expect(r.success).toBe(false);expect(r.data).toBeUndefined();expect(r.error).toMatch(/company context/);});
it('denies a different subsidiary letterhead even if the actor can view both companies',async()=>{m.resolve.mockResolvedValue({resolvedTemplate:{id:21},resolvedBrandingProfile:{id:3,owner_company_id:1},requiresManualTemplateSelection:false});const r=await run();expect(r.success).toBe(false);expect(r.error).toContain('matching the report company');});
it('requests manual combined-data branding rather than returning rows with one subsidiary identity',async()=>{m.resolve.mockResolvedValueOnce({requiresManualTemplateSelection:false}).mockResolvedValueOnce({requiresManualTemplateSelection:true});m.fetch.mockResolvedValue({columns:[],rows:[{owner_company_id:1},{owner_company_id:2}]});expect(await run()).toMatchObject({success:false,requiresManualTemplateSelection:true});});
it('allows a governed group/neutral identity for combined data',async()=>{m.resolve.mockResolvedValue({resolvedTemplate:{id:21},resolvedBrandingProfile:{id:3,owner_company_id:null},requiresManualTemplateSelection:false});m.fetch.mockResolvedValue({columns:[],rows:[{owner_company_id:1},{owner_company_id:2}]});expect((await run()).success).toBe(true);});
it('suppresses collected rows when assignment scope changes during I/O',async()=>{m.fresh.mockImplementation(async()=>({...m.ctx,roleAssignments:[]}));const r=await run();expect(r.success).toBe(false);expect(r.error).toContain('permissions changed');expect(r.data).toBeUndefined();});
it.each(['admission','completion','zeroCompletion'])('fails closed on unconfirmed %s audit',async mode=>{if(mode==='admission')m.admissionError=true;if(mode==='completion')m.completionError=true;if(mode==='zeroCompletion')m.zeroCompletion=true;const r=await run();expect(r.success).toBe(false);expect(r.data).toBeUndefined();});
it('does not guess invalid company identities',()=>{expect(()=>collectedCompanyIds({columns:[],rows:[{owner_company_id:'invalid'}]})).toThrow();expect(collectedCompanyIds({columns:[],rows:[{owner_company_id:2},{owner_company_id:1}]})).toEqual([1,2]);});
it('compares equivalent assignment order without false retirement',()=>{expect(reportAuthorityIdentity(m.ctx)).toBe(reportAuthorityIdentity({...m.ctx,permissionCodes:[...m.ctx.permissionCodes].reverse()}));});
it('never passes another company medical/payroll capabilities into a selected employee fetcher or redactor',async()=>{
 m.code='HR_F08_SCOPED';m.ctx.permissionCodes=['reports.run','hr.medical.view','hr.payroll.view'];m.employee.mockResolvedValue({allows:(code:string)=>code==='reports.run',scopedContext:{...m.ctx,permissionCodes:['reports.run']}});
 const result=await runReport({reportCode:m.code,requestedByUserId:11,outputFormat:'screen',filters:{employee_id:2}},m.ctx);expect(result.success).toBe(true);expect(m.employee).toHaveBeenCalledWith(m.ctx,2);expect(m.fetch.mock.calls[0][1]).toEqual(['reports.run']);
});
it('a selected employee outside current report permissions never reaches a fetcher',async()=>{
 m.code='HR_F08_SCOPED';m.employee.mockResolvedValue({allows:()=>false,scopedContext:{...m.ctx,permissionCodes:[]}});expect((await runReport({reportCode:m.code,requestedByUserId:11,outputFormat:'screen',filters:{employee_id:2}},m.ctx)).success).toBe(false);expect(m.fetch).not.toHaveBeenCalled();
});
it('rechecks live employee links after collection even when the role identity is unchanged',async()=>{
 m.code='HR_F08_SCOPED';
 m.employee.mockResolvedValueOnce({allows:()=>true,scopedContext:m.ctx}).mockResolvedValueOnce({allows:()=>false,scopedContext:{...m.ctx,permissionCodes:[]}});
 const result=await runReport({reportCode:m.code,requestedByUserId:11,outputFormat:'screen',filters:{employee_id:2}},m.ctx);
 expect(m.fetch).toHaveBeenCalledOnce();expect(m.employee).toHaveBeenCalledTimes(2);
 expect(result).toMatchObject({success:false,error:expect.stringContaining('employee report access changed')});expect(result.data).toBeUndefined();
 expect(m.writes.some(w=>w.run_status==='success')).toBe(false);
});

const analyticalCode = 'HR_WPS_READINESS';
const worklistPage = {pageIndex: 0, pageSize: 25, sorting: [], globalFilter: '', columnFilters: []};
const runAnalytical = (page?: import('@/lib/report-center/types').ReportScreenPageQuery, outputFormat: 'screen' | 'excel' = 'screen') =>
 runReport({reportCode: analyticalCode, requestedByUserId: 11, outputFormat, screenPage: page}, m.ctx);
function analyticalRows() {
 m.code = analyticalCode;
 const rows = Array.from({length: 1002}, (_, index) => ({name: `Person ${index + 1}`, amount: index + 1, accepted: index % 2 === 0, owner_company_id: 2}));
 m.fetch.mockResolvedValue({columns: ['name', 'amount', 'accepted'], rows, meta: {total: rows.length, ownerCompanyIds: [2]}});
 return rows;
}
it('limits the interactive payload while retaining exact full counts and filtering and sorting across deep pages', async () => {
 analyticalRows();
 const first = await runAnalytical(worklistPage);
 expect(first).toMatchObject({success: true, rowCount: 1002, screenPage: {totalCount: 1002, pageIndex: 0, pageSize: 25}});
 expect(first.data?.rows.map(row => row.amount)).toEqual(Array.from({length: 25}, (_, index) => index + 1));
 expect(JSON.stringify(first)).not.toContain('Person 1002');
 expect(first.screenPage?.filters).toEqual(expect.arrayContaining([expect.objectContaining({id: 'amount', type: 'number'}), expect.objectContaining({id: 'accepted', type: 'select'})]));
 const sameOrder = await runAnalytical({...worklistPage, receipt:first.screenPage!.receipt,
   columnFilters:[{id:'unused',value:'ignored'}]});
 expect(sameOrder.screenPage).toEqual(first.screenPage);
 expect(sameOrder.data).toEqual(first.data);
 const filtered = await runAnalytical({ ...worklistPage, receipt: first.screenPage!.receipt, pageIndex: 1,
  sorting: [{id: 'amount', desc: true}], globalFilter: 'Person', columnFilters: [{id: 'accepted', value: 'true'}]});
 expect(filtered).toMatchObject({success: true, rowCount: 1002, screenPage: {totalCount: 501, pageIndex: 1, receipt: first.screenPage!.receipt}});
 expect(filtered.data?.rows.map(row => row.amount)).toEqual(Array.from({length: 25}, (_, index) => 951 - index * 2));
 const deep = await runAnalytical({...worklistPage, receipt: first.screenPage!.receipt, pageIndex: 40});
 expect(deep.data?.rows.map(row => row.amount)).toEqual([1001, 1002]);
 expect(m.writes).toHaveLength(2);
 expect(m.writes.at(-1)).toMatchObject({run_status: 'success', row_count: 1002});
});
it('retires a preview after a deep row or the selected template version changes', async () => {
 const rows = analyticalRows();
 const first = await runAnalytical(worklistPage);
 const next = {...worklistPage, receipt: first.screenPage!.receipt, pageIndex: 1};
 rows[1001].name = 'Changed outside the first page';
 expect(await runAnalytical(next)).toMatchObject({success: false, error: expect.stringContaining('changed')});
 rows[1001].name = 'Person 1002';
 m.resolve.mockResolvedValue({resolvedTemplate:{id:21, version_no: 2},resolvedBrandingProfile:{id:3,owner_company_id:2},requiresManualTemplateSelection:false});
 const stale = await runAnalytical(next);
 expect(stale).toMatchObject({success: false, error: expect.stringContaining('changed')});
 expect(stale.data).toBeUndefined();
});
it('never return a stale page when authority is revoked and always keep fresh delivery complete', async () => {
 analyticalRows();
 m.ctx.permissionCodes.push('reports.export');
 m.ctx.globalPermissionCodes = ['reports.export'];
 const first = await runAnalytical(worklistPage);
 const full = await runAnalytical(undefined, 'excel');
 expect(full).toMatchObject({success: true, rowCount: 1002});
 expect(full.data?.rows).toHaveLength(1002);
 expect(full.screenPage).toBeUndefined();
 expect(full.analyticalBrandingVersion).toBe(first.analyticalBrandingVersion);
 expect(JSON.stringify(first).length).toBeLessThan(JSON.stringify(full).length / 20);
 m.fresh.mockResolvedValue({...m.ctx, roleAssignments: []});
 const revoked = await runAnalytical({...worklistPage, receipt: first.screenPage!.receipt, pageIndex: 1});
 expect(revoked).toMatchObject({success: false, error: expect.stringContaining('permissions changed')});
 expect(revoked.data).toBeUndefined();
});
it('retires a continuation when its ERP session is revoked during collection with unchanged worker authority', async () => {
 analyticalRows();
 const input = {reportCode: analyticalCode, outputFormat: 'screen' as const, screenPage: worklistPage};
 m.interactive.mockResolvedValue(m.ctx);
 const initial = await runReportAction(input);
 const receipt = initial.data!.screenPage!.receipt;
 m.interactive.mockResolvedValueOnce(m.ctx)
  .mockResolvedValueOnce({...m.ctx, profile: null, isAccountActive: false, permissionCodes: []});
 const revoked = await runReportAction({...input, screenPage: {...worklistPage, pageIndex: 1, receipt}});
 expect(revoked).toMatchObject({success: false, error: expect.stringContaining('session')});
 expect(revoked.data?.data).toBeUndefined();
 expect(m.fresh).not.toHaveBeenCalled();
 expect(m.writes).toHaveLength(2);
});
