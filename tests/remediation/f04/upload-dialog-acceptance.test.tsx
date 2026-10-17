// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const ctx=vi.hoisted(()=>({attach:vi.fn(),create:vi.fn(),link:vi.fn(),push:vi.fn(),warning:vi.fn(),dirty:false,store:undefined as ReturnType<typeof createWorkspaceDraftStore>|undefined}));
const review=vi.hoisted(()=>({prepare:vi.fn(),confirm:vi.fn(),read:vi.fn(),owner:{identity:{authUserId:'synthetic',scopeVersion:'one'},generation:1,isLive:()=>true,admits:()=>true}}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>review.owner}));
vi.mock('@/server/actions/dms/intake-review',()=>({prepareExactIntakeReview:review.prepare,confirmExactIntakeReview:review.confirm}));
vi.mock('@/lib/reads/client',()=>({retryAuthorizedRead:()=>false,readJson:async()=>({success:true,data:{rows:[{id:1,document_no:'SYN',title:'Synthetic'}],totalCount:1,page:1,pageSize:50}})}));
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>ctx.store}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:'upload-fixture-owner'})}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:ctx.push,refresh:vi.fn()})}));
vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn(),warning:ctx.warning}}));
vi.mock('@/server/actions/dms/document-upload-attach',()=>({attachUploadToExistingDocument:ctx.attach,createDocumentFromUpload:ctx.create,readOriginalAttachmentRequests:review.read}));
vi.mock('@/server/actions/dms/entity-documents',()=>({linkDmsDocumentToEntity:ctx.link}));
vi.mock('@/components/erp/erp-child-dialog-form',()=>({ERPChildDialogForm:({children,onSubmit,isDirty}:any)=>{ctx.dirty=isDirty;return <div>{children}<button onClick={onSubmit}>Test save</button></div>;}}));
vi.mock('@/components/erp/combobox/erp-combobox',()=>({ERPCombobox:({value,onValueChange,options}:any)=><select aria-label="Choice" value={value??''} onChange={e=>onValueChange(e.target.value?Number(e.target.value):null)}><option value=""/>{options.map((o:any)=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}));
import { DmsUploadAttachDialog } from '@/features/dms/upload/dms-upload-attach-dialog';
import { DmsCreateDocumentFromUploadDialog } from '@/features/dms/upload/dms-create-document-from-upload-dialog';
const session:any={id:100,original_filename:'synthetic.txt',mime_type:'text/plain',file_size_bytes:10,is_duplicate:false};
const attach=(id=100,open=true)=><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><DmsUploadAttachDialog open={open} onOpenChange={()=>{}} session={{...session,id}} documents={[{id:1,document_no:'SYN',title:'Synthetic'} as any]}/></QueryClientProvider>;
beforeEach(()=>{vi.clearAllMocks();review.read.mockResolvedValue({success:true,data:{rows:[],page:1,pageSize:25,totalCount:0,pendingCount:0}});review.prepare.mockImplementation(async({sessionId,documentId})=>({success:true,data:{actorId:1,sessionId,documentId,typeId:1,expiryDate:null,fingerprint:'a'.repeat(64),requiresOverride:false,canOverride:false,reason:null}}));review.confirm.mockResolvedValue({success:true});ctx.attach.mockResolvedValue({success:false,error:'rejected'});ctx.create.mockResolvedValue({success:true,data:{documentId:42,documentNo:'SYN-42'}});ctx.link.mockResolvedValue({success:false});});
afterEach(cleanup);
it('controlled document choice is dirty and a revert becomes clean',async()=>{const ui=render(attach());await ui.findByText('SYN — Synthetic');fireEvent.change(ui.getByLabelText('Choice'),{target:{value:'1'}});expect(ctx.dirty).toBe(true);fireEvent.change(ui.getByLabelText('Choice'),{target:{value:''}});expect(ctx.dirty).toBe(false);});
it('changing upload identity or closing and reopening never inherits another dialog choice',async()=>{const ui=render(attach());await ui.findByText('SYN — Synthetic');fireEvent.change(ui.getByLabelText('Choice'),{target:{value:'1'}});ui.rerender(attach(101));expect((ui.getByLabelText('Choice') as HTMLSelectElement).value).toBe('');ui.rerender(attach(101,false));ui.rerender(attach(101));expect(ctx.dirty).toBe(false);});
it('rejected attach retains the chosen document and notes after exact review and recovery check',async()=>{const ui=render(attach());await ui.findByText('SYN — Synthetic');await ui.findByText(/No original attachment request/);fireEvent.change(ui.getByLabelText('Choice'),{target:{value:'1'}});fireEvent.change(ui.getByLabelText(/Change Notes/),{target:{value:'Synthetic note'}});fireEvent.click(ui.getByRole('button',{name:'Verify original for review'}));fireEvent.click(await ui.findByRole('checkbox',{name:/I checked the original file/}));fireEvent.click(ui.getByText('Test save'));await waitFor(()=>expect(ctx.attach).toHaveBeenCalledTimes(1));expect(review.confirm).toHaveBeenCalledOnce();expect((ui.getByLabelText(/Change Notes/) as HTMLTextAreaElement).value).toBe('Synthetic note');});
it.each([false,true])('a committed document with a failed link is not offered as an unsaved create (throw=%s)',async throws=>{
 ctx.store=createWorkspaceDraftStore();
 // Preparation is read-only; only the second dispatch creates the document.
 ctx.create.mockImplementation(async(input,contract)=>input.prepared?{success:true,data:{documentId:42,documentNo:'SYN-42',upload_session_id:100,operation_id:contract.operationId,replayed:false,completed:true}}:{success:false,prepared:{operation_id:contract.operationId,snapshot:{source:{id:100,session_code:'SYN',uploaded_by:1,owning_company_id:1,owning_branch_id:null,temp_storage_path:'synthetic.txt',original_filename:'synthetic.txt',mime_type:'text/plain',file_size_bytes:10,sha256_hash:null},type:{id:1,category_id:1,type_code:'SYN',default_confidentiality:'internal',requires_expiry_tracking:false},storage_year:2026,content_sha256:'a'.repeat(64)}}});
 if(throws)ctx.link.mockRejectedValueOnce(new Error('offline'));
 const ui=render(<DmsCreateDocumentFromUploadDialog open onOpenChange={()=>{}} session={session} documentTypes={[{id:1,type_code:'SYN',name_en:'Synthetic'}]} entityContext={{entityType:'employee',entityId:1}}/>);
 fireEvent.change(ui.getByLabelText(/Document Title/),{target:{value:'Synthetic'}});fireEvent.change(ui.getByLabelText('Choice'),{target:{value:'1'}});fireEvent.click(ui.getByText('Test save'));
 await waitFor(()=>expect(ctx.push).toHaveBeenCalledWith('/dms/documents/record/42'));expect(ctx.create.mock.calls.filter(([input])=>input.prepared)).toHaveLength(1);expect(ctx.create.mock.calls.filter(([input])=>!input.prepared)).toHaveLength(1);expect(new Set(ctx.create.mock.calls.map(([,contract])=>contract.operationId)).size).toBe(1);expect(ctx.warning).toHaveBeenCalledWith(expect.stringContaining('do not create it again'));
});
