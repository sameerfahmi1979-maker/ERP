import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const m=vi.hoisted(()=>({ctx:{} as AuthContext,from:vi.fn(),labels:vi.fn(),responses:[] as unknown[]}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>m.ctx}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:m.from})}));
vi.mock('@/server/party-reference-labels',()=>({attachPartyReferenceLabels:m.labels}));
import {getParties,getPartiesByTypeCode,getPartyById} from '@/server/actions/master-data/parties';
const privateError={message:'private database host or SQL detail',code:'XX000'};
beforeEach(()=>{
 vi.clearAllMocks();const codes=['master_data.parties.view'];m.ctx={profile:{id:1},isAccountActive:true,roleCodes:[],permissionCodes:codes,globalPermissionCodes:codes,roleAssignments:[{roleCode:'test',ownerCompanyId:null,branchId:null,permissionCodes:codes}]} as unknown as AuthContext;
 m.responses=[];m.from.mockImplementation(()=>{const result=m.responses.shift();const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>Promise.resolve(result),single:()=>Promise.resolve(result),maybeSingle:()=>Promise.resolve(result),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};return q;});
 m.labels.mockImplementation(async(_entity,rows)=>rows);
});
it.each(['all','filtered','detail'])('%s database failures are safe and explicit',async kind=>{
 m.responses=kind==='filtered'?[{data:{id:8},error:null},{data:[{party_id:1}],error:null},{data:null,error:privateError}]:[{data:null,error:privateError}];
 const r=kind==='all'?await getParties():kind==='detail'?await getPartyById(1):await getPartiesByTypeCode('CUSTOMER');
 expect(r).toMatchObject({success:false,kind:'failed'});expect(JSON.stringify(r)).not.toContain(privateError.message);
});
it.each(['type','assignment'])('filtered %s query failure is not an empty success',async step=>{
 m.responses=step==='type'?[{data:null,error:privateError}]:[{data:{id:8},error:null},{data:null,error:privateError}];
 expect(await getPartiesByTypeCode('CUSTOMER')).toMatchObject({success:false,kind:'failed'});
});
it('unconfigured party type is not advertised as zero matching business records',async()=>{
 m.responses=[{data:null,error:null}];expect(await getPartiesByTypeCode('CUSTOMER')).toMatchObject({success:false,kind:'not_found'});
});
it('a configured type with zero assignments is a true empty success',async()=>{
 m.responses=[{data:{id:8},error:null},{data:[],error:null}];expect(await getPartiesByTypeCode('CUSTOMER')).toEqual({success:true,data:[]});
});
it('a missing permitted detail has a distinct not-found result',async()=>{
 m.responses=[{data:null,error:null}];expect(await getPartyById(1)).toMatchObject({success:false,kind:'not_found'});
});
it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1])('rejects invalid detail identity %s before any query',async id=>{
 expect(await getPartyById(id)).toMatchObject({success:false,kind:'not_found'});expect(m.from).not.toHaveBeenCalled();
});
it('company-scoped view is not global party authority',async()=>{
 m.ctx={...m.ctx,globalPermissionCodes:[],roleAssignments:[{roleCode:'test',ownerCompanyId:1,branchId:null,permissionCodes:['master_data.parties.view']}]};
 for(const read of [()=>getParties(),()=>getPartyById(1),()=>getPartiesByTypeCode('CUSTOMER')])expect(await read()).toMatchObject({success:false,kind:'forbidden'});
 expect(m.from).not.toHaveBeenCalled();
});
it('reference-label failure remains a failure without exposing its details',async()=>{
 m.responses=[{data:[{id:1}],error:null}];m.labels.mockRejectedValue(new Error(privateError.message));
 const r=await getParties();expect(r).toMatchObject({success:false,kind:'failed'});expect(JSON.stringify(r)).not.toContain(privateError.message);
});
it('legacy global read permission remains supported',async()=>{
 const codes=['master_data.party_master.view'];m.ctx={...m.ctx,permissionCodes:codes,globalPermissionCodes:codes,roleAssignments:[{roleCode:'test',ownerCompanyId:null,branchId:null,permissionCodes:codes}]};
 m.responses=[{data:[],error:null}];expect(await getParties()).toEqual({success:true,data:[]});
});
