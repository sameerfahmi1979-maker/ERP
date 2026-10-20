import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),from:vi.fn(),admin:vi.fn(),cache:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:m.auth}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc,from:m.from})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
vi.mock('@/server/actions/audit',()=>({logAudit:m.audit}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
import {createEmployeeFromDmsDocuments} from '@/server/actions/hr/document-to-employee';
const input={selectedDocumentIds:[2],full_name_en:'Synthetic',gender:'male',date_of_birth:'1990-01-01',mobile_number:'000',owner_company_id:3,employee_category_id:4,joining_date:'2026-10-04',emergency_contact_name:'Contact',emergency_contact_mobile:'000',complianceRecords:[],totalDocumentsSelected:1};
const contract={operationId:'5e6a4fad-ad32-4c77-9774-78411fbdb954',reviewedSources:[{documentId:2,fingerprint:'a'.repeat(64)}]};
const receipt={employeeId:11,employeeCode:'SYN',employeeRevision:'1',referenceId:12,operationId:contract.operationId,sourceDocumentIds:[2],linkIds:[13],childRecords:[],complianceRecordsCreated:0,documentsLinked:1,warnings:[],replayed:false};
const codes=['hr.employees.create','hr.employees.view','hr.employees.update','dms.documents.view','dms.documents.preview','dms.documents.edit','numbering.rules.generate'];
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({profile:{id:1},isAccountActive:true,roleCodes:[],permissionCodes:codes,globalPermissionCodes:codes,roleAssignments:[{roleId:1,roleCode:'synthetic',ownerCompanyId:null,branchId:null,permissionCodes:codes}]});m.rpc.mockResolvedValue({data:receipt,error:null});});
it('saves only through one caller atomic RPC, without admin, direct writes, or separate audit',async()=>{expect(await createEmployeeFromDmsDocuments(input,contract)).toMatchObject({success:true,data:receipt});expect(m.rpc).toHaveBeenCalledOnce();expect(m.rpc).toHaveBeenCalledWith('create_numbered_document_employee',expect.objectContaining({p_operation:contract.operationId,p_sources:contract.reviewedSources}));expect(m.admin).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();});
it('rejects missing operation/source contract before any mutation',async()=>{expect((await createEmployeeFromDmsDocuments(input,undefined)).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
it('rejects a mismatched reviewed source set',async()=>{expect((await createEmployeeFromDmsDocuments(input,{...contract,reviewedSources:[{documentId:3,fingerprint:'a'.repeat(64)}]})).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
it('requires independent numbering and destination authority',async()=>{m.auth.mockResolvedValue({profile:{id:1},isAccountActive:true,roleCodes:[],permissionCodes:codes,globalPermissionCodes:[],roleAssignments:[]});expect((await createEmployeeFromDmsDocuments(input,contract)).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
it('confirmed commit survives refresh failure',async()=>{m.cache.mockImplementation(()=>{throw Error('PRIVATE');});expect((await createEmployeeFromDmsDocuments(input,contract)).success).toBe(true);});
it.each(['42501','23514','P0409','PT409'])('reports definitive rolled-back %s without raw data',async code=>{m.rpc.mockResolvedValue({data:null,error:{code,message:'PRIVATE'}});const result=await createEmployeeFromDmsDocuments(input,contract);expect(result).toMatchObject({success:false,uncertain:false});expect(result.error).not.toContain('PRIVATE');});
it('response loss remains uncertain',async()=>{m.rpc.mockRejectedValue(Error('PRIVATE'));expect(await createEmployeeFromDmsDocuments(input,contract)).toMatchObject({success:false,uncertain:true});});
it.each([null,{}, {...receipt,sourceDocumentIds:[3]}, {...receipt,operationId:'6e6a4fad-ad32-4c77-9774-78411fbdb954'}])('malformed/unrelated receipt %j remains uncertain',async data=>{m.rpc.mockResolvedValue({data,error:null});expect(await createEmployeeFromDmsDocuments(input,contract)).toMatchObject({success:false,uncertain:true});});

it.each(['40003','08007','40ZZZ','57014','PGRST000','XX000',undefined,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01',40001,{}])('W16 document employee unknown/malformed %j retains original request',async code=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W16_PRIVATE',details:'W16_PRIVATE',hint:'W16_PRIVATE'}});const result=await createEmployeeFromDmsDocuments(input,contract);
 expect(result).toMatchObject({success:false,uncertain:true});expect(result.error).toMatch(/unconfirmed/i);expect(JSON.stringify(result)).not.toMatch(/W16_PRIVATE|rejected|saved/i);
 expect(m.rpc).toHaveBeenCalledOnce();expect(m.admin).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();expect(m.cache).not.toHaveBeenCalled();
});
it.each(['40000','40001','40002','40P01','22023','23514','42501','PT409','P0001','P0002'])('W16 document employee preserves exact known %s',async code=>{m.rpc.mockResolvedValue({error:{code}});expect(await createEmployeeFromDmsDocuments(input,contract)).toMatchObject({uncertain:false});});
it('W16 document employee keeps 55P03 unknown',async()=>{m.rpc.mockResolvedValue({error:{code:'55P03'}});expect(await createEmployeeFromDmsDocuments(input,contract)).toMatchObject({uncertain:true});});
it.each(['40003','08007'])('W16 document employee exact source/request replay after %s',async code=>{
 m.rpc.mockResolvedValueOnce({data:null,error:{code}}).mockResolvedValueOnce({data:{...receipt,replayed:true},error:null});
 expect(await createEmployeeFromDmsDocuments(input,contract)).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledOnce();
 expect(await createEmployeeFromDmsDocuments(input,contract)).toMatchObject({success:true,data:{replayed:true}});
 expect(m.rpc.mock.calls[1]).toEqual(m.rpc.mock.calls[0]);expect(m.rpc.mock.calls[1][1].p_sources).toEqual(contract.reviewedSources);
});
