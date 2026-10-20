import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),from:vi.fn(),cache:vi.fn(),entry:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth,hasPermission:(ctx:{permissionCodes:string[]},code:string)=>ctx.permissionCodes.includes(code)}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc,from:m.from})}));
vi.mock('@/server/hr-compliance-document-access',()=>({canUseComplianceDocumentEntry:m.entry}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
import {mutateHrChild,readComplianceChildRevision} from '@/server/actions/hr/child-mutation';
const operationId='16ad2db0-5ab1-48ba-8dd0-05528a009831';
const contract={operationId,revision:'4'};
beforeEach(()=>{vi.resetAllMocks();m.entry.mockResolvedValue(true);m.auth.mockResolvedValue({profile:{id:7,must_change_password:false},isAccountActive:true,permissionCodes:['hr.compliance.view','hr.compliance.manage','hr.medical.view','hr.medical.manage']});});
it.each(['identity-document','medical-insurance','access-card','training-certificate','medical-record'])('%s uses one native scoped operation without a replacement revision read',async kind=>{
 const receipt={kind,id:17,employee_id:7,operation_id:operationId,revision:'5',replayed:false};m.rpc.mockResolvedValue({error:null,data:receipt});
 expect(await mutateHrChild({kind,employeeId:7,id:17,revision:'4',action:'update',values:{notes:null}},contract)).toEqual({success:true,data:receipt});
 expect(m.rpc).toHaveBeenCalledExactlyOnceWith('f11_mutate_compliance_child',{p_kind:kind,p_employee:7,p_id:17,p_revision:'4',p_operation:operationId,p_action:'update',p_data:{notes:null}});expect(m.from).not.toHaveBeenCalled();
});
it.each(['medical-insurance','medical-record'])('%s cannot borrow general compliance permission',async kind=>{
 m.auth.mockResolvedValue({profile:{id:7},isAccountActive:true,permissionCodes:['hr.compliance.view','hr.compliance.manage']});
 expect((await mutateHrChild({kind,employeeId:7,id:17,revision:'4',action:'archive',values:{}},contract)).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();
});
it('conflict retains the original revision and never retries automatically',async()=>{
 m.rpc.mockResolvedValue({error:{code:'P0409'},data:null});const r=await mutateHrChild({kind:'identity-document',employeeId:7,id:17,revision:'4',action:'update',values:{notes:'Synthetic'}},contract);
 expect(r).toMatchObject({success:false,uncertain:false});expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.from).not.toHaveBeenCalled();
});
it('lost response remains uncertain and never performs a linking fallback',async()=>{
 m.rpc.mockRejectedValue(Error('Synthetic connection lost'));expect(await mutateHrChild({kind:'identity-document',employeeId:7,id:17,revision:'4',action:'update',values:{notes:'Synthetic'}},contract)).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.from).not.toHaveBeenCalled();
});
it('malformed or foreign receipt cannot confirm the original operation',async()=>{
 m.rpc.mockResolvedValue({error:null,data:{kind:'identity-document',id:18,employee_id:7,operation_id:operationId,revision:'5',replayed:false}});
 expect(await mutateHrChild({kind:'identity-document',employeeId:7,id:17,revision:'4',action:'update',values:{notes:'Synthetic'}},contract)).toMatchObject({success:false,uncertain:true});
});
it('immediate actions read only their scoped original identity and revision',async()=>{
 const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),is:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({error:null,data:{id:17,employee_id:7,workspace_revision:4}})};m.from.mockReturnValue(query);
 expect(await readComplianceChildRevision('identity-document',7,17)).toEqual({success:true,revision:'4'});expect(query.select).toHaveBeenCalledWith('id,employee_id,workspace_revision');expect(query.eq.mock.calls).toEqual([['id',17],['employee_id',7]]);expect(m.rpc).not.toHaveBeenCalled();
});
it('document entry rechecks its feature/access gate before atomic dispatch',async()=>{
 m.entry.mockResolvedValue(false);
 expect(await mutateHrChild({kind:'identity-document',employeeId:7,id:null,revision:null,action:'create',values:{document_type_id:1,document_number:'Synthetic',entry_source:'document',source_document_ids:[41]}},{operationId,revision:null})).toMatchObject({success:false,accessDenied:true});
 expect(m.entry).toHaveBeenCalledOnce();expect(m.rpc).not.toHaveBeenCalled();
});
