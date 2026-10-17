// @vitest-environment jsdom
// In-process Inbox orchestration. Not a browser/device acceptance journey.
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
const m=vi.hoisted(()=>({store:null as ReturnType<typeof createWorkspaceDraftStore>|null,readOwner:null as unknown,live:true,
 single:vi.fn(),complete:vi.fn(),ack:vi.fn(),upload:vi.fn(),success:vi.fn()}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:'synthetic-inbox'})}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>m.readOwner}));
vi.mock('@/hooks/use-dms-batch-admission',()=>({useDmsBatchAdmission:()=>({busy:false})}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),refresh:vi.fn()})}));
vi.mock('sonner',()=>({toast:{success:m.success,error:vi.fn(),info:vi.fn()}}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({storage:{from:()=>({uploadToSignedUrl:m.upload})}})}));
vi.mock('@/server/actions/dms/ai-intake',()=>({startAiIntakeFromUploadSession:vi.fn()}));
vi.mock('@/server/actions/dms/upload-sessions',()=>({createDmsUploadSession:m.single,completeDmsTempUpload:m.complete,acknowledgeDmsSingleUpload:m.ack,cancelDmsUploadSession:vi.fn()}));
vi.mock('@/features/dms/documents/section-read-boundary',()=>({DmsReadReady:({children}:any)=>children}));
vi.mock('@/features/dms/admin/dms-admin-file-storage-panel',()=>({DmsAdminFileStoragePanel:()=>null}));
vi.mock('@/features/dms/upload/dms-create-document-from-upload-dialog',()=>({DmsCreateDocumentFromUploadDialog:()=>null}));
vi.mock('@/features/dms/upload/dms-duplicate-warning-panel',()=>({DmsDuplicateWarningPanel:()=>null}));
vi.mock('@/features/dms/upload/dms-upload-attach-dialog',()=>({DmsUploadAttachDialog:()=>null}));
vi.mock('@/features/dms/upload/dms-upload-cleanup-panel',()=>({DmsUploadCleanupPanel:()=>null}));
vi.mock('@/features/dms/upload/dms-upload-session-table',()=>({DmsUploadSessionTable:()=>null}));
vi.mock('@/features/dms/upload/dms-upload-dropzone',()=>({DmsUploadDropzone:({onFileSelected,disabled}:any)=><input aria-label="Synthetic upload" disabled={disabled} type="file" onChange={e=>{const file=e.target.files![0];void onFileSelected({file,original_filename:file.name,mime_type:'application/pdf',file_size_bytes:file.size,sha256_hash:'a'.repeat(64)});}}/>}));
import {DmsUploadInboxPageClient} from '@/features/dms/upload/dms-upload-inbox-page-client';
const authUserId='a7000000-0000-4000-8000-000000000001',path='sessions/SYNTHETIC/synthetic.pdf';
const session={id:7010,session_code:'SYNTHETIC',mime_type:'application/pdf',file_size_bytes:1,status:'uploaded'};
const admission={success:true,data:{session,path,token:'synthetic-token',signedUrl:'http://127.0.0.1/synthetic',isDuplicate:false,uploadRequired:true}};
beforeEach(()=>{vi.resetAllMocks();m.live=true;m.store=createWorkspaceDraftStore();m.readOwner={identity:{authUserId,scopeVersion:'synthetic'},isLive:()=>m.live,admits:()=>m.live};m.single.mockResolvedValue(admission);m.upload.mockResolvedValue({error:null});m.complete.mockResolvedValue({success:true,data:session});m.ack.mockResolvedValue({success:true});});
afterEach(cleanup);
const mount=()=>render(<QueryClientProvider client={new QueryClient()}><DmsUploadInboxPageClient initialSessions={[]} documents={[]} documentTypes={[]}/></QueryClientProvider>);
const select=(name='synthetic.pdf')=>fireEvent.change(screen.getByLabelText('Synthetic upload'),{target:{files:[new File(['x'],name,{type:''})]}});
it('single generic-MIME files use a canonical body and acknowledge only after byte verification',async()=>{mount();select();await waitFor(()=>expect(m.success).toHaveBeenCalled());expect(m.upload.mock.calls[0][2]).toMatchObject({type:'application/pdf',size:1});expect(m.complete.mock.invocationCallOrder[0]).toBeLessThan(m.ack.mock.invocationCallOrder[0]);expect(m.ack.mock.invocationCallOrder[0]).toBeLessThan(m.success.mock.invocationCallOrder[0]);expect(m.store!.getDraft('draft:tab:synthetic-inbox:f07-single-upload:null')).toBeUndefined();});
it('a lost admission reply retains the original operation for exact reselection',async()=>{m.single.mockRejectedValueOnce(Error('lost')).mockResolvedValue(admission);mount();select();await waitFor(()=>expect(screen.getByText(/outcome is unconfirmed/)).toBeTruthy());const original=m.single.mock.calls[0][1];select();await waitFor(()=>expect(m.success).toHaveBeenCalled());expect(m.single.mock.calls[1][1]).toEqual(original);expect(m.upload).toHaveBeenCalledTimes(1);});
it('server-discovered reload recovery is retained before replaying its original operation',async()=>{const recovery={version:1,operationId:'d7000000-0000-4000-8000-000000000001',authUserId,metadata:{original_filename:'synthetic.pdf',mime_type:'application/pdf',file_size_bytes:1,sha256_hash:'a'.repeat(64)},context:null};m.single.mockResolvedValueOnce({success:false,uncertain:true,recovery}).mockResolvedValue({...admission,data:{...admission.data,uploadRequired:false}});mount();select();await waitFor(()=>expect(m.success).toHaveBeenCalled());expect(m.single.mock.calls[1][1]).toEqual({operationId:recovery.operationId,authUserId});expect(m.upload).not.toHaveBeenCalled();expect(m.ack.mock.calls[0][0]).toEqual(recovery);});
it('late replies after owner retirement cannot upload, acknowledge or report success',async()=>{let finish!:(v:unknown)=>void;m.single.mockImplementation(()=>new Promise(r=>{finish=r;}));mount();select();await waitFor(()=>expect(m.single).toHaveBeenCalled());m.live=false;await act(async()=>finish(admission));expect(m.upload).not.toHaveBeenCalled();expect(m.ack).not.toHaveBeenCalled();expect(m.success).not.toHaveBeenCalled();});
it('lost acknowledgment does not clear retention or require another upload',async()=>{m.ack.mockResolvedValueOnce({success:false,uncertain:true,error:'Synthetic acknowledgment pending'}).mockResolvedValue({success:true});mount();select();await waitFor(()=>expect(screen.getByText(/acknowledgment pending/)).toBeTruthy());const original=m.single.mock.calls[0][1];m.single.mockResolvedValue({...admission,data:{...admission.data,uploadRequired:false}});select();await waitFor(()=>expect(m.success).toHaveBeenCalled());expect(m.single.mock.calls[1][1]).toEqual(original);expect(m.upload).toHaveBeenCalledTimes(1);});
it('only an exact server-confirmed cancellation releases the old retained request',async()=>{m.single.mockImplementationOnce(async(_input,contract)=>({success:false,cancelled:{operationId:contract.operationId,sessionId:7010,retained:true},error:'Original cancelled'})).mockResolvedValue(admission);mount();select();await waitFor(()=>expect(screen.getByText(/Original cancelled/)).toBeTruthy());const original=m.single.mock.calls[0][1].operationId;select('new.pdf');await waitFor(()=>expect(m.success).toHaveBeenCalled());expect(m.single.mock.calls[1][1].operationId).not.toBe(original);});
