// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {DmsUploadDropzone} from '@/features/dms/upload/dms-upload-dropzone';
const check=vi.hoisted(()=>vi.fn());
vi.mock('@/server/actions/dms/document-preparation',()=>({checkDmsDuplicateBeforeUpload:check}));
beforeEach(()=>{
 vi.resetAllMocks();
 vi.stubGlobal('crypto',{subtle:{digest:vi.fn().mockResolvedValue(new Uint8Array(32).fill(1).buffer)}});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function select(multiple=false){
 const file=new File(['synthetic'],'Synthetic.pdf',{type:'application/pdf'});
 Object.defineProperty(file,'arrayBuffer',{value:async()=>new Uint8Array([1,2,3]).buffer});
 fireEvent.change(screen.getByLabelText(multiple?'Choose document files':'Choose document file'),{target:{files:[file]}});
}
it('opens the exact active intake rather than sending the user back to an unfiltered Inbox',async()=>{
 check.mockResolvedValue({success:true,data:{status:'retained_upload',authoritative:false,sessionCode:'SYNTHETIC / INTAKE'}});
 const selected=vi.fn();render(<DmsUploadDropzone onFileSelected={selected}/>);select();
 const link=await screen.findByRole('link',{name:'Open existing intake'});
 expect(link.getAttribute('href')).toBe('/dms/intake/SYNTHETIC%20%2F%20INTAKE');
 expect(screen.getByRole('status').textContent).toContain('This file has already been uploaded');
 expect(selected).not.toHaveBeenCalled();
 expect(screen.queryByRole('button',{name:'Continue to reviewed upload'})).toBeNull();
});
it('shows the existing document reference in plain language without automatically uploading again',async()=>{
 check.mockResolvedValue({success:true,data:{status:'existing_document',authoritative:false,documentId:12,documentNo:'DMS-SYN-12',title:'Synthetic certificate'}});
 const selected=vi.fn();render(<DmsUploadDropzone onFileSelected={selected}/>);select();
 const link=await screen.findByRole('link',{name:'DMS-SYN-12 — Synthetic certificate'});
 expect(link.getAttribute('href')).toBe('/dms/documents/record/12');
 expect(screen.getByRole('status').textContent).toContain('This file already exists in the system');
 expect(selected).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Continue to reviewed upload'}));
 expect(selected).toHaveBeenCalledTimes(1);
});
it('lets a file with no active match proceed, including a cancelled intake excluded by the database',async()=>{
 check.mockResolvedValue({success:true,data:{status:'no_visible_match',authoritative:false}});
 const selected=vi.fn();render(<DmsUploadDropzone onFileSelected={selected}/>);select();
 await waitFor(()=>expect(selected).toHaveBeenCalledTimes(1));
 expect(screen.queryByRole('status')).toBeNull();
});
it('gives the same direct recovery link for a batch selection',async()=>{
 check.mockResolvedValue({success:true,data:{status:'retained_upload',authoritative:false,sessionCode:'SYN-2'}});
 const selected=vi.fn();render(<DmsUploadDropzone multiple onFilesSelected={selected}/>);select(true);
 expect((await screen.findByRole('link',{name:'Open existing intake'})).getAttribute('href')).toBe('/dms/intake/SYN-2');
 expect(screen.getByRole('status').textContent).toContain('Some selected files already exist');
 expect(selected).not.toHaveBeenCalled();
});
it('removes previous-account duplicate links when ownership changes',async()=>{
 check.mockResolvedValue({success:true,data:{status:'retained_upload',authoritative:false,sessionCode:'SYN-PRIVATE'}});
 const view=render(<DmsUploadDropzone ownerGeneration="one"/>);select();
 await screen.findByRole('link',{name:'Open existing intake'});
 view.rerender(<DmsUploadDropzone ownerGeneration="two"/>);
 expect(screen.queryByRole('link',{name:'Open existing intake'})).toBeNull();
});
it('does not upload when duplicate checking fails',async()=>{
 check.mockResolvedValue({success:false,error:'Unavailable'});
 const selected=vi.fn();render(<DmsUploadDropzone onFileSelected={selected}/>);select();
 await screen.findByRole('alert');expect(selected).not.toHaveBeenCalled();
});
