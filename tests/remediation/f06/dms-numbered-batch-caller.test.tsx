// @vitest-environment jsdom
// Real inbox, hooks and store; public actions, Storage and navigation are offline ports.
import {act,cleanup,fireEvent,render as renderUI,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {ReactElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createHash,webcrypto} from 'node:crypto';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {BatchRequest,BatchReceipt} from '@/lib/dms/batch-admission';
import type {BatchDraftInput,BatchDraftSnapshot} from '@/lib/dms/numbered-batch-draft';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
const m=vi.hoisted(()=>({store:null as unknown,owner:'owner',readOwner:null as unknown,batch:vi.fn(),draft:vi.fn(),prepare:vi.fn(),read:vi.fn(),member:vi.fn(),verify:vi.fn(),bootstrap:vi.fn(),discover:vi.fn(),whole:vi.fn(),upload:vi.fn(),push:vi.fn(),refresh:vi.fn(),success:vi.fn(),error:vi.fn()}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:m.owner})}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>m.readOwner}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:m.push,refresh:m.refresh})}));
vi.mock('sonner',()=>({toast:{success:m.success,error:m.error,info:vi.fn()}}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({storage:{from:()=>({uploadToSignedUrl:m.upload})}})}));
vi.mock('@/server/actions/dms/batch-intake',()=>({createDmsUploadBatch:m.batch,startAiIntakeAndCreateDraft:m.draft,prepareDmsUploadBatchMemberDraft:m.prepare,readDmsUploadBatchDraftRecovery:m.read,recoverDmsBatchMemberUpload:m.member,verifyDmsBatchUpload:m.verify,bootstrapDmsBatchOrigin:m.bootstrap,discoverDmsBatchAdmissions:m.discover,recoverDmsUploadBatch:m.whole}));
vi.mock('@/server/actions/dms/ai-intake',()=>({startAiIntakeFromUploadSession:vi.fn(()=>{throw Error('No single-file provider calls');})}));
vi.mock('@/server/actions/dms/upload-sessions',()=>({cancelDmsUploadSession:vi.fn(),createDmsUploadSession:vi.fn()}));
vi.mock('@/features/dms/admin/dms-admin-file-storage-panel',()=>({DmsAdminFileStoragePanel:()=>null}));
vi.mock('@/features/dms/upload/dms-batch-upload-progress',()=>({DmsBatchUploadProgress:()=>null}));
vi.mock('@/features/dms/upload/dms-create-document-from-upload-dialog',()=>({DmsCreateDocumentFromUploadDialog:()=>null}));
vi.mock('@/features/dms/upload/dms-duplicate-warning-panel',()=>({DmsDuplicateWarningPanel:()=>null}));
vi.mock('@/features/dms/upload/dms-upload-attach-dialog',()=>({DmsUploadAttachDialog:()=>null}));
vi.mock('@/features/dms/upload/dms-upload-cleanup-panel',()=>({DmsUploadCleanupPanel:()=>null}));
vi.mock('@/features/dms/upload/dms-upload-session-table',()=>({DmsUploadSessionTable:()=>null}));
vi.mock('@/features/dms/upload/dms-upload-dropzone',()=>({DmsUploadDropzone:({onFilesSelected}:{onFilesSelected?:(v:unknown[])=>void})=><button onClick={()=>onFilesSelected?.([{original_filename:'Synthetic.pdf',mime_type:'application/pdf',file_size_bytes:1,sha256_hash:'2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881',file:new File(['x'],'Synthetic.pdf',{type:'application/pdf'})}])}>Select batch</button>}));
import {DmsUploadInboxPageClient} from '@/features/dms/upload/dms-upload-inbox-page-client';
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis,'crypto');
let queryClient:QueryClient;
beforeEach(()=>{queryClient=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});});
const render=(node:ReactElement)=>renderUI(node,{wrapper:({children})=><QueryClientProvider client={queryClient}>{children}</QueryClientProvider>});
const auth='11111111-1111-4111-8111-111111111111',operation='22222222-2222-4222-8222-222222222222';
const code='A'.repeat(32),batchCode='B'+'B'.repeat(32);
const snapshot:BatchDraftSnapshot={upload_session_id:17,session_code:code,batch_id:18,analysis_result_id:19,owning_company_id:20,owning_branch_id:21,party_id:null,document_type_id:22,category_id:23,title:'Original',description:null,confidentiality_level:'internal',issue_date:null,expiry_date:null,confidence:'high',source_fingerprint:'a'.repeat(64)};
let receipt:BatchReceipt;
let sealed=false;
function receiptFor(r:BatchRequest):BatchReceipt{return {version:1,operation_id:r.contract.operationId,auth_user_id:auth,profile_id:7,fingerprint:createHash('sha256').update(JSON.stringify(['dms-batch-admission/v1',null,r.manifest.files.map(f=>[f.position,f.original_filename,f.mime_type,f.file_size_bytes,f.sha256_hash])])).digest('hex'),manifest:r.manifest,batch_id:18,batch_code:batchCode,company_id:20,branch_id:21,members:[{position:0,id:17,code,bucket:'dms-temp',path:'sessions/'+code+'/Synthetic.pdf',name:'Synthetic.pdf',mime:'application/pdf',size:1,sha256:r.manifest.files[0].sha256_hash}]};}
function member(prepared:boolean){return {position:0,upload_session_id:17,session_code:code,draft_operation_id:operation,kind:prepared?'prepared':'unprepared',request:{uploadSessionId:17,allowDuplicate:false,...(prepared?{prepared:snapshot}:{})}};}
function anchors(){return {version:1,admission_operation_id:receipt.operation_id,admission_fingerprint:receipt.fingerprint,auth_user_id:auth,profile_id:7,batch_id:18,owning_company_id:20,owning_branch_id:21};}
function prepared(){return {success:true,receipt,preparation:{...anchors(),member:member(true)}};}
const ui=()=> <DmsUploadInboxPageClient initialSessions={[]} documents={[]} documentTypes={[]} batchEnabled/>;
const start=async()=>{fireEvent.click(screen.getByRole('button',{name:'Multiple Files (Batch)'}));fireEvent.click(screen.getByRole('button',{name:'Select batch'}));await waitFor(()=>expect((screen.getByRole('button',{name:'Upload & AI Fill All (1)'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Upload & AI Fill All (1)'}));};
beforeEach(()=>{vi.resetAllMocks();Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});m.store=createWorkspaceDraftStore();m.owner='owner';sealed=false;m.readOwner={identity:{authUserId:auth,scopeVersion:'scope'},generation:0,isLive:()=>true,admits:()=>true};m.bootstrap.mockResolvedValue({success:true,origin:{authUserId:auth,profileId:7}});m.batch.mockImplementation(async(r:BatchRequest)=>{if(!r.manifest)return {state:'rejected',error:'Invalid batch request'};receipt=receiptFor(r);return {state:'admitted',receipt,capabilityState:'unavailable',capabilities:[],presentPositions:[],issuance_may_be_partial:false};});m.read.mockImplementation(async()=>({success:true,receipt,recovery:{...anchors(),members:[member(sealed)]}}));m.member.mockImplementation(async()=>({state:'ready',receipt,position:0,object:{state:'upload',capability:{position:0,sessionId:17,path:receipt.members[0].path,token:'synthetic-test-value',signedUrl:'https://example.invalid/upload'}},issuance_may_be_partial:true}));m.verify.mockResolvedValue({state:'present'});m.prepare.mockImplementation(async()=>{sealed=true;return prepared();});m.upload.mockResolvedValue({error:null});m.draft.mockImplementation(async(_i:BatchDraftInput,c:WorkspaceSaveContract)=>({success:true,data:{documentId:42,documentNo:'DMS-42',status:'pending_ai_review',confidence:'high',operation_id:c.operationId,upload_session_id:17,replayed:false}}));m.discover.mockResolvedValue({success:true,receipts:[]});});
afterEach(()=>{cleanup();queryClient.clear();if(originalCrypto)Object.defineProperty(globalThis,'crypto',originalCrypto);else Reflect.deleteProperty(globalThis,'crypto');});
it('actual batch dispatch retains both phases and navigates only after confirmed receipt',async()=>{render(ui());await start();await waitFor(()=>expect(m.push).toHaveBeenCalledWith('/dms/inbox/batch/'+batchCode));expect(m.prepare).toHaveBeenCalledOnce();expect(m.draft).toHaveBeenCalledOnce();expect(m.prepare.mock.invocationCallOrder[0]).toBeLessThan(m.draft.mock.invocationCallOrder[0]);expect(m.prepare.mock.calls[0][0]).toEqual({request:m.batch.mock.calls[0][0],position:0});expect(m.draft.mock.calls[0]).toEqual([{uploadSessionId:17,allowDuplicate:false,prepared:snapshot},{operationId:operation,revision:null}]);expect(m.upload).toHaveBeenCalledOnce();expect(m.whole).not.toHaveBeenCalled();});
it('lost commit response exposes exact retry after remount without another batch/upload',async()=>{m.draft.mockRejectedValueOnce(Error('lost'));const h=render(ui());await start();await waitFor(()=>expect(m.draft).toHaveBeenCalledOnce());await waitFor(()=>expect(m.error).toHaveBeenCalled());const original=structuredClone(m.draft.mock.calls[0]);expect(m.push).not.toHaveBeenCalled();h.unmount();render(ui());fireEvent.click(screen.getByRole('button',{name:'Multiple Files (Batch)'}));await waitFor(()=>expect((screen.getByRole('button',{name:'Retry draft #17'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Retry draft #17'}));await waitFor(()=>expect(m.success).toHaveBeenCalled());expect(m.draft.mock.calls[1]).toEqual(original);expect(m.prepare).toHaveBeenCalledOnce();expect(m.batch).toHaveBeenCalledOnce();expect(m.upload).toHaveBeenCalledOnce();});
it('owner change after prepare starts stops commit and navigation',async()=>{let finish!:(v:unknown)=>void;m.prepare.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const h=render(ui());await start();await waitFor(()=>expect(m.prepare).toHaveBeenCalledOnce());m.owner='other';h.rerender(ui());await act(async()=>finish(prepared()));expect(m.prepare).toHaveBeenCalledOnce();expect(m.draft).not.toHaveBeenCalled();expect(m.push).not.toHaveBeenCalled();expect(m.success).not.toHaveBeenCalled();});
