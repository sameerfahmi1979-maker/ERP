// @vitest-environment jsdom
// Actual dialog/F04 session, with server action, toasts and workspace host doubled.
import '../f05/setup';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
const m=vi.hoisted(()=>({change:vi.fn(),close:vi.fn(),saved:vi.fn(),toast:vi.fn(),warning:vi.fn(),store:null as unknown}));
vi.mock('@/server/actions/master-data/party-child-lifecycle',()=>({setPartyChildArchived:m.change}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:'f06-child-lifecycle'})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/hooks/use-workspace-navigation-lock',()=>({useWorkspaceNavigationLock:vi.fn()}));
vi.mock('sonner',()=>({toast:{success:m.toast,warning:m.warning,error:vi.fn()}}));
import {PartyChildLifecycleDialog,PartyChildLifecycleControl,usePartyChildLifecycle} from '@/features/master-data/parties/party-child-lifecycle-control';
const row={id:8,party_id:4,workspace_revision:3,archived_at:null as string|null};
const receipt={id:8,revision:'4',archived:true,changed:true,replayed:false};
const mount=(record:typeof row=row)=>render(<PartyChildLifecycleDialog entity="party_contacts" record={record} label="F06-CONT-008" onSaved={m.saved} onClose={m.close}/>);
const confirm=(label='Archive record')=>fireEvent.click(screen.getByRole('button',{name:label,exact:true}));
beforeEach(()=>{vi.resetAllMocks();m.store=createWorkspaceDraftStore();m.change.mockResolvedValue({success:true,data:receipt});});afterEach(cleanup);
it('identifies retained history and dispatches the opening revision only after confirmation',async()=>{
 mount();expect(screen.getByText('F06-CONT-008')).toBeTruthy();expect(screen.getByText(/Keep this record, its number/)).toBeTruthy();expect(m.change).not.toHaveBeenCalled();
 confirm();await waitFor(()=>expect(m.close).toHaveBeenCalledOnce());expect(m.change.mock.calls[0].slice(0,3)).toEqual(['party_contacts',8,true]);expect(m.change.mock.calls[0][3].revision).toBe('3');expect(m.saved).toHaveBeenCalledOnce();
});
it('cancel does not mutate or refresh',()=>{mount();fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(m.change).not.toHaveBeenCalled();expect(m.saved).not.toHaveBeenCalled();expect(m.close).toHaveBeenCalledOnce();});
it('restoration is explicit and explains that it does not activate the record',async()=>{
 m.change.mockResolvedValue({success:true,data:{...receipt,archived:false}});
 mount({...row,archived_at:'2026-10-04T00:00:00Z'});expect(screen.getByText(/remains inactive/)).toBeTruthy();confirm('Restore record');await waitFor(()=>expect(m.change).toHaveBeenCalledOnce());expect(m.change.mock.calls[0][2]).toBe(false);
 await waitFor(()=>expect(m.close).toHaveBeenCalledOnce());expect(m.saved).toHaveBeenCalledOnce();expect(m.toast).toHaveBeenCalledWith('Record restored');
});
it('does not adopt a background version into the confirmation already opened',async()=>{
 const r=mount();r.rerender(<PartyChildLifecycleDialog entity="party_contacts" record={{...row,workspace_revision:9}} label="F06-CONT-008" onSaved={m.saved} onClose={m.close}/>);confirm();await waitFor(()=>expect(m.change).toHaveBeenCalledOnce());expect(m.change.mock.calls[0][3].revision).toBe('3');
});
it('locks cancellation after response loss and retries the identical operation',async()=>{
 m.change.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed'});mount();confirm();await screen.findByRole('button',{name:'Retry same action'});expect(screen.getByRole('button',{name:'Cancel'}).hasAttribute('disabled')).toBe(true);confirm('Retry same action');
 await waitFor(()=>expect(m.close).toHaveBeenCalledOnce());expect(m.change.mock.calls[1]).toEqual(m.change.mock.calls[0]);
});
it('rejects double submission and does not report success before confirmation',async()=>{
 let finish!:(value:unknown)=>void;m.change.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));mount();confirm();confirm();await waitFor(()=>expect(m.change).toHaveBeenCalledOnce());expect(m.toast).not.toHaveBeenCalled();finish({success:true,data:receipt});await waitFor(()=>expect(m.close).toHaveBeenCalledOnce());
});
it('shows dependency rejection without hiding the dialog or losing review',async()=>{
 m.change.mockResolvedValue({success:false,error:'Document still used as evidence.'});mount();confirm();expect((await screen.findByRole('alert')).textContent).toContain('evidence');expect(m.close).not.toHaveBeenCalled();expect(m.saved).not.toHaveBeenCalled();expect(m.toast).not.toHaveBeenCalled();
});
it('missing revision disables confirmation',()=>{
 mount({...row,workspace_revision:undefined} as unknown as typeof row);expect(screen.getByRole('button',{name:'Archive record'}).hasAttribute('disabled')).toBe(true);expect(screen.getByRole('alert').textContent).toContain('Reopen');expect(m.change).not.toHaveBeenCalled();
});
it('does not confirm a receipt for another record',async()=>{
 m.change.mockResolvedValue({success:true,data:{...receipt,id:99}});mount();confirm();await screen.findByRole('button',{name:'Retry same action'});expect(m.saved).not.toHaveBeenCalled();expect(m.close).not.toHaveBeenCalled();
});
it.each([
 ['opposite archive state',{...receipt,archived:false}],
 ['missing archive state',{id:8,revision:'4',changed:true,replayed:false}],
 ['unknown receipt field',{...receipt,unreviewed:true}],
 ['missing revision',{id:8,archived:true,changed:true,replayed:false}],
])('does not confirm %s or discard its uncertain operation',async(_label,data)=>{
 m.change.mockResolvedValueOnce({success:true,data});mount();confirm();await screen.findByRole('button',{name:'Retry same action'});
 expect(m.saved).not.toHaveBeenCalled();expect(m.toast).not.toHaveBeenCalled();expect(m.close).not.toHaveBeenCalled();
 expect(screen.getByRole('button',{name:'Cancel'}).hasAttribute('disabled')).toBe(true);confirm('Retry same action');
 await waitFor(()=>expect(m.close).toHaveBeenCalledOnce());expect(m.change.mock.calls[1]).toEqual(m.change.mock.calls[0]);
});
it('keeps a confirmed commit successful when refreshing its list fails',async()=>{
 m.saved.mockImplementation(()=>{throw Error('F06 refresh failure');});mount();confirm();await waitFor(()=>expect(m.close).toHaveBeenCalledOnce());expect(m.warning).toHaveBeenCalledOnce();expect(m.change).toHaveBeenCalledOnce();
});
it('the row control opens the confirmation without immediately archiving',()=>{
 function Host(){const lifecycle=usePartyChildLifecycle({entity:'party_contacts',onSaved:m.saved,onOpenChange:m.close});return <><PartyChildLifecycleControl record={row} onOpen={()=>lifecycle.open(row,'F06-CONT-008')}/>{lifecycle.dialog}</>;}
 render(<Host/>);confirm();expect(screen.getByRole('dialog')).toBeTruthy();expect(m.close).toHaveBeenCalledWith(true);expect(m.change).not.toHaveBeenCalled();
});
