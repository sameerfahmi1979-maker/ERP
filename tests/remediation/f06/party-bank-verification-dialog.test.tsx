// @vitest-environment jsdom
// Real dialog, F04 save session/admission and validation wrapper. Application
// action, workspace owner/lock and toasts are doubles; not browser acceptance.
import '../f05/setup';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {PartyBankDetail} from '@/features/master-data/parties/party-types';
const m=vi.hoisted(()=>({verify:vi.fn(),close:vi.fn(),saved:vi.fn(),toast:vi.fn(),warning:vi.fn(),store:null as unknown}));
vi.mock('@/server/actions/master-data/party-bank-details',()=>({verifyPartyBankDetail:m.verify}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:'f06-bank-review'})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/hooks/use-workspace-navigation-lock',()=>({useWorkspaceNavigationLock:vi.fn()}));
vi.mock('sonner',()=>({toast:{success:m.toast,warning:m.warning,error:vi.fn()}}));
import {PartyBankVerificationDialog} from '@/features/master-data/parties/party-bank-verification-dialog';
const row={id:8,workspace_revision:3,party_id:4,bank_detail_code:'F06-BANK',account_holder_name:'Synthetic holder',account_number:'F06 synthetic account',iban:'F06-IBAN',currency_id:5,is_active:false} as PartyBankDetail;
const receipt={id:8,revision:'4',changed:true,replayed:false};
const mount=(record=row)=>render(<PartyBankVerificationDialog record={record} onClose={m.close} onSaved={m.saved}/>);
const confirm=()=>fireEvent.click(screen.getByRole('button',{name:'Confirm verification'}));
beforeEach(()=>{vi.resetAllMocks();m.store=createWorkspaceDraftStore();m.verify.mockResolvedValue({success:true,data:receipt});});afterEach(cleanup);
it('shows reviewed account details and does not verify until explicit confirmation',async()=>{
 mount();expect(screen.getByText('Synthetic holder')).toBeTruthy();expect(screen.getByText('F06 synthetic account')).toBeTruthy();expect(screen.getByText('Configured currency label unavailable')).toBeTruthy();expect(m.verify).not.toHaveBeenCalled();
 confirm();await waitFor(()=>expect(m.close).toHaveBeenCalledOnce());expect(m.verify.mock.calls[0][0]).toBe(8);expect(m.verify.mock.calls[0][1]).toMatchObject({revision:'3'});expect(m.saved).toHaveBeenCalledOnce();
});
it('cancel does not change or verify a record',()=>{mount();fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(m.close).toHaveBeenCalledOnce();expect(m.verify).not.toHaveBeenCalled();});
it('retains the displayed opening account and revision after a background refresh',async()=>{
 const r=mount();r.rerender(<PartyBankVerificationDialog record={{...row,workspace_revision:4,account_holder_name:'Other changed holder'}} onClose={m.close} onSaved={m.saved}/>);
 expect(screen.queryByText('Other changed holder')).toBeNull();confirm();await waitFor(()=>expect(m.verify).toHaveBeenCalledOnce());expect(m.verify.mock.calls[0][1].revision).toBe('3');
});
it('blocks cancellation after unknown commit and retries exactly the same operation',async()=>{
 m.verify.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed verification'});mount();confirm();
 const retry=await screen.findByRole('button',{name:'Retry same verification'});expect(screen.getByRole('button',{name:'Cancel'}).hasAttribute('disabled')).toBe(true);expect(m.close).not.toHaveBeenCalled();fireEvent.click(retry);
 await waitFor(()=>expect(m.close).toHaveBeenCalledOnce());expect(m.verify.mock.calls[1]).toEqual(m.verify.mock.calls[0]);
});
it('preserves an unknown operation across a same-opening remount using the existing F04 store',async()=>{
 m.verify.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed verification'});const r=mount();confirm();await screen.findByRole('button',{name:'Retry same verification'});const first=m.verify.mock.calls[0];r.unmount();mount();confirm();
 await waitFor(()=>expect(m.verify).toHaveBeenCalledTimes(2));expect(m.verify.mock.calls[1]).toEqual(first);
});
it('rejects double confirmation while the request is pending',async()=>{
 let finish!:(value:unknown)=>void;m.verify.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));mount();confirm();confirm();await waitFor(()=>expect(m.verify).toHaveBeenCalledOnce());finish({success:true,data:receipt});await waitFor(()=>expect(m.close).toHaveBeenCalledOnce());
});
it('shows a stale review error without false success or automatic overwrite',async()=>{
 m.verify.mockResolvedValue({success:false,error:'Reopen and review changed details.'});mount();confirm();expect((await screen.findByRole('alert')).textContent).toContain('Reopen');expect(m.close).not.toHaveBeenCalled();expect(m.toast).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Cancel'}).hasAttribute('disabled')).toBe(false);
});
it('does not accept a success receipt for a different account',async()=>{
 m.verify.mockResolvedValue({success:true,data:{...receipt,id:99}});mount();confirm();await screen.findByRole('button',{name:'Retry same verification'});expect(m.close).not.toHaveBeenCalled();expect(m.saved).not.toHaveBeenCalled();
});
it('reports already verified truthfully and does not retry a successful cache failure',async()=>{
 m.verify.mockResolvedValue({success:true,data:{...receipt,changed:false}});m.saved.mockImplementation(()=>{throw Error('Synthetic refresh failure');});mount();confirm();await waitFor(()=>expect(m.close).toHaveBeenCalledOnce());expect(m.toast).toHaveBeenCalledWith('Bank details were already verified');expect(m.warning).toHaveBeenCalledOnce();expect(m.verify).toHaveBeenCalledOnce();
});
it('does not dispatch verification without a loaded revision',()=>{mount({...row,workspace_revision:undefined});expect(screen.getByRole('button',{name:'Confirm verification'}).hasAttribute('disabled')).toBe(true);expect(screen.getByRole('alert').textContent).toContain('Reopen');expect(m.verify).not.toHaveBeenCalled();});
