// @vitest-environment jsdom
// In-process component test only: no browser or device is controlled.
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {webcrypto} from 'node:crypto';
import {DmsUploadDropzone} from '@/features/dms/upload/dms-upload-dropzone';
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
