// @vitest-environment jsdom
import '../f05/setup';
// This component test does not invoke export delivery (a Next server-action boundary).
vi.mock('@/components/erp/export/erp-export-menu',()=>({ERPExportMenu:()=>null}));
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const ctx=vi.hoisted(()=>({save:vi.fn(),childOpen:vi.fn(),contacts:[] as unknown[]}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({}),useQuery:()=>({data:[{id:5,name_en:'Synthetic selection'}]})}));
vi.mock('@/lib/query/invalidation',()=>({invalidatePartyContacts:vi.fn()}));
vi.mock('@/hooks/realtime/use-realtime-sync',()=>({useRealtimeSync:vi.fn()}));
vi.mock('@/features/master-data/parties/hooks/use-party-child-queries',()=>({usePartyContactsQuery:()=>({items:ctx.contacts,isLoading:false})}));
vi.mock('@/server/actions/master-data/party-contacts',()=>({createPartyContact:(payload:unknown)=>ctx.save(payload),updatePartyContact:(payload:unknown)=>ctx.save(payload),deletePartyContact:vi.fn()}));
vi.mock('@/server/actions/master-data/parties',()=>({getPartyContactRoles:vi.fn(),getPartyContactDepartments:vi.fn()}));
vi.mock('@/components/erp/combobox',()=>({ERPCombobox:({value,onValueChange,placeholder}:any)=><select aria-label={placeholder} value={value??''} onChange={e=>onValueChange(e.target.value?Number(e.target.value):null)}><option value="">Clear</option><option value="5">Synthetic selection</option></select>}));
import { PartyContactsTab } from '@/features/master-data/parties/party-contacts-tab';
beforeEach(()=>{ctx.save.mockReset().mockResolvedValue({success:false,error:'Synthetic failure'});ctx.childOpen.mockReset();ctx.contacts=[];});
afterEach(cleanup);
const mount=()=>render(<PartyContactsTab partyId={99001} onChildOpen={ctx.childOpen}/>);
it('child required/email validation precedes the action and identifies the field',()=>{
 const ui=mount();fireEvent.click(ui.getByText('Add Contact'));fireEvent.click(ui.getByRole('button',{name:'Add',exact:true}));expect(document.activeElement).toBe(ui.getByLabelText(/Full Name/));fireEvent.change(ui.getByLabelText(/Full Name/),{target:{value:'Synthetic'}});fireEvent.change(ui.getByLabelText('Email'),{target:{value:'invalid'}});fireEvent.click(ui.getByRole('button',{name:'Add',exact:true}));expect(document.activeElement).toBe(ui.getByLabelText('Email'));expect(ctx.save).not.toHaveBeenCalled();
});
it('custom-only dirty selection warns on cancel and keep-editing preserves its value',()=>{
 const ui=mount();fireEvent.click(ui.getByText('Add Contact'));fireEvent.change(ui.getByLabelText('Select department...'),{target:{value:'5'}});fireEvent.click(ui.getByRole('button',{name:'Cancel'}));fireEvent.click(ui.getByRole('button',{name:'Keep editing'}));expect((ui.getByLabelText('Select department...') as HTMLSelectElement).value).toBe('5');expect(ctx.childOpen).not.toHaveBeenCalledWith(false);expect(ctx.save).not.toHaveBeenCalled();
});
it('explicit nullable clear and false checkbox survive a failed save without writing parent state',async()=>{
 const ui=mount();fireEvent.click(ui.getByText('Add Contact'));fireEvent.change(ui.getByLabelText(/Full Name/),{target:{value:'Synthetic'}});fireEvent.change(ui.getByLabelText('Select department...'),{target:{value:'5'}});fireEvent.change(ui.getByLabelText('Select department...'),{target:{value:''}});fireEvent.click(ui.getByRole('checkbox',{name:'Accounts',exact:true}));fireEvent.click(ui.getByRole('checkbox',{name:'Accounts',exact:true}));fireEvent.click(ui.getByRole('button',{name:'Add',exact:true}));await waitFor(()=>expect(ctx.save).toHaveBeenCalledTimes(1));expect(ctx.save.mock.calls[0][0]).toMatchObject({party_id:99001,department_id:null,is_accounts_contact:false});expect((ui.getByLabelText(/Full Name/) as HTMLInputElement).value).toBe('Synthetic');expect(ctx.childOpen).not.toHaveBeenCalledWith(false);
});
it('discard reopens with fresh values, and reverting a custom selection does not warn',()=>{
 const ui=mount();fireEvent.click(ui.getByText('Add Contact'));fireEvent.change(ui.getByLabelText('Select role...'),{target:{value:'5'}});fireEvent.click(ui.getByRole('button',{name:'Cancel'}));fireEvent.click(ui.getByRole('button',{name:'Discard changes'}));fireEvent.click(ui.getByText('Add Contact'));expect((ui.getByLabelText('Select role...') as HTMLSelectElement).value).toBe('');fireEvent.change(ui.getByLabelText('Select role...'),{target:{value:'5'}});fireEvent.change(ui.getByLabelText('Select role...'),{target:{value:''}});fireEvent.click(ui.getByRole('button',{name:'Cancel'}));expect(ui.queryByRole('dialog')).toBeNull();
});
