import {beforeEach, describe, expect, it, vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),auth:vi.fn(),permission:vi.fn(),cache:vi.fn(),audit:vi.fn(),reminders:vi.fn(),settings:vi.fn(),client:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:vi.fn(()=>{throw new Error('Admin client forbidden in this path');})}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth,hasPermission:m.permission}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
vi.mock('@/server/actions/audit',()=>({logAudit:m.audit}));
vi.mock('@/server/actions/dms/expiry-reminders',()=>({generateDmsExpiryRemindersForDocument:m.reminders,rebuildDmsExpiryReminders:vi.fn()}));
vi.mock('@/server/actions/dms/notification-settings',()=>({getDmsNotificationSettingsForScheduler:m.settings}));
import {createDmsDocument,type CreateDmsDocumentInput} from '@/server/actions/dms/documents';
const contract={operationId:'00000000-0000-4000-8000-000000000001',revision:null};
const payload:CreateDmsDocumentInput={title:'Synthetic document',document_type_id:8,category_id:9,status:'draft',confidentiality_level:'internal'};
const receipt={id:41,document_no:'DMS-2026-000041',reference_id:55,operation_id:contract.operationId,replayed:false};
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({profile:{id:11},roleCodes:[],permissionCodes:['dms.documents.upload']});m.permission.mockReturnValue(true);m.client.mockResolvedValue({rpc:m.rpc,from:m.from});m.rpc.mockResolvedValue({data:receipt,error:null});m.from.mockImplementation(()=>{throw new Error('Unexpected separate DMS write');});m.settings.mockResolvedValue(null);});
describe('standard DMS numbered creation action',()=>{
 it.each([undefined,null,{}, {...contract,revision:'1'},{...contract,operationId:'not-a-uuid'},{...contract,extra:true}])('rejects missing/invalid creation identity before dispatch: %j',async value=>{const result=await createDmsDocument(payload,value as never);expect(result.success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();});
 it('denies permission before client allocation',async()=>{m.permission.mockReturnValue(false);expect((await createDmsDocument(payload,contract)).success).toBe(false);expect(m.client).not.toHaveBeenCalled();});
 it.each([{...payload,title:''},{...payload,issue_date:'2026-02-30'},{...payload,issue_date:'2026-03-03',expiry_date:'2026-03-01'}])('rejects invalid metadata before RPC',async input=>{expect((await createDmsDocument(input,contract)).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
 it('uses one caller-bound transaction, never a separate allocator/insert/audit',async()=>{const result=await createDmsDocument(payload,contract);expect(result).toEqual({success:true,data:{id:41,document_no:receipt.document_no,replayed:false,operation_id:contract.operationId}});expect(m.rpc).toHaveBeenCalledExactlyOnceWith('create_numbered_dms_document',{p_operation:contract.operationId,p_data:payload});expect(m.from).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();});
 it('reuses the exact operation after response loss',async()=>{m.rpc.mockRejectedValueOnce(new Error('secret transport'));const first=await createDmsDocument(payload,contract);expect(first).toMatchObject({success:false,uncertain:true});await createDmsDocument(payload,contract);expect(m.rpc.mock.calls[0]).toEqual(m.rpc.mock.calls[1]);expect(JSON.stringify(first)).not.toContain('secret');});
 it.each(['23503','23505','22023','42501','PT409','P0002','40001'])('known SQL rollback %s is safely rejected',async code=>{m.rpc.mockResolvedValue({error:{code,message:'private schema detail',hint:'secret hint'},data:null});const result=await createDmsDocument(payload,contract);expect(result).toMatchObject({success:false,uncertain:false});expect(JSON.stringify(result)).not.toMatch(/private|secret/);});
 it.each(['PGRST000','08006','',undefined])('transport/unknown error %s retains request',async code=>{m.rpc.mockResolvedValue({error:{code,message:'private transport'},data:null});expect(await createDmsDocument(payload,contract)).toMatchObject({success:false,uncertain:true});});
 it.each([null,[],{}, {...receipt,id:0},{...receipt,operation_id:'00000000-0000-4000-8000-000000000002'},{...receipt,document_no:''},{...receipt,extra:'private'}])('incomplete/mismatched receipt is uncertain: %j',async data=>{m.rpc.mockResolvedValue({data,error:null});expect(await createDmsDocument(payload,contract)).toMatchObject({success:false,uncertain:true});expect(m.cache).not.toHaveBeenCalled();});
 it('accepts replay without another independent write',async()=>{m.rpc.mockResolvedValue({data:{...receipt,replayed:true},error:null});expect(await createDmsDocument(payload,contract)).toMatchObject({success:true,data:{id:41,replayed:true}});expect(m.from).not.toHaveBeenCalled();});
 it('cache failures preserve committed success',async()=>{m.cache.mockImplementation(()=>{throw new Error('private cache');});expect(await createDmsDocument(payload,contract)).toMatchObject({success:true,data:{id:41}});});
 it('post-commit reminder failures preserve committed success',async()=>{m.reminders.mockRejectedValue(new Error('private reminder'));expect(await createDmsDocument({...payload,expiry_date:'2027-01-01'},contract)).toMatchObject({success:true,data:{id:41}});expect(m.reminders).toHaveBeenCalledOnce();});
});

describe('W16 exact SQLSTATE uncertainty',()=>{
 it.each(['40003','08007','40ZZZ','57014','PGRST000','XX000',undefined,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01',40001,{}])('retains unknown/malformed code %j without follow-up work',async code=>{
  m.rpc.mockResolvedValue({data:null,error:{code,message:'W16_PRIVATE',details:'W16_PRIVATE',hint:'W16_PRIVATE'}});
  const result=await createDmsDocument(payload,contract);
  expect(result).toMatchObject({success:false,uncertain:true});expect(result.error).toMatch(/unconfirmed/i);
  expect(JSON.stringify(result)).not.toMatch(/W16_PRIVATE|rejected|no document|no number|committed/i);
  expect(m.rpc).toHaveBeenCalledOnce();expect(m.from).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();expect(m.cache).not.toHaveBeenCalled();expect(m.reminders).not.toHaveBeenCalled();
 });
 it.each(['40000','40001','40002','40P01','22023','23514','42501','PT409','P0001','P0002'])('preserves definite five-character rejection %s',async code=>{
  m.rpc.mockResolvedValue({data:null,error:{code}});expect(await createDmsDocument(payload,contract)).toMatchObject({success:false,uncertain:false});
 });
 it('does not extend the numbered policy to lock-unavailable',async()=>{m.rpc.mockResolvedValue({error:{code:'55P03'}});expect(await createDmsDocument(payload,contract)).toMatchObject({uncertain:true});});
 it.each(['40003','08007'])('explicit retry after %s preserves the entire request',async code=>{
  m.rpc.mockResolvedValueOnce({data:null,error:{code}}).mockResolvedValueOnce({data:{...receipt,replayed:true},error:null});
  expect(await createDmsDocument(payload,contract)).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledOnce();
  expect(await createDmsDocument(payload,contract)).toMatchObject({success:true,data:{replayed:true}});
  expect(m.rpc.mock.calls[1]).toEqual(m.rpc.mock.calls[0]);
 });
});
