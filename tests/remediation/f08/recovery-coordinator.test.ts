import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({recover:vi.fn(),read:vi.fn(),runner:vi.fn(),scope:true}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:11}})}));
vi.mock('@/lib/rbac/employee-access',()=>({getEmployeeAccess:async()=>({allows:()=>m.scope})}));
vi.mock('@/lib/output/feature-flags',()=>({isOutputCoordinatorEnabled:()=>true,isOfficialIssuanceEnabled:()=>false}));
vi.mock('@/lib/output/issued-file-access',()=>({issuedFileUrl:(id:number)=>`/api/output/file?issuanceId=${id}`,canAccessIssuedFile:async()=>m.scope}));
vi.mock('@/lib/output/durable-operation',async original=>({...await original<typeof import('@/lib/output/durable-operation')>(),recoverDurableOutput:m.recover}));
vi.mock('@/lib/report-center/report-runner',()=>({runReport:m.runner}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{if(table!=='erp_generated_pdf_documents')throw Error('Fresh source must not be queried on replay');const b={select:()=>b,eq:()=>b,maybeSingle:m.read};return b;}})}));
import {issuanceCommandHash} from '@/lib/output/durable-operation';
import {generateOfficialDocument} from '@/server/actions/output/generate-official-document';
const options={clientRequestToken:'stable-synthetic-token',language:'ar' as const,inputs:{recipient:'Synthetic'}};
beforeEach(()=>{
 vi.resetAllMocks();m.scope=true;m.read.mockResolvedValue({error:null,data:{id:7,source_record_id:1,output_code:'F08_QA',data_snapshot_json:{operation:{commandHash:issuanceCommandHash(options),policy:{official:false}}}}});
 m.recover.mockResolvedValue({kind:'issued',issuanceId:7,storagePath:'retained/original.pdf',fileName:'original.pdf',finalSha256:'a'.repeat(64),fileSizeBytes:100,serialNo:'F08-7',qr:{status:'not_requested'},reissued:false,idempotentReplay:true});
});
it('same command recovers before fetching any current source or branding',async()=>{
 expect(await generateOfficialDocument('F08_QA',1,options)).toMatchObject({success:true,issuanceId:7,storagePath:'retained/original.pdf',requestKey:expect.stringMatching(/^req_/),idempotentReplay:true});expect(m.recover).toHaveBeenCalledWith(7);expect(m.runner).not.toHaveBeenCalled();
});
it('changed effective entries cannot reuse the original token',async()=>{expect(await generateOfficialDocument('F08_QA',1,{...options,language:'en'})).toMatchObject({success:false,blocked:'reconciliation_required'});expect(m.recover).not.toHaveBeenCalled();expect(m.runner).not.toHaveBeenCalled();});
it('unknown original lookup is not treated as absence/new admission',async()=>{m.read.mockResolvedValue({error:{code:'timeout'},data:null});expect(await generateOfficialDocument('F08_QA',1,options)).toMatchObject({success:false,blocked:'reconciliation_required'});expect(m.recover).not.toHaveBeenCalled();expect(m.runner).not.toHaveBeenCalled();});
it('current scope denial precedes even the original metadata lookup',async()=>{m.scope=false;expect(await generateOfficialDocument('F08_QA',1,options)).toMatchObject({success:false,blocked:'permission_denied'});expect(m.read).not.toHaveBeenCalled();expect(m.recover).not.toHaveBeenCalled();});
it('unconfirmed durable completion stays recoverable with its original ID',async()=>{m.recover.mockResolvedValue({kind:'reconciliation_required',issuanceId:7,error:'Original checkpoint retained'});expect(await generateOfficialDocument('F08_QA',1,options)).toMatchObject({success:false,blocked:'reconciliation_required',issuanceId:7});expect(m.runner).not.toHaveBeenCalled();});
