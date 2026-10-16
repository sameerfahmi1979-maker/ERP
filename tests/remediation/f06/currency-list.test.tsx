// @vitest-environment node
// Actual lifecycle component, menu/dialog and scoped UI helpers. Action/cache/router doubles.
import '../f05/setup';
import {saveCurrencyRecord} from '@/server/currency-save';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';

import {StrictMode,useEffect} from 'react';
const recovery=vi.hoisted(()=>({rpc:vi.fn(),revalidate:vi.fn(),toggle:null as null|(()=>Promise<unknown>)}));
const dom=await vi.hoisted(async()=>{const {builtinEnvironments}=await import('vitest/runtime');return builtinEnvironments.jsdom.setup(globalThis,{jsdom:{url:'http://localhost:3000'}});});
afterAll(async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});dom.teardown(globalThis);});
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:recovery.rpc,from:()=>{throw Error('Unexpected table access');}})}));
vi.mock('next/cache',()=>({revalidatePath:recovery.revalidate}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>({profile:{id:1},isAccountActive:true,globalPermissionCodes:['master_data.finance_basics.manage','master_data.geography.manage','master_data.uom.manage'],roleCodes:[],roleAssignments:[]})}));

import {afterEach,beforeEach,expect,it,vi,afterAll} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {ReactNode} from 'react';
import type {AuthContext} from '@/lib/rbac/check';
import type {Currency} from '@/features/master-data/finance-basics/types';
const mock=vi.hoisted(()=>({status:vi.fn(),lock:vi.fn(),retire:vi.fn(),success:vi.fn(),refresh:vi.fn(),invalidate:vi.fn(),push:vi.fn(),query:{}}));
vi.mock('@/features/master-data/finance-basics/actions',()=>({toggleCurrencyStatus:mock.status,toggleCurrencyLock:mock.lock,deleteCurrency:mock.retire}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>mock.query}));
vi.mock('@/lib/query/invalidation',()=>({invalidateCurrencies:mock.invalidate}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mock.refresh,push:mock.push})}));
vi.mock('sonner',()=>({toast:{success:mock.success}}));
vi.mock('@/components/erp/table/erp-data-table',()=>({ERPDataTable:({data,columns,toolbarSlot}:{data:Currency[];columns:{id?:string;cell?:({row}:{row:{original:Currency}})=>ReactNode}[];toolbarSlot:ReactNode})=>{const cell=columns.find(c=>c.id==='actions')?.cell?.({row:{original:data[0]}}) as {props:{onToggleActive:()=>Promise<unknown>}};recovery.toggle=cell.props.onToggleActive;return <div>{toolbarSlot}{data.map(item=><section key={item.id} aria-label={item.currency_code}>{columns.find(c=>c.id==='actions')?.cell?.({row:{original:item}})}</section>)}</div>;}}));
import {CurrenciesTable} from '@/features/master-data/finance-basics/components/currencies-table';
const permission='master_data.finance_basics.manage',lockPermission='master_data.lookups.lock';
const context=(global:string[]=[],admin=false):AuthContext=>({profile:{id:1},isAccountActive:true,permissionCodes:[permission,lockPermission],globalPermissionCodes:global,roleCodes:admin?['system_admin']:[],roleAssignments:admin?[{ownerCompanyId:null,branchId:null,roleCode:'system_admin',permissionCodes:[]}]:[]} as unknown as AuthContext);
const row={id:81,workspace_revision:3,currency_code:'ZZZ',currency_name_en:'Synthetic currency',is_active:true,is_locked:false,is_system:false,decimal_places:0,updated_at:'2026-10-03T00:00:00Z'} as Currency;
const receipt={success:true,data:{id:81,revision:'4',changed:true,replayed:false}};
const mount=(ctx=context([],true),currency=row,onRefresh?:()=>void)=>render(<CurrenciesTable currencies={[currency]} authContext={ctx} onRefresh={onRefresh}/>);
const menu=async()=>{fireEvent.click(screen.getByRole('button',{name:'Record actions'}));await screen.findByRole('menuitem',{name:'View Details'});};
const choose=async(name:string)=>{await menu();fireEvent.click(screen.getByRole('menuitem',{name}));};
afterEach(cleanup);
beforeEach(()=>{vi.resetAllMocks();mock.status.mockResolvedValue(receipt);mock.lock.mockResolvedValue(receipt);mock.retire.mockResolvedValue(receipt);});

it('a company-only management grant does not expose shared-catalogue mutations',async()=>{
 mount(context());await menu();expect(screen.queryByRole('button',{name:'Add Currency'})).toBeNull();
 for(const name of ['Edit','Deactivate','Lock','Retire'])expect(screen.queryByRole('menuitem',{name})).toBeNull();
});
it('global lock capability does not also grant catalogue editing or retirement',async()=>{
 mount(context([lockPermission]));await menu();expect(screen.getByRole('menuitem',{name:'Lock'})).toBeTruthy();
 for(const name of ['Edit','Deactivate','Retire'])expect(screen.queryByRole('menuitem',{name})).toBeNull();
});
it('a locked currency disables editing and status for a non-admin catalogue manager',async()=>{
 mount(context([permission]),{...row,is_locked:true});await menu();
 for(const name of ['Edit','Deactivate'])expect(screen.getByRole('menuitem',{name}).getAttribute('aria-disabled')).toBe('true');
 expect(screen.queryByRole('menuitem',{name:'Retire'})).toBeNull();
});
it('a confirmed status change invalidates the existing currency lookup and refreshes the list',async()=>{
 mount();await choose('Deactivate');await waitFor(()=>expect(mock.success).toHaveBeenCalledWith('Currency deactivated'));
 expect(mock.status.mock.calls[0][0]).toEqual({id:81,is_active:false});expect(mock.status.mock.calls[0][1].revision).toBe('3');
 expect(mock.invalidate).toHaveBeenCalledWith(mock.query);expect(mock.refresh).toHaveBeenCalledOnce();
});
it('unknown outcome retains the original operation and snapshot through prop refresh',async()=>{
 mock.status.mockResolvedValueOnce({success:false,uncertain:true,error:'Synthetic response lost'});const view=mount();await choose('Deactivate');await screen.findByRole('button',{name:'Retry same currency change'});
 view.rerender(<CurrenciesTable currencies={[{...row,is_active:false,workspace_revision:4}]} authContext={context([],true)}/>);
 expect((screen.getByRole('button',{name:'Add Currency'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Retry same currency change'}));await waitFor(()=>expect(mock.status).toHaveBeenCalledTimes(2));
 expect(mock.status.mock.calls[1]).toEqual(mock.status.mock.calls[0]);expect(mock.invalidate).toHaveBeenCalledOnce();
});
it('a missing receipt stays unconfirmed instead of reporting success',async()=>{
 mock.status.mockResolvedValueOnce({success:true,data:{id:81}});mount();await choose('Deactivate');
 await screen.findByRole('button',{name:'Retry same currency change'});expect(mock.success).not.toHaveBeenCalled();expect(mock.invalidate).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Retry same currency change'}));await waitFor(()=>expect(mock.status).toHaveBeenCalledTimes(2));expect(mock.status.mock.calls[1]).toEqual(mock.status.mock.calls[0]);
});
it('a rejected action never refreshes data or toasts success',async()=>{
 mock.status.mockResolvedValueOnce({success:false,error:'Synthetic stale revision'});mount();await choose('Deactivate');await screen.findByText('Synthetic stale revision');
 expect(mock.success).not.toHaveBeenCalled();expect(mock.refresh).not.toHaveBeenCalled();expect(mock.invalidate).not.toHaveBeenCalled();
 expect(screen.queryByRole('button',{name:'Retry same currency change'})).toBeNull();
});
it('an unchanged receipt gives truthful no-change feedback',async()=>{
 mock.status.mockResolvedValue({...receipt,data:{...receipt.data,changed:false}});mount();await choose('Deactivate');await waitFor(()=>expect(mock.success).toHaveBeenCalledWith('No changes to save'));
});
it('retirement keeps its accessible dialog and same-operation retry after response loss',async()=>{
 mock.retire.mockResolvedValueOnce({success:false,uncertain:true,error:'Synthetic response lost'});mount();await choose('Retire');
 fireEvent.click(await screen.findByRole('button',{name:'Retire currency'}));await screen.findByRole('button',{name:'Retry same retirement'});
 expect((screen.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Retry same retirement'}));await waitFor(()=>expect(mock.success).toHaveBeenCalledWith('Currency retired; history retained'));
 expect(mock.retire.mock.calls[1]).toEqual(mock.retire.mock.calls[0]);expect(screen.queryByRole('button',{name:'Retry same retirement'})).toBeNull();
});
it('duplicate retirement submissions admit one action',async()=>{
 let finish!:(value:unknown)=>void;mock.retire.mockReturnValue(new Promise(resolve=>{finish=resolve;}));mount();await choose('Retire');
 const button=await screen.findByRole('button',{name:'Retire currency'});fireEvent.click(button);fireEvent.click(button);expect(mock.retire).toHaveBeenCalledOnce();
 await act(async()=>finish(receipt));expect(mock.success).toHaveBeenCalledOnce();
});
it('a refresh failure cannot turn a confirmed commit into a mutation retry',async()=>{
 const failedRefresh=vi.fn(()=>{throw Error('Synthetic refresh failure');});mount(context([],true),row,failedRefresh);await choose('Deactivate');
 await screen.findByText(/saved.*refresh/i);expect(mock.success).toHaveBeenCalledWith('Currency deactivated');
 expect(screen.queryByRole('button',{name:'Retry same currency change'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Refresh currency list'}));expect(mock.status).toHaveBeenCalledOnce();expect(failedRefresh).toHaveBeenCalledTimes(2);
});
it.each(['active','lock','retire'] as const)('prior unknown followed by known %s failure keeps the original retry',async(action)=>{
 const fn=action==='active'?mock.status:mock[action];fn.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed'}).mockResolvedValueOnce({success:false,error:'Known rejection'}).mockResolvedValueOnce({...receipt,data:{...receipt.data,replayed:true}});
 mount();await choose(action==='active'?'Deactivate':action==='lock'?'Lock':'Retire');if(action==='retire')fireEvent.click(await screen.findByRole('button',{name:'Retire currency'}));
 const retry=action==='retire'?'Retry same retirement':'Retry same currency change';await screen.findByRole('button',{name:retry});
 const expected=action==='active'?[{id:81,is_active:false},{operationId:expect.any(String),revision:'3'}]:action==='lock'?[81,true,{operationId:expect.any(String),revision:'3'}]:[81,{operationId:expect.any(String),revision:'3'}];expect(fn.mock.calls[0]).toEqual(expected);
 fireEvent.click(screen.getByRole('button',{name:retry}));await waitFor(()=>expect(fn).toHaveBeenCalledTimes(2));
 expect(screen.getByRole('button',{name:retry})).toBeTruthy();if(action==='retire')expect((screen.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:retry}));await waitFor(()=>expect(mock.success).toHaveBeenCalledOnce());
 expect(fn).toHaveBeenCalledTimes(3);expect(fn.mock.calls[1]).toEqual(fn.mock.calls[0]);expect(fn.mock.calls[2]).toEqual(fn.mock.calls[0]);
});
it('the exact input row object may mutate without changing the retained currency request',async()=>{
 const mutable={...row};mock.status.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed'});const view=mount(context([],true),mutable);await choose('Deactivate');await screen.findByRole('button',{name:'Retry same currency change'});
 Object.assign(mutable,{id:88,is_active:false,is_locked:true,workspace_revision:99});view.rerender(<CurrenciesTable currencies={[mutable]} authContext={context([],true)}/>);
 fireEvent.click(screen.getByRole('button',{name:'Retry same currency change'}));await waitFor(()=>expect(mock.status).toHaveBeenCalledTimes(2));
 expect(mock.status.mock.calls[0]).toEqual([{id:81,is_active:false},{operationId:expect.any(String),revision:'3'}]);expect(mock.status.mock.calls[1]).toEqual(mock.status.mock.calls[0]);expect(mock.success).toHaveBeenCalledOnce();
});
it('a genuine first-known retirement failure permits Cancel and a new operation',async()=>{
 mock.retire.mockResolvedValueOnce({success:false,error:'Rejected'});mount();await choose('Retire');fireEvent.click(await screen.findByRole('button',{name:'Retire currency'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 await choose('Deactivate');await waitFor(()=>expect(mock.status).toHaveBeenCalledOnce());expect(mock.status.mock.calls[0][1].operationId).not.toBe(mock.retire.mock.calls[0][1].operationId);
});
it.each([true,false])('toast failure leaves a matching changed=%s receipt terminal and refresh independent',async(changed)=>{
 mock.status.mockResolvedValue({...receipt,data:{...receipt.data,changed,replayed:true}});mock.success.mockImplementation(()=>{throw Error('Toast');});mount();await choose('Deactivate');
 await waitFor(()=>expect(mock.invalidate).toHaveBeenCalledOnce());expect(mock.refresh).toHaveBeenCalledOnce();expect(screen.queryByRole('button',{name:'Retry same currency change'})).toBeNull();
 fireEvent.click(await screen.findByRole('button',{name:'Refresh currency list'}));expect(mock.status).toHaveBeenCalledOnce();expect(mock.refresh).toHaveBeenCalledTimes(2);
});
it('retirement closes its dialog even when the success notification fails',async()=>{
 mock.success.mockImplementation(()=>{throw Error('Toast');});mount();await choose('Retire');fireEvent.click(await screen.findByRole('button',{name:'Retire currency'}));
 await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());expect(mock.refresh).toHaveBeenCalledOnce();expect(mock.retire).toHaveBeenCalledOnce();
});
it('invalidation failure still performs the independent refresh without mutation retry',async()=>{
 mock.invalidate.mockImplementation(()=>{throw Error('Cache');});mount();await choose('Deactivate');await screen.findByRole('button',{name:'Refresh currency list'});expect(mock.refresh).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('button',{name:'Refresh currency list'}));expect(mock.status).toHaveBeenCalledOnce();expect(mock.refresh).toHaveBeenCalledTimes(2);
});
it.each(['unmount','principal ABA','client ABA'] as const)('currency completion is silent after %s',async(kind)=>{
 let finish!:(value:typeof receipt)=>void;mock.status.mockReturnValue(new Promise(resolve=>{finish=resolve;}));const view=mount();await choose('Deactivate');
 if(kind==='unmount')view.unmount();else if(kind==='principal ABA'){view.rerender(<CurrenciesTable currencies={[row]} authContext={{...context([],true),profile:{id:2}} as AuthContext}/>);view.rerender(<CurrenciesTable currencies={[row]} authContext={context([],true)}/>);}else{const query=mock.query;mock.query={};view.rerender(<CurrenciesTable currencies={[row]} authContext={context([],true)}/>);mock.query=query;view.rerender(<CurrenciesTable currencies={[row]} authContext={context([],true)}/>);}
 await act(async()=>finish(receipt));expect(mock.success).not.toHaveBeenCalled();expect(mock.invalidate).not.toHaveBeenCalled();expect(mock.refresh).not.toHaveBeenCalled();
});
it.each(['toast','invalidation'])('currency rechecks lifetime after synchronous %s closes the view',async(effect)=>{
 const view=mount();(effect==='toast'?mock.success:mock.invalidate).mockImplementation(()=>view.unmount());await choose('Deactivate');await waitFor(()=>expect(mock.success).toHaveBeenCalledOnce());
 if(effect==='toast')expect(mock.invalidate).not.toHaveBeenCalled();expect(mock.refresh).not.toHaveBeenCalled();
});
function OnMount({start}:{start:()=>void}){useEffect(()=>{start();},[start]);return null;}
it('currency StrictMode old finalizer cannot release a later live request',async()=>{
 const finishes:Array<(value:typeof receipt)=>void>=[],tasks:Promise<unknown>[]=[];mock.status.mockImplementation(()=>new Promise(resolve=>{finishes.push(resolve);}));
 const start=()=>{tasks.push(recovery.toggle!());};render(<StrictMode><CurrenciesTable currencies={[row]} authContext={context([],true)}/><OnMount start={start}/></StrictMode>);expect(mock.status).toHaveBeenCalledTimes(2);
 await act(async()=>{finishes[0](receipt);await tasks[0];});expect(mock.success).not.toHaveBeenCalled();expect((screen.getByRole('button',{name:'Add Currency'}) as HTMLButtonElement).disabled).toBe(true);
 await act(async()=>{await recovery.toggle!();});expect(mock.status).toHaveBeenCalledTimes(2);
 await act(async()=>{finishes[1](receipt);await tasks[1];});expect(mock.success).toHaveBeenCalledOnce();expect((screen.getByRole('button',{name:'Add Currency'}) as HTMLButtonElement).disabled).toBe(false);
});
it.each(['40003','08007'])('currency actual helper %s → known → replay preserves the original RPC',async(code)=>{
 recovery.rpc.mockResolvedValueOnce({data:null,error:{code,message:'private'}}).mockResolvedValueOnce({data:null,error:{code:'40001',message:'private'}}).mockResolvedValueOnce({data:{id:81,revision:'4',changed:true,replayed:true},error:null});
 mock.status.mockImplementation((input:{id:number;is_active:boolean},contract:WorkspaceSaveContract)=>saveCurrencyRecord('active',input.id,{is_active:input.is_active},contract));
 mount();await choose('Deactivate');await screen.findByRole('button',{name:'Retry same currency change'});
 expect(recovery.rpc.mock.calls[0]).toEqual(['save_currency_record',{p_action:'active',p_id:81,p_revision:'3',p_operation:expect.any(String),p_data:{is_active:false}}]);
 fireEvent.click(screen.getByRole('button',{name:'Retry same currency change'}));await waitFor(()=>expect(recovery.rpc).toHaveBeenCalledTimes(2));expect(recovery.revalidate).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Retry same currency change'}));await waitFor(()=>expect(mock.success).toHaveBeenCalledOnce());expect(recovery.rpc).toHaveBeenCalledTimes(3);expect(recovery.rpc.mock.calls[1]).toEqual(recovery.rpc.mock.calls[0]);expect(recovery.rpc.mock.calls[2]).toEqual(recovery.rpc.mock.calls[0]);expect(screen.queryByText(/private/)).toBeNull();
});

it('retirement dialog retry uses its admitted snapshot after the selected row mutates in place',async()=>{
 const mutable={...row};mock.retire.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed'});
 const view=mount(context([],true),mutable);await choose('Retire');fireEvent.click(await screen.findByRole('button',{name:'Retire currency'}));await screen.findByRole('button',{name:'Retry same retirement'});
 Object.assign(mutable,{id:88,is_active:false,workspace_revision:99});view.rerender(<CurrenciesTable currencies={[mutable]} authContext={context([],true)}/>);
 fireEvent.click(screen.getByRole('button',{name:'Retry same retirement'}));await waitFor(()=>expect(mock.retire).toHaveBeenCalledTimes(2));
 expect(mock.retire.mock.calls[0]).toEqual([81,{operationId:expect.any(String),revision:'3'}]);expect(mock.retire.mock.calls[1]).toEqual(mock.retire.mock.calls[0]);await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());
});
it('retirement admission refusal cannot strand its dialog in Retiring',async()=>{
 const view=mount();await choose('Retire');await screen.findByRole('button',{name:'Retire currency'});
 view.rerender(<CurrenciesTable currencies={[row]} authContext={context()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Retire currency'}));expect(mock.retire).not.toHaveBeenCalled();
 expect(screen.queryByRole('button',{name:'Retiring...'})).toBeNull();expect((screen.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(false);
 view.rerender(<CurrenciesTable currencies={[row]} authContext={context([],true)}/>);
 fireEvent.click(screen.getByRole('button',{name:'Retire currency'}));await waitFor(()=>expect(mock.retire).toHaveBeenCalledOnce());await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());
});

it.each(['active','lock'] as const)('first-known currency %s failure admits a refreshed corrected operation',async(action)=>{
 const fn=action==='active'?mock.status:mock.lock;fn.mockResolvedValueOnce({success:false,error:'Rejected'});const view=mount();await choose(action==='active'?'Deactivate':'Lock');await screen.findByText('Rejected');
 view.rerender(<CurrenciesTable currencies={[{...row,workspace_revision:8}]} authContext={context([],true)}/>);
 await choose(action==='active'?'Deactivate':'Lock');await waitFor(()=>expect(fn).toHaveBeenCalledTimes(2));expect(fn.mock.calls[1].at(-1).revision).toBe('8');expect(fn.mock.calls[1].at(-1).operationId).not.toBe(fn.mock.calls[0].at(-1).operationId);
});
it('currency thrown boundary followed by known rollback retains its immutable retry',async()=>{
 mock.status.mockRejectedValueOnce(Error('private')).mockResolvedValueOnce({success:false,error:'Rejected'});mount();await choose('Deactivate');await screen.findByRole('button',{name:'Retry same currency change'});
 fireEvent.click(screen.getByRole('button',{name:'Retry same currency change'}));await waitFor(()=>expect(mock.status).toHaveBeenCalledTimes(2));expect(screen.getByRole('button',{name:'Retry same currency change'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Retry same currency change'}));await waitFor(()=>expect(mock.success).toHaveBeenCalledOnce());expect(mock.status.mock.calls[2]).toEqual(mock.status.mock.calls[0]);expect(screen.queryByText(/private/)).toBeNull();
});
it('currency wrong-identity receipt followed by known rollback still requires original replay',async()=>{
 mock.status.mockResolvedValueOnce({...receipt,data:{...receipt.data,id:88}}).mockResolvedValueOnce({success:false,error:'Rejected'});mount();await choose('Deactivate');await screen.findByRole('button',{name:'Retry same currency change'});
 fireEvent.click(screen.getByRole('button',{name:'Retry same currency change'}));await waitFor(()=>expect(mock.status).toHaveBeenCalledTimes(2));expect(screen.getByRole('button',{name:'Retry same currency change'})).toBeTruthy();expect(mock.refresh).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Retry same currency change'}));await waitFor(()=>expect(mock.success).toHaveBeenCalledOnce());expect(mock.status.mock.calls[2]).toEqual(mock.status.mock.calls[0]);
});
it('currency bridge remains fail-closed to native fetch',()=>{expect(globalThis.fetch.toString()).toContain('Network prohibited in F01 unit tests');});
