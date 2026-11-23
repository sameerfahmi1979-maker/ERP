// @vitest-environment jsdom
// In-process component test only: no browser or device is controlled.
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {webcrypto} from 'node:crypto';
import {DmsUploadDropzone} from '@/features/dms/upload/dms-upload-dropzone';

vi.mock('@/server/actions/dms/document-preparation',()=>({
 checkDmsDuplicateBeforeUpload:vi.fn(async()=>({success:true,data:{status:'no_visible_match'}})),
}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it.each(['Clear all','Remove kept.pdf'])('clears stale selection errors after %s',async label=>{
 vi.stubGlobal('crypto',webcrypto);
 const file=new File(['synthetic'],'kept.pdf',{type:'application/pdf'});
 const selected={file,original_filename:file.name,mime_type:file.type,file_size_bytes:file.size,sha256_hash:'a'.repeat(64)};
 render(<DmsUploadDropzone multiple files={[selected]} onFilesSelected={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Choose document files'),{target:{files:[new File(['bad'],'bad.exe',{type:'application/x-msdownload'})]}});
 await waitFor(()=>expect(screen.getByRole('alert')).toBeTruthy());
 fireEvent.click(screen.getByRole('button',{name:label}));
 expect(screen.queryByRole('alert')).toBeNull();
});

it.each([false,true])('labels and routes single or staged selection for batch=%s',async multiple=>{
 vi.stubGlobal('crypto',webcrypto);
 const file=new File(['synthetic'],'selected.pdf',{type:'application/pdf'});
 Object.defineProperty(file,'arrayBuffer',{value:async()=>Uint8Array.from([1,2,3]).buffer});
 const upload=vi.fn(),stage=vi.fn();
 render(<DmsUploadDropzone multiple={multiple} onFileSelected={upload} onFilesSelected={stage}/>);
 expect(screen.getByText(multiple?'Files stay selected until you start the batch upload.':/Upload starts after validation/)).toBeTruthy();
 expect(upload).not.toHaveBeenCalled();
 expect(stage).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText(multiple?'Choose document files':'Choose document file'),{target:{files:[file]}});
 await waitFor(()=>expect(multiple?stage:upload).toHaveBeenCalledOnce());
 expect(multiple?upload:stage).not.toHaveBeenCalled();
});
