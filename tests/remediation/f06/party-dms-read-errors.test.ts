// Transport/query fault doubles; actual Auth/RLS tests are in child-reads.local.
import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const m=vi.hoisted(()=>({ctx:{} as AuthContext,from:vi.fn(),adminFrom:vi.fn(),document:vi.fn(),logger:vi.fn(),responses:[] as unknown[],authFailure:false}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>{if(m.authFailure)throw Error('private token diagnostic');return m.ctx;}}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:m.from})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:m.adminFrom})}));
vi.mock('@/lib/dms/document-access',()=>({checkDocumentConfidentialityAccess:m.document}));
vi.mock('@/lib/logger',()=>({logger:{error:m.logger}}));
import {getPartyApplyTargetRows} from '@/server/actions/dms/apply-to-erp';
const builder=(result:unknown)=>{const q={select:()=>q,eq:()=>q,is:()=>q,order:()=>q,single:async()=>result,maybeSingle:async()=>result,then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};return q;};
beforeEach(()=>{
 vi.clearAllMocks();m.authFailure=false;m.responses=[];
 const codes=['master_data.parties.view'];m.ctx={profile:{id:1},isAccountActive:true,roleCodes:[],permissionCodes:codes,globalPermissionCodes:codes,roleAssignments:[{roleCode:'test',ownerCompanyId:null,branchId:null,permissionCodes:codes}]} as unknown as AuthContext;
 m.document.mockResolvedValue({allowed:true});m.from.mockImplementation(()=>builder(m.responses.shift()));
 m.adminFrom.mockImplementation((table:string)=>{expect(table).toBe('erp_ai_feature_flags');return builder({data:{is_enabled:true},error:null});});
});
for(const kind of ['party_licenses','party_tax_registrations'] as const){
 for(const stage of ['parent','children','null-data','session','document'])it(`${kind} ${stage} failure cannot appear as empty success or expose diagnostics`,async()=>{
  const fault={data:null,error:{message:'private SQL token diagnostic',code:'XX000'}};
  m.responses=stage==='parent'?[fault]:[{data:{id:1,is_active:true,is_locked:false},error:null},stage==='null-data'?{data:null,error:null}:fault];
  if(stage==='session')m.authFailure=true;if(stage==='document')m.document.mockRejectedValue(Error('private token diagnostic'));
  const result=await getPartyApplyTargetRows({documentId:1,partyId:1,targetKind:kind});expect(result.success).toBe(false);expect(JSON.stringify([result,m.logger.mock.calls])).not.toMatch(/private|token|SQL/);
 });
 it(`${kind} never opens privileged business-table reads`,async()=>{
  m.responses=[{data:{id:1,is_active:true,is_locked:false},error:null},{data:[],error:null}];
  expect(await getPartyApplyTargetRows({documentId:1,partyId:1,targetKind:kind})).toMatchObject({success:true,data:[]});
  expect(m.from.mock.calls.map(c=>c[0])).toEqual(['parties',kind]);expect(m.adminFrom.mock.calls.every(c=>c[0]==='erp_ai_feature_flags')).toBe(true);
 });
}
