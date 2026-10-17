// @vitest-environment jsdom
// In-process React/ports, not browser or physical-device acceptance.
import {StrictMode} from 'react';import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor,act} from '@testing-library/react';
const s=vi.hoisted(()=>({read:vi.fn(),attach:vi.fn(),cancel:vi.fn(),cancelled:vi.fn(),block:vi.fn(),complete:vi.fn(),owner:{identity:{authUserId:'a',scopeVersion:'one'},generation:1,isLive:()=>true,admits:()=>true}}));
vi.mock('@/server/actions/dms/document-upload-attach',()=>({readOriginalAttachmentRequests:s.read,attachUploadToExistingDocument:s.attach,cancelOriginalAttachmentRequest:s.cancel}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>s.owner}));
import {DmsAttachmentRecovery} from '@/features/dms/upload/dms-attachment-recovery';
const operation='a7000000-0000-4000-8000-000000000001';
const row={unavailable:false as const,uploadSessionId:7,documentId:8,operationId:operation,changeNotes:'Original notes',versionLabel:'Original label',originalFilename:'Synthetic.pdf',completed:false};
const data={rows:[row],totalCount:1,pendingCount:1,page:1,pageSize:25};
const empty={rows:[],totalCount:0,pendingCount:0,page:1,pageSize:25};
const props={open:true,uploadSessionId:7,onBlockingChange:s.block,onRecovered:s.complete};
beforeEach(()=>{vi.resetAllMocks();s.owner={identity:{authUserId:'a',scopeVersion:'one'},generation:1,isLive:()=>true,admits:()=>true};s.read.mockResolvedValue({success:true,data});s.attach.mockResolvedValue({success:true,data:{documentId:8,uploadSessionId:7,operationId:operation,versionId:9,fileId:10,replayed:true}});});afterEach(cleanup);
it('reopen shows the exact original wording and blocks replacement submission',async()=>{render(<DmsAttachmentRecovery {...props}/>);await screen.findByRole('button',{name:'Retry original attachment'});expect(screen.getByText(/Original label · Original notes/)).toBeTruthy();expect(s.block).toHaveBeenLastCalledWith(true);expect(s.attach).not.toHaveBeenCalled();});
it('explicit original retry uses its unchanged destination, notes and label',async()=>{render(<DmsAttachmentRecovery {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'Retry original attachment'}));await waitFor(()=>expect(s.complete).toHaveBeenCalledWith(8));expect(s.attach).toHaveBeenCalledWith({uploadSessionId:7,documentId:8,changeNotes:'Original notes',versionLabel:'Original label',allowDuplicate:false});});
it('confirmed empty recovery unlocks new attachment only after a successful read',async()=>{s.read.mockResolvedValue({success:true,data:empty});render(<DmsAttachmentRecovery {...props}/>);await screen.findByText(/No original attachment request/);expect(s.block.mock.calls[0][0]).toBe(true);expect(s.block).toHaveBeenLastCalledWith(false);});
it('a read error never becomes a successful empty ledger',async()=>{s.read.mockResolvedValue({success:false,error:'Scoped read denied'});render(<DmsAttachmentRecovery {...props}/>);expect((await screen.findByRole('alert')).textContent).toContain('Scoped read denied');expect(s.block).not.toHaveBeenCalledWith(false);expect(screen.queryByText(/No original attachment request/)).toBeNull();});
it('an inaccessible pending footprint exposes no target or wording and remains blocking',async()=>{s.read.mockResolvedValue({success:true,data:{...data,rows:[{unavailable:true,uploadSessionId:7,operationId:operation,completed:false}]}});render(<DmsAttachmentRecovery {...props}/>);await screen.findByRole('alert');expect(screen.queryByText(/Original label/)).toBeNull();expect(screen.queryByRole('button',{name:'Retry original attachment'})).toBeNull();expect(s.block).not.toHaveBeenCalledWith(false);});
it('completed original receipts have a separate explicit confirmation action',async()=>{s.read.mockResolvedValue({success:true,data:{...data,pendingCount:0,rows:[{...row,completed:true}]}});render(<DmsAttachmentRecovery {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'Confirm original result'}));await waitFor(()=>expect(s.complete).toHaveBeenCalledWith(8));});
it('wrong-selection data cannot unlock or populate the dialog',async()=>{s.read.mockResolvedValue({success:true,data:{...data,rows:[{...row,uploadSessionId:99}]}});render(<DmsAttachmentRecovery {...props}/>);await screen.findByRole('alert');expect(s.block).not.toHaveBeenCalledWith(false);expect(screen.queryByText(/Original label/)).toBeNull();});
it('a late result from a retired owner cannot affect the new account',async()=>{let finish!:(v:unknown)=>void;s.read.mockReturnValueOnce(new Promise(r=>finish=r)).mockResolvedValue({success:true,data:empty});const r=render(<DmsAttachmentRecovery {...props}/>);await waitFor(()=>expect(s.read).toHaveBeenCalledTimes(1));s.owner={...s.owner,identity:{authUserId:'b',scopeVersion:'two'},generation:2};r.rerender(<DmsAttachmentRecovery {...props}/>);await screen.findByText(/No original attachment request/);await act(async()=>finish({success:true,data}));expect(screen.queryByText(/Original label/)).toBeNull();expect(s.block).toHaveBeenLastCalledWith(false);});
it('Strict Mode skips the retired queued activation instead of starting a second request',async()=>{s.read.mockResolvedValue({success:true,data:empty});render(<StrictMode><DmsAttachmentRecovery {...props}/></StrictMode>);await screen.findByText(/No original attachment request/);expect(s.read).toHaveBeenCalledTimes(1);expect(screen.queryByText(/Original label/)).toBeNull();expect(s.block).toHaveBeenLastCalledWith(false);});
it('an unconfirmed retry keeps the original request visible and does not complete',async()=>{s.attach.mockResolvedValue({success:false,error:'Unconfirmed original'});render(<DmsAttachmentRecovery {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'Retry original attachment'}));expect((await screen.findByRole('alert')).textContent).toContain('Unconfirmed original');expect(s.complete).not.toHaveBeenCalled();expect(s.block).not.toHaveBeenCalledWith(false);});
it('cancellation requires an explicit second confirmation and retains the original identity',async()=>{
 s.cancel.mockResolvedValue({success:true,data:{cancelled:true,uploadSessionId:7,operationId:operation}});
 render(<DmsAttachmentRecovery {...props} onCancelled={s.cancelled}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Cancel uncommitted request'}));expect(s.cancel).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Confirm cancel uncommitted upload'}));
 await waitFor(()=>expect(s.cancelled).toHaveBeenCalledWith(7));expect(s.cancel).toHaveBeenCalledExactlyOnceWith({uploadSessionId:7,documentId:8,operationId:operation});expect(s.attach).not.toHaveBeenCalled();
});
it('unconfirmed cancellation stays visible and cannot silently become an empty successful read',async()=>{
 s.cancel.mockResolvedValue({success:false,error:'Cancellation remains uncertain'});render(<DmsAttachmentRecovery {...props} onCancelled={s.cancelled}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Cancel uncommitted request'}));fireEvent.click(screen.getByRole('button',{name:'Confirm cancel uncommitted upload'}));
 expect((await screen.findByRole('alert')).textContent).toContain('Cancellation remains uncertain');expect(s.read).toHaveBeenCalledTimes(1);expect(s.cancelled).not.toHaveBeenCalled();expect(s.block).not.toHaveBeenCalledWith(false);
});
it('cancelled originals are retained as closed history without retry or cancellation actions',async()=>{
 s.read.mockResolvedValue({success:true,data:{...data,pendingCount:0,rows:[{...row,closed:true}]}});render(<DmsAttachmentRecovery {...props}/>);
 await screen.findByText(/uncommitted upload cancelled; bytes retained/);expect(screen.queryByRole('button',{name:'Retry original attachment'})).toBeNull();expect(screen.queryByRole('button',{name:'Cancel uncommitted request'})).toBeNull();expect(s.block).toHaveBeenLastCalledWith(true);
});
it('late cancellation from a retired account cannot notify the new owner',async()=>{
 let finish!:(v:unknown)=>void;s.cancel.mockReturnValueOnce(new Promise(r=>finish=r));const r=render(<DmsAttachmentRecovery {...props} onCancelled={s.cancelled}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Cancel uncommitted request'}));fireEvent.click(screen.getByRole('button',{name:'Confirm cancel uncommitted upload'}));
 s.read.mockResolvedValue({success:true,data:empty});s.owner={...s.owner,identity:{authUserId:'b',scopeVersion:'two'},generation:2};r.rerender(<DmsAttachmentRecovery {...props} onCancelled={s.cancelled}/>);
 await screen.findByText(/No original attachment request/);await act(async()=>finish({success:true,data:{cancelled:true,uploadSessionId:7,operationId:operation}}));expect(s.cancelled).not.toHaveBeenCalled();expect(s.block).toHaveBeenLastCalledWith(false);
});
