// @vitest-environment jsdom
// Actual correction components and F04 save identity; DAL/query/shell doubled.
import '../f05/setup';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render as renderUI,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
const m=vi.hoisted(()=>({source:{} as object,store:null as unknown,create:vi.fn(),apply:vi.fn(),cancel:vi.fn(),invalidate:vi.fn(),listRuns:vi.fn(),getRun:vi.fn(),getSource:vi.fn(),readSection:vi.fn()}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:'f06-correction-test'})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/components/erp/erp-child-dialog-form',()=>({ERPChildDialogForm:({open,onSubmit,onOpenChange,children,closeDisabled}:{open:boolean;onSubmit:()=>void;onOpenChange:(v:boolean)=>void;children:React.ReactNode;closeDisabled?:boolean})=>open?<div>{children}<button onClick={onSubmit}>Run test submit</button><button disabled={closeDisabled} onClick={()=>onOpenChange(false)}>Close test dialog</button></div>:null}));
vi.mock('@/server/actions/dms/apply-correction',()=>({getApplyCorrectionSource:m.getSource,createApplyCorrectionProposal:m.create,applyCorrectionProposal:m.apply,cancelApplyCorrectionProposal:m.cancel}));
vi.mock('@/features/dms/documents/section-read',()=>({readDmsSection:m.readSection}));
vi.mock('@/lib/reads/client',()=>({retryAuthorizedRead:()=>false}));
vi.mock('@/features/dms/apply-correction/dms-apply-correction-history',()=>({DmsApplyCorrectionHistory:({documentId,onChanged}:{documentId:number;onChanged?:()=>void})=><div data-testid="correction-history">History for {documentId}<button onClick={onChanged}>History mutation completed</button></div>}));
vi.mock('@/components/erp/table/record-collection',()=>({RecordCollection:({rows,renderRecord}:{rows:object[];renderRecord:(row:object)=>React.ReactNode})=><>{rows.map(renderRecord)}</>}));
import {DmsApplyToErpRunHistory} from '@/features/dms/apply-to-erp/dms-apply-to-erp-run-history';
import {DmsApplyCorrectionDrawer} from '@/features/dms/apply-correction/dms-apply-correction-drawer';
import {DmsApplyCorrectionProposalForm} from '@/features/dms/apply-correction/dms-apply-correction-proposal-form';
import {DmsApplyCorrectionSourceCard} from '@/features/dms/apply-correction/dms-apply-correction-source-card';
import {DmsApplyCorrectionConfirmDialog} from '@/features/dms/apply-correction/dms-apply-correction-confirm-dialog';
import type {CorrectionSourceData} from '@/lib/dms/apply-correction/types';
const src:CorrectionSourceData={originalApplyItemId:3,originalApplyRunId:2,documentId:1,partyId:4,targetModule:'party',targetTable:'party_licenses',targetField:'remarks',targetRecordId:5,targetDisplayLabel:'Remarks',valueType:'text',reviewedRevision:'2',originalBeforeSummary:'Short summary...',originalAppliedSummary:'Short applied...',originalBeforeValue:'Full old value '.repeat(25),originalAppliedValue:'Full applied value '.repeat(25),currentValueSummary:'Current',restorePreviousEnabled:true,restorePreviousWarning:null,reapplyAvailable:true};
const p={id:6,proposal_code:'CORR-test',target_table:'party_licenses',target_field:'remarks',target_record_id:5,current_value_summary:'Current',proposed_correction_summary:'Reviewed',correction_mode:'manual' as const};
let client:QueryClient;
const render=(ui:ReactNode)=>renderUI(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
beforeEach(()=>{vi.resetAllMocks();client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,gcTime:0}}});m.getSource.mockImplementation(async()=>({success:true,data:m.source}));m.readSection.mockImplementation((method,args)=>method==='listDmsApplyToErpRuns'?m.listRuns(...args):method==='getDmsApplyToErpRun'?m.getRun(...args):Promise.reject(Error('Unexpected read method')));m.source=src;m.store=createWorkspaceDraftStore();m.create.mockResolvedValue({success:true,data:{proposalId:6}});m.apply.mockResolvedValue({success:true,data:{proposalId:6,status:'applied'}});m.cancel.mockResolvedValue({success:true,data:{proposalId:6,status:'cancelled'}});});afterEach(()=>{cleanup();client.clear();});
it('previous/applied prefills use exact governed values, not display summaries',()=>{const change=vi.fn();render(<DmsApplyCorrectionProposalForm source={src} value="" onChange={change} mode="manual" onModeChange={vi.fn()} isSubmitting={false} onSubmit={vi.fn()} onCancel={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:'Use Previous Value'}));expect(change).toHaveBeenLastCalledWith(src.originalBeforeValue);fireEvent.click(screen.getByRole('button',{name:'Use Applied Value'}));expect(change).toHaveBeenLastCalledWith(src.originalAppliedValue);});
it('uncertain preparation keeps identity, locks edited value and recovers same proposal',async()=>{m.create.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed'});render(<DmsApplyCorrectionDrawer open onOpenChange={vi.fn()} applyItemId={3}/>);fireEvent.change(await screen.findByLabelText(/Correction Value/),{target:{value:'Reviewed value'}});fireEvent.click(screen.getByText('Run test submit'));await waitFor(()=>expect(screen.getByText('Close test dialog').hasAttribute('disabled')).toBe(true));expect(screen.getByLabelText(/Correction Value/).hasAttribute('disabled')).toBe(true);fireEvent.click(screen.getByText('Run test submit'));await waitFor(()=>expect(m.create).toHaveBeenCalledTimes(2));expect(m.create.mock.calls[1][0].requestId).toBe(m.create.mock.calls[0][0].requestId);});
it('double preparation click is admitted only once',async()=>{m.create.mockReturnValue(new Promise(()=>{}));render(<DmsApplyCorrectionDrawer open onOpenChange={vi.fn()} applyItemId={3}/>);fireEvent.change(await screen.findByLabelText(/Correction Value/),{target:{value:'Reviewed'}});fireEvent.click(screen.getByText('Run test submit'));fireEvent.click(screen.getByText('Run test submit'));expect(m.create).toHaveBeenCalledTimes(1);});
it('confirmation requires both human review and replacement consent',()=>{render(<DmsApplyCorrectionConfirmDialog open onOpenChange={vi.fn()} proposal={p}/>);fireEvent.click(screen.getByText('Run test submit'));expect(m.apply).not.toHaveBeenCalled();fireEvent.click(screen.getByLabelText(/I confirm I have reviewed/));fireEvent.click(screen.getByText('Run test submit'));expect(m.apply).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('replace');});
it('uncertain apply blocks close and freezes confirmations until exact retry',async()=>{m.apply.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed'});const close=vi.fn();render(<DmsApplyCorrectionConfirmDialog open onOpenChange={close} proposal={p}/>);fireEvent.click(screen.getByLabelText(/I confirm I have reviewed/));fireEvent.click(screen.getByLabelText(/I confirm I want to replace/));fireEvent.click(screen.getByText('Run test submit'));await waitFor(()=>expect(screen.getByText('Close test dialog').hasAttribute('disabled')).toBe(true));fireEvent.click(screen.getByText('Run test submit'));await waitFor(()=>expect(close).toHaveBeenCalledWith(false));expect(m.apply.mock.calls[1]).toEqual(m.apply.mock.calls[0]);});
it('cancel actually cancels the proposal before closing',async()=>{const close=vi.fn();render(<DmsApplyCorrectionConfirmDialog open onOpenChange={close} proposal={p}/>);fireEvent.click(screen.getByText('Close test dialog'));await waitFor(()=>expect(close).toHaveBeenCalledWith(false));expect(m.cancel).toHaveBeenCalledWith(6);expect(m.apply).not.toHaveBeenCalled();});
it('history parent preserves the prepared proposal confirmation until apply or cancel',async()=>{
 const run={id:2,runCode:'APPLY-synthetic',targetTable:'party_licenses',sourceType:'entity_match_candidate',status:'completed',createdAt:'2026-10-04T12:00:00Z',appliedCount:1,skippedCount:0,conflictCount:0,failedCount:0};
 m.listRuns.mockResolvedValue({success:true,data:{runs:[run],total:1}});m.getRun.mockResolvedValue({success:true,data:{...run,items:[{id:3,targetField:'remarks',targetDisplayLabel:'Remarks',appliedValueSummary:'Applied',status:'applied'}]}});
 render(<DmsApplyToErpRunHistory documentId={1} correctionEnabled/>);fireEvent.click(await screen.findByRole('button',{name:/APPLY-synthetic/}));expect(screen.getByTestId('correction-history').textContent).toContain('History for 1');fireEvent.click(await screen.findByRole('button',{name:'Propose Correction'}));fireEvent.change(await screen.findByLabelText(/Correction Value/),{target:{value:'Reviewed'}});fireEvent.click(screen.getByText('Run test submit'));
 await waitFor(()=>expect(m.create).toHaveBeenCalledTimes(1));await waitFor(()=>expect(screen.getByLabelText(/I confirm I have reviewed/)).toBeTruthy());expect(m.listRuns).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByText('Close test dialog'));await waitFor(()=>expect(m.cancel).toHaveBeenCalledWith(6));await waitFor(()=>expect(m.listRuns).toHaveBeenCalledTimes(2));
});
it('dialog relies on the shared footer instead of duplicating proposal/cancel actions',async()=>{render(<DmsApplyCorrectionDrawer open onOpenChange={vi.fn()} applyItemId={3}/>);await screen.findByLabelText(/Correction Value/);expect(screen.queryByRole('button',{name:'Propose Correction'})).toBeNull();expect(screen.queryByRole('button',{name:'Cancel',exact:true})).toBeNull();expect(screen.getByText('Run test submit')).toBeTruthy();});
it('correction mode exposes its selected state through the approved shared button',()=>{render(<DmsApplyCorrectionProposalForm source={src} value="" onChange={vi.fn()} mode="manual" onModeChange={vi.fn()} isSubmitting={false} onSubmit={vi.fn()} onCancel={vi.fn()}/>);expect(screen.getByRole('button',{name:'Enter Correction Manually'}).getAttribute('aria-pressed')).toBe('true');expect(screen.getByRole('button',{name:'Use Previous Value'}).getAttribute('aria-pressed')).toBe('false');});
it('source values use theme-aware surfaces rather than a fixed white card',()=>{const view=render(<DmsApplyCorrectionSourceCard source={src}/>);expect(view.container.firstElementChild?.className).toContain('bg-muted/30');expect(screen.getByText(src.originalBeforeSummary!).className).toContain('bg-card');expect(view.container.querySelector('.bg-white')).toBeNull();});
it('successful apply closes the enclosing drawer only once',async()=>{const close=vi.fn();render(<DmsApplyCorrectionDrawer open onOpenChange={close} applyItemId={3}/>);fireEvent.change(await screen.findByLabelText(/Correction Value/),{target:{value:'Reviewed'}});fireEvent.click(screen.getByText('Run test submit'));fireEvent.click(await screen.findByLabelText(/I confirm I have reviewed/));fireEvent.click(screen.getByLabelText(/I confirm I want to replace/));fireEvent.click(screen.getByText('Run test submit'));await waitFor(()=>expect(m.apply).toHaveBeenCalledTimes(1));await waitFor(()=>expect(close).toHaveBeenCalledTimes(1));});
it('completed history mutations refresh parent run status instead of leaving a pending run',async()=>{
 const run={id:2,runCode:'APPLY-synthetic',targetTable:'party_licenses',sourceType:'entity_match_candidate',status:'pending',createdAt:'2026-10-04T12:00:00Z'};
 m.listRuns.mockResolvedValueOnce({success:true,data:{runs:[run],total:1}}).mockResolvedValue({success:true,data:{runs:[{...run,status:'completed'}],total:1}});
 render(<DmsApplyToErpRunHistory documentId={1} correctionEnabled/>);expect(await screen.findByText('Pending')).toBeTruthy();fireEvent.click(screen.getByText('History mutation completed'));await waitFor(()=>expect(m.listRuns).toHaveBeenCalledTimes(2));expect(await screen.findByText('Completed')).toBeTruthy();expect(screen.queryByText('Pending')).toBeNull();
});

it('background history recheck hides but does not forget the prepared confirmation',async()=>{
 const run={id:2,runCode:'APPLY-synthetic',targetTable:'party_licenses',sourceType:'entity_match_candidate',status:'completed',createdAt:'2026-10-04T12:00:00Z',appliedCount:1,skippedCount:0,conflictCount:0,failedCount:0};
 m.listRuns.mockResolvedValue({success:true,data:{runs:[run],total:1}});
 m.getRun.mockResolvedValue({success:true,data:{...run,items:[{id:3,targetField:'remarks',targetDisplayLabel:'Remarks',appliedValueSummary:'Applied',status:'applied'}]}});
 render(<DmsApplyToErpRunHistory documentId={1} correctionEnabled/>);
 fireEvent.click(await screen.findByRole('button',{name:/APPLY-synthetic/}));
 fireEvent.click(await screen.findByRole('button',{name:'Propose Correction'}));
 fireEvent.change(await screen.findByLabelText(/Correction Value/),{target:{value:'Retained proposal'}});
 fireEvent.click(screen.getByText('Run test submit'));
 await screen.findByLabelText(/I confirm I have reviewed/);
 let resolveRead!:(value:unknown)=>void;
 m.listRuns.mockImplementationOnce(()=>new Promise(resolve=>{resolveRead=resolve;}));
 let refresh!:Promise<void>;
 act(()=>{refresh=client.invalidateQueries({queryKey:['dms','apply-runs',1]});});
 await waitFor(()=>expect(screen.queryByLabelText(/I confirm I have reviewed/)).toBeNull());
 expect(screen.getByRole('status').textContent).toContain('Loading apply history');
 await act(async()=>{resolveRead({success:true,data:{runs:[run],total:1}});await refresh;});
 expect(await screen.findByLabelText(/I confirm I have reviewed/)).toBeTruthy();
 expect(m.create).toHaveBeenCalledTimes(1);
 expect(screen.queryByLabelText(/Correction Value/)).toBeNull();
});

it.each(['callback','refresh'])('a failed optional %s never turns a prepared proposal into another creation',async failure=>{
 const onProposed=vi.fn(()=>{if(failure==='callback')throw Error('Display unavailable');});
 if(failure==='refresh')vi.spyOn(client,'invalidateQueries').mockRejectedValueOnce(Error('Refresh unavailable'));
 render(<DmsApplyCorrectionDrawer open onOpenChange={vi.fn()} onProposed={onProposed} applyItemId={3}/>);
 fireEvent.change(await screen.findByLabelText(/Correction Value/),{target:{value:'Prepared once'}});
 fireEvent.click(screen.getByText('Run test submit'));
 expect(await screen.findByLabelText(/I confirm I have reviewed/)).toBeTruthy();
 expect(m.create).toHaveBeenCalledTimes(1);
 expect(onProposed).toHaveBeenCalledWith(6);
 fireEvent.click(screen.getByText('Run test submit'));
 expect(m.create).toHaveBeenCalledTimes(1);
 expect(m.apply).not.toHaveBeenCalled();
});
