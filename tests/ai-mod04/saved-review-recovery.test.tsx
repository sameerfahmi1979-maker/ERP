// @vitest-environment jsdom
import {act,cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {api,setup,view,opened,candidate,hash,ready,submit} from './saved-intake-harness';
const held={stage:'held',admitted:false,workerHealthy:true,createdAt:'',startedAt:null,updatedAt:'',errorCode:'PT409',holdReason:null};
beforeEach(setup);afterEach(cleanup);
it('recovers a failed stale request with no candidate through explicit rerun and a fresh source identity',async()=>{
 api.status.mockResolvedValueOnce({success:true,data:{state:'queued',queueStatus:'failed',sourceCurrent:false,candidate:null,progress:held}});
 const fresh=structuredClone(opened);fresh.review.recovery.state='cancelled';fresh.review.source.snapshot='b'.repeat(64);
 api.open.mockResolvedValueOnce({success:true,data:opened}).mockResolvedValueOnce({success:true,data:fresh});
 api.start.mockResolvedValue({success:true,data:{jobId:10}});
 api.status.mockResolvedValueOnce({success:true,data:{state:'review_required',sourceCurrent:true,candidate:{...candidate,sourceSnapshot:'b'.repeat(64)}}});
 render(view());await screen.findByText(/This review is out of date/);
 expect(api.start).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Update & Save'})).toBeNull();
 fireEvent.click(screen.getByText('Re-run AI'));expect(api.cancel).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('Confirm rerun'));await ready();
 expect(api.cancel).toHaveBeenCalledExactlyOnceWith(59,9);
 expect(api.start).toHaveBeenCalledOnce();expect(api.start.mock.calls[0][0]).toMatchObject({documentId:59,snapshot:'b'.repeat(64),fileIds:[53],mode:'reread_files'});
 expect(api.start.mock.calls[0][0].requestId).not.toBe(opened.review.recovery.requestId);
 expect(screen.queryByText(/This review is out of date/)).toBeNull();await submit();
 await waitFor(()=>expect(api.save).toHaveBeenCalledOnce());expect(api.save.mock.calls[0][0]).toMatchObject({documentId:59,jobId:10,snapshot:'b'.repeat(64)});
});
it('refreshing a held stale job only reads status and never tries to resume it',async()=>{
 api.status.mockResolvedValue({success:true,data:{state:'queued',sourceCurrent:false,candidate:null,progress:held}});
 render(view());await screen.findByText('Re-run AI');fireEvent.click(screen.getByText('Refresh / recover processing'));
 await waitFor(()=>expect(api.status).toHaveBeenCalledTimes(2));expect(api.status.mock.calls[1]).toEqual([59,9,false]);expect(api.start).not.toHaveBeenCalled();
});
it('does not call a read failure a document change or allow a new analysis',async()=>{
 api.status.mockResolvedValue({success:false,error:'Review access unavailable'});render(view());await screen.findByText('Review access unavailable');
 expect(screen.queryByText(/This review is out of date/)).toBeNull();expect(screen.queryByText('Re-run AI')).toBeNull();expect(api.start).not.toHaveBeenCalled();
});
it('never starts another request when cancellation is rejected',async()=>{
 api.cancel.mockResolvedValue({success:false,uncertain:false,error:'Earlier provider work needs reconciliation'});
 render(view());await ready();fireEvent.click(screen.getByText('Re-run AI'));fireEvent.click(screen.getByText('Confirm rerun'));
 await screen.findByText('Earlier provider work needs reconciliation');expect(api.start).not.toHaveBeenCalled();expect(api.save).not.toHaveBeenCalled();
 expect(screen.queryByRole('alertdialog',{name:'Confirm rerun'})).toBeNull();
 expect(screen.queryByText('Re-run AI')).toBeNull();
 expect(api.warning).toHaveBeenCalledWith('AI was not restarted. The earlier request needs attention.');
});
it('shows failed instead of processing and preserves a rejected rerun while checking the same job',async()=>{
 api.status.mockResolvedValue({success:true,data:{state:'queued',queueStatus:'failed',sourceCurrent:true,candidate:null,progress:held}});
 api.cancel.mockResolvedValue({success:false,uncertain:false,error:'Earlier provider work needs reconciliation'});
 render(view());await screen.findByText('Failed');
 expect(screen.queryByTestId('saved-intake-processing-spinner')).toBeNull();
 fireEvent.click(screen.getByText('Re-run AI'));fireEvent.click(screen.getByText('Confirm rerun'));
 await screen.findByText('Earlier provider work needs reconciliation');
 fireEvent.click(screen.getByText('Refresh / recover processing'));
 await waitFor(()=>expect(api.status).toHaveBeenCalledTimes(2));
 await screen.findByText('Earlier provider work needs reconciliation');
 expect(api.status.mock.calls[1]).toEqual([59,9,false]);
 expect(screen.queryByText('Re-run AI')).toBeNull();expect(api.start).not.toHaveBeenCalled();
 expect(api.warning).toHaveBeenCalledWith('Saved status checked. Review the AI Pipeline message for the result.');
 // Only a confirmed cancellation unlocks the explicit rerun; refresh never starts one.
 api.status.mockResolvedValue({success:true,data:{state:'cancelled',sourceCurrent:true,candidate:null,progress:{...held,stage:'cancelled'}}});
 fireEvent.click(screen.getByText('Refresh / recover processing'));
 await screen.findByText('Re-run AI');expect(api.start).not.toHaveBeenCalled();
});
it('keeps a lost draft response recoverable but prevents another AI run',async()=>{
 api.save.mockResolvedValueOnce({success:false,uncertain:true,error:'Draft unconfirmed'}).mockResolvedValueOnce({success:true,data:{revision:1}});
 render(view());await ready();fireEvent.click(screen.getAllByText('Save Draft')[0]);await screen.findByText('Draft unconfirmed');
 expect(screen.queryByText('Re-run AI')).toBeNull();fireEvent.click(screen.getAllByText('Save Draft')[0]);await screen.findByText('Draft saved. The existing document has not been updated.');
 expect(api.save.mock.calls[0]).toEqual(api.save.mock.calls[1]);expect(api.cancel).not.toHaveBeenCalled();
});
it('can reconcile an uncertain update even after a status read becomes unavailable',async()=>{
 api.save.mockResolvedValueOnce({success:false,uncertain:true,error:'Update unconfirmed'}).mockResolvedValueOnce({success:true,data:{state:'applied'}});
 render(view());await submit();await screen.findByText('Update unconfirmed');
 api.status.mockResolvedValueOnce({success:false,error:'Temporary status failure'});fireEvent.click(screen.getByText('Refresh / recover processing'));await screen.findByText('Temporary status failure');
 fireEvent.click(screen.getAllByText('Recover saved request')[0]);await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(api.save.mock.calls[0]).toEqual(api.save.mock.calls[1]);
});
it('blocks stale saves including drafts while keeping the replacement review explicit',async()=>{
 api.status.mockResolvedValue({success:true,data:{state:'review_required',sourceCurrent:false,candidate}});
 render(view());await screen.findByLabelText('Title');
 for(const label of ['Save Draft','Update & Save'])for(const button of screen.getAllByText(label))expect((button as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByText('Re-run AI') as HTMLButtonElement).disabled).toBe(false);expect(api.save).not.toHaveBeenCalled();
});
it('does not show stale state while the first status read is still loading',async()=>{
 let resolve!:(v:unknown)=>void;api.status.mockReturnValueOnce(new Promise(r=>resolve=r));render(view());await screen.findByText('Reading the original file saved in DMS…');
 expect(screen.queryByText(/This review is out of date/)).toBeNull();
 await act(async()=>resolve({success:true,data:{state:'review_required',sourceCurrent:true,candidate}}));await ready();
});
it('keeps same-type metadata not addressed by AI',async()=>{
 const source=structuredClone(opened);source.values.metadataValues={4:{fieldType:'text',rawValue:'Keep this authority'}};
 api.open.mockResolvedValue({success:true,data:source});api.status.mockResolvedValue({success:true,data:{state:'review_required',sourceCurrent:true,candidate:{...candidate,proposedType:{documentTypeId:1,typeCode:'SYN',typeName:'Synthetic',categoryId:2,categoryName:null,profileHash:hash,schemaHash:hash,canApply:true,holdReason:null}}}});
 render(view());await ready();expect((screen.getByLabelText('Certificate Number') as HTMLInputElement).value).toBe('Keep this authority');
});
it('reloads a concurrent saved draft only after confirmation and uses its revision',async()=>{
 render(view());await ready();fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Local unsaved edit'}});
 const fresh=structuredClone(opened);api.open.mockResolvedValue({success:true,data:{...fresh,draft:{current:true,revision:3,payload:{values:{...fresh.values,title:'Other saved draft'},links:[],schemaHash:hash}}}});
 fireEvent.click(screen.getByText('Reload saved review'));expect(api.open).toHaveBeenCalledOnce();fireEvent.click(screen.getByText('Keep editing'));
 expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Local unsaved edit');
 fireEvent.click(screen.getByText('Reload saved review'));fireEvent.click(screen.getByText('Confirm reload'));await screen.findByDisplayValue('Other saved draft');
 expect(api.start).not.toHaveBeenCalled();await submit();await waitFor(()=>expect(api.save).toHaveBeenCalledOnce());expect(api.save.mock.calls[0][0].expectedRevision).toBe(3);
});
it('reload of a cancelled request does not silently start paid work',async()=>{
 render(view());await ready();api.open.mockResolvedValue({success:true,data:{...opened,review:{...opened.review,recovery:{...opened.review.recovery,state:'cancelled'}}}});
 api.status.mockResolvedValue({success:true,data:{state:'cancelled',sourceCurrent:true,candidate:null,progress:{...held,stage:'cancelled'}}});
 fireEvent.click(screen.getByText('Reload saved review'));fireEvent.click(screen.getByText('Confirm reload'));await screen.findByText('Processing cancelled. Accepted information is unchanged.');
 expect(api.start).not.toHaveBeenCalled();expect(screen.getByText('Re-run AI')).toBeTruthy();
 fireEvent.click(screen.getByText('Re-run AI'));fireEvent.click(screen.getByText('Confirm rerun'));
 await waitFor(()=>expect(api.start).toHaveBeenCalledOnce());expect(api.cancel).not.toHaveBeenCalled();
});
