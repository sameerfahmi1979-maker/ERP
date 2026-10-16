import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const mock=vi.hoisted(()=>({ctx:{} as AuthContext,result:{data:null,error:null} as {data:unknown;error:unknown},client:vi.fn(),query:vi.fn(),throwRead:false}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>mock.ctx}));
vi.mock('@/lib/supabase/server',()=>({createClient:mock.client}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {getWorkCalendarById,listWorkCalendars,getWorkCalendarComboboxOptions} from '@/server/actions/common-master-data/work-calendars';
beforeEach(()=>{
 vi.clearAllMocks();mock.throwRead=false;mock.result={data:null,error:null};
 mock.ctx={isAccountActive:true,profile:{id:1},permissionCodes:['common_md.view'],globalPermissionCodes:['common_md.view'],roleCodes:[],roleAssignments:[]} as unknown as AuthContext;
 const query={select:mock.query,eq:mock.query,is:mock.query,order:mock.query,limit:mock.query,ilike:mock.query,single:mock.query,maybeSingle:mock.query,then:(resolve:(value:unknown)=>unknown,reject:(error:unknown)=>unknown)=>mock.throwRead?Promise.reject(Error('private provider detail')).then(resolve,reject):Promise.resolve(mock.result).then(resolve,reject)};
 mock.query.mockReturnValue(query);mock.client.mockResolvedValue({from:()=>query});
});
it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1,NaN])('rejects invalid calendar id %s before a database request',async id=>{
 expect(await getWorkCalendarById(id)).toMatchObject({success:false,kind:'invalid_input'});expect(mock.client).not.toHaveBeenCalled();
});
it('distinguishes no visible record from a failed read without probing hidden records',async()=>{
 expect(await getWorkCalendarById(8)).toMatchObject({success:false,kind:'not_found'});
});
it.each(['detail','list','choice'])('%s database errors do not expose provider details',async mode=>{
 mock.result={data:null,error:{message:'private provider detail',code:'XX000'}};
 const result=mode==='detail'?await getWorkCalendarById(8):mode==='list'?await listWorkCalendars():await getWorkCalendarComboboxOptions();
 expect(result).toMatchObject({success:false,kind:'failed'});expect(JSON.stringify(result)).not.toContain('private provider detail');
});
it('transport exceptions remain secret safe and are not not-found',async()=>{
 mock.throwRead=true;expect(await getWorkCalendarById(8)).toMatchObject({success:false,kind:'failed'});expect(JSON.stringify(await listWorkCalendars())).not.toContain('private provider detail');
});
it('denied actor causes no database query',async()=>{
 mock.ctx={...mock.ctx,permissionCodes:[],globalPermissionCodes:[]};expect(await getWorkCalendarById(8)).toMatchObject({success:false,kind:'forbidden'});expect(mock.client).not.toHaveBeenCalled();
});
it('successful empty list is not a failed read',async()=>{
 mock.result.data=[];expect(await listWorkCalendars()).toEqual({success:true,data:[]});
});
it('successful detail preserves permitted inactive selection and record identity',async()=>{
 mock.result.data={id:8,owner_company_id:1,is_active:false,owner_company:{id:1,legal_name_en:'Retained company'}};
 expect(await getWorkCalendarById(8)).toEqual({success:true,data:mock.result.data});
});
