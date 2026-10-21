import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),admin:vi.fn(),from:vi.fn(),audit:vi.fn(),cache:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:m.auth}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc,from:m.from})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.admin})}));
vi.mock('@/server/actions/audit',()=>({logAudit:m.audit}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
import {createJobRequisition,convertCandidateToEmployee} from '@/server/actions/hr/recruitment';
const op='5e6a4fad-ad32-4c77-9774-78411fbdb954';
const requisition={requisition_title:'Synthetic request',vacancies_count:1,requisition_status:'draft',priority:'normal'};
const conversion={owner_company_id:10,joining_date:'2026-10-04',offer_id:61,offer_revision:'4',offer_terms_version:'1',requisition_id:62,employee_status:'active',emergency_contact_name:'Synthetic contact',emergency_contact_mobile:'0000000000'};
const reqReceipt={id:41,requisition_code:'SYN-001',operation_id:op,replayed:false,reference_id:51};
const conversionReceipt={employee_id:42,employee_code:'SYN-002',candidate_id:7,candidate_revision:'4',employee_revision:'1',link_id:43,operation_id:op,replayed:false,reference_id:52};
const capabilities=['hr.recruitment.manage','hr.recruitment.view','hr.employees.create','hr.employees.view','hr.employees.update','numbering.rules.generate'];
beforeEach(()=>{
 vi.resetAllMocks();m.auth.mockResolvedValue({profile:{id:1},isAccountActive:true,permissionCodes:capabilities,globalPermissionCodes:capabilities,roleCodes:[],roleAssignments:[{roleId:1,roleCode:'synthetic',ownerCompanyId:null,branchId:null,permissionCodes:capabilities}]});
 m.admin.mockResolvedValue({data:[{generated_reference_number:'LEGACY'}],error:null});
 const chain={select:vi.fn(),eq:vi.fn(),is:vi.fn(),insert:vi.fn(),update:vi.fn(),single:vi.fn(async()=>({data:{id:41,requisition_code:'LEGACY'},error:null})),then:(resolve:(v:unknown)=>unknown)=>resolve({data:[],error:null})};
 for(const key of ['select','eq','is','insert','update'] as const)chain[key].mockReturnValue(chain);m.from.mockReturnValue(chain);m.rpc.mockResolvedValue({data:reqReceipt,error:null});
});
it('requires a retained requisition operation before allocation',async()=>{expect((await Reflect.apply(createJobRequisition,null,[requisition])).success).toBe(false);expect(m.admin).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();});
it('requires the opened candidate revision before conversion',async()=>{expect((await Reflect.apply(convertCandidateToEmployee,null,[7,conversion])).success).toBe(false);expect(m.admin).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();});
it('creates a requisition only through one caller atomic RPC',async()=>{
 expect(await Reflect.apply(createJobRequisition,null,[requisition,{operationId:op,revision:null}])).toMatchObject({success:true,data:{id:41,requisition_code:'SYN-001'}});
 expect(m.rpc).toHaveBeenCalledWith('create_numbered_job_requisition',{p_operation:op,p_data:requisition});expect(m.admin).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
});
it('converts through one atomic RPC preserving reviewed revision and required contact',async()=>{
 m.rpc.mockResolvedValue({data:conversionReceipt,error:null});expect(await Reflect.apply(convertCandidateToEmployee,null,[7,conversion,{operationId:op,revision:'3'}])).toMatchObject({success:true,data:{employee_id:42,employee_code:'SYN-002'}});
 expect(m.rpc).toHaveBeenCalledWith('convert_candidate_to_employee_atomic',{p_candidate:7,p_operation:op,p_revision:'3',p_data:conversion});expect(m.admin).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
});
it('requires independent numbering authority',async()=>{m.auth.mockResolvedValue({profile:{id:1},isAccountActive:true,permissionCodes:['hr.recruitment.manage'],globalPermissionCodes:['hr.recruitment.manage'],roleCodes:[],roleAssignments:[]});expect((await Reflect.apply(createJobRequisition,null,[requisition,{operationId:op,revision:null}])).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();});
it('does not turn a confirmed commit into refresh failure',async()=>{m.cache.mockImplementation(()=>{throw Error('PRIVATE');});expect((await Reflect.apply(createJobRequisition,null,[requisition,{operationId:op,revision:null}])).success).toBe(true);});
it('does not expose raw database messages',async()=>{m.rpc.mockResolvedValue({data:null,error:{code:'23514',message:'PRIVATE'}});const result=await Reflect.apply(createJobRequisition,null,[requisition,{operationId:op,revision:null}]);expect(result.success).toBe(false);expect(result.error).not.toContain('PRIVATE');});
it('keeps response loss uncertain',async()=>{m.rpc.mockRejectedValue(Error('PRIVATE'));expect(await Reflect.apply(createJobRequisition,null,[requisition,{operationId:op,revision:null}])).toMatchObject({success:false,uncertain:true});});
it('rejects an unrelated receipt as uncertain',async()=>{m.rpc.mockResolvedValue({data:{...reqReceipt,operation_id:'9e6a4fad-ad32-4c77-9774-78411fbdb954'},error:null});expect(await Reflect.apply(createJobRequisition,null,[requisition,{operationId:op,revision:null}])).toMatchObject({success:false,uncertain:true});});
it.each([0,-1,1.2,Number.MAX_SAFE_INTEGER+1])('rejects invalid candidate identity %s',async id=>{expect((await Reflect.apply(convertCandidateToEmployee,null,[id,conversion,{operationId:op,revision:'3'}])).success).toBe(false);expect(m.from).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();});

const w16RecruitmentCalls=[
 {kind:'requisition',run:()=>createJobRequisition(requisition as never,{operationId:op,revision:null}),receipt:reqReceipt},
 {kind:'conversion',run:()=>convertCandidateToEmployee(7,conversion as never,{operationId:op,revision:'3'}),receipt:conversionReceipt},
];
it.each(w16RecruitmentCalls.flatMap(row=>['40003','08007','40ZZZ','57014','PGRST000','XX000',undefined,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01',40001,{}].map(code=>({...row,code}))))('W16 $kind unknown/malformed $code stops after first RPC',async({run,code})=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W16_PRIVATE',details:'W16_PRIVATE',hint:'W16_PRIVATE'}});const result=await run();
 expect(result).toMatchObject({success:false,uncertain:true});expect(result.error).toMatch(/unconfirmed/i);expect(JSON.stringify(result)).not.toMatch(/W16_PRIVATE|rejected|committed/i);
 expect(m.rpc).toHaveBeenCalledOnce();expect(m.admin).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();expect(m.cache).not.toHaveBeenCalled();
});
it.each(w16RecruitmentCalls.flatMap(row=>['40000','40001','40002','40P01','22023','23514','42501','PT409','P0001','P0002'].map(code=>({...row,code}))))('W16 $kind preserves definite $code',async({run,code})=>{m.rpc.mockResolvedValue({error:{code}});expect(await run()).toMatchObject({uncertain:false});});
it.each(w16RecruitmentCalls)('W16 $kind does not broaden to 55P03',async({run})=>{m.rpc.mockResolvedValue({error:{code:'55P03'}});expect(await run()).toMatchObject({uncertain:true});});
it.each(w16RecruitmentCalls.flatMap(row=>['40003','08007'].map(code=>({...row,code}))))('W16 $kind exact retry after $code',async({run,code,receipt})=>{
 m.rpc.mockResolvedValueOnce({data:null,error:{code}}).mockResolvedValueOnce({data:{...receipt,replayed:true},error:null});
 expect(await run()).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledOnce();
 expect(await run()).toMatchObject({success:true,data:{replayed:true}});expect(m.rpc.mock.calls[1]).toEqual(m.rpc.mock.calls[0]);
 if('candidate_id' in receipt)expect(m.rpc.mock.calls[1][1]).toEqual({p_candidate:7,p_operation:op,p_revision:'3',p_data:conversion});
});
