// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const ctx=vi.hoisted(()=>({attach:vi.fn(),create:vi.fn(),link:vi.fn(),push:vi.fn(),warning:vi.fn(),dirty:false}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:ctx.push,refresh:vi.fn()})}));
vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn(),warning:ctx.warning}}));
vi.mock('@/server/actions/dms/document-upload-attach',()=>({attachUploadToExistingDocument:ctx.attach,createDocumentFromUpload:ctx.create}));
vi.mock('@/server/actions/dms/entity-documents',()=>({linkDmsDocumentToEntity:ctx.link}));
vi.mock('@/components/erp/erp-child-dialog-form',()=>({ERPChildDialogForm:({children,onSubmit,isDirty}:any)=>{ctx.dirty=isDirty;return <div>{children}<button onClick={onSubmit}>Test save</button></div>;}}));
vi.mock('@/components/erp/combobox/erp-combobox',()=>({ERPCombobox:({value,onValueChange,options}:any)=><select aria-label="Choice" value={value??''} onChange={e=>onValueChange(e.target.value?Number(e.target.value):null)}><option value=""/>{options.map((o:any)=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}));
import { DmsUploadAttachDialog } from '@/features/dms/upload/dms-upload-attach-dialog';
import { DmsCreateDocumentFromUploadDialog } from '@/features/dms/upload/dms-create-document-from-upload-dialog';
const session:any={id:100,original_filename:'synthetic.txt',mime_type:'text/plain',file_size_bytes:10,is_duplicate:false};
const attach=(id=100,open=true)=><DmsUploadAttachDialog open={open} onOpenChange={()=>{}} session={{...session,id}} documents={[{id:1,document_no:'SYN',title:'Synthetic'} as any]}/>;
beforeEach(()=>{vi.clearAllMocks();ctx.attach.mockResolvedValue({success:false,error:'rejected'});ctx.create.mockResolvedValue({success:true,data:{documentId:42,documentNo:'SYN-42'}});ctx.link.mockResolvedValue({success:false});});
afterEach(cleanup);
it('controlled document choice is dirty and a revert becomes clean',()=>{const ui=render(attach());fireEvent.change(ui.getByLabelText('Choice'),{target:{value:'1'}});expect(ctx.dirty).toBe(true);fireEvent.change(ui.getByLabelText('Choice'),{target:{value:''}});expect(ctx.dirty).toBe(false);});
it('changing upload identity or closing and reopening never inherits another dialog choice',()=>{const ui=render(attach());fireEvent.change(ui.getByLabelText('Choice'),{target:{value:'1'}});ui.rerender(attach(101));expect((ui.getByLabelText('Choice') as HTMLSelectElement).value).toBe('');ui.rerender(attach(101,false));ui.rerender(attach(101));expect(ctx.dirty).toBe(false);});
it('rejected attach retains the chosen document and notes for correction',async()=>{const ui=render(attach());fireEvent.change(ui.getByLabelText('Choice'),{target:{value:'1'}});fireEvent.change(ui.getByLabelText(/Change Notes/),{target:{value:'Synthetic note'}});fireEvent.click(ui.getByText('Test save'));await waitFor(()=>expect(ctx.attach).toHaveBeenCalledTimes(1));expect((ui.getByLabelText(/Change Notes/) as HTMLTextAreaElement).value).toBe('Synthetic note');});
it.each([false,true])('a committed document with a failed link is not offered as an unsaved create (throw=%s)',async throws=>{
 if(throws)ctx.link.mockRejectedValueOnce(new Error('offline'));
 const ui=render(<DmsCreateDocumentFromUploadDialog open onOpenChange={()=>{}} session={session} documentTypes={[{id:1,type_code:'SYN',name_en:'Synthetic'}]} entityContext={{entityType:'employee',entityId:1}}/>);
 fireEvent.change(ui.getByLabelText(/Document Title/),{target:{value:'Synthetic'}});fireEvent.change(ui.getByLabelText('Choice'),{target:{value:'1'}});fireEvent.click(ui.getByText('Test save'));
 await waitFor(()=>expect(ctx.push).toHaveBeenCalledWith('/dms/documents/record/42'));expect(ctx.create).toHaveBeenCalledTimes(1);expect(ctx.warning).toHaveBeenCalledWith(expect.stringContaining('do not create it again'));
});
