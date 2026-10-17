// @vitest-environment node
// Actual retained-attempt hook and action menu; server and navigation are doubles.
import '../f05/setup';
import {saveUomRecord} from '@/server/uom-save';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';


import {StrictMode,useEffect,useLayoutEffect} from 'react';
const recovery=vi.hoisted(()=>({rpc:vi.fn(),revalidate:vi.fn()}));
const dom=await vi.hoisted(async()=>{const {builtinEnvironments}=await import('vitest/runtime');return builtinEnvironments.jsdom.setup(globalThis,{jsdom:{url:'http://localhost:3000'}});});
afterAll(async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});dom.teardown(globalThis);});
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:recovery.rpc,from:()=>{throw Error('Unexpected table access');}})}));
vi.mock('next/cache',()=>({revalidatePath:recovery.revalidate}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>({profile:{id:1},isAccountActive:true,globalPermissionCodes:['master_data.finance_basics.manage','master_data.geography.manage','master_data.uom.manage'],roleCodes:[],roleAssignments:[]})}));

import {afterEach,beforeEach,it,expect,vi,afterAll} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {UomEntity} from '@/lib/master-data/uom-save-contract';
import type {AuthContext} from '@/lib/rbac/check';
const mock=vi.hoisted(()=>({active:vi.fn(),lock:vi.fn(),retire:vi.fn(),confirmed:vi.fn(),invalidate:vi.fn(),success:vi.fn(),route:vi.fn(),query:{}}));
vi.mock('@/features/master-data/uom/actions',()=>Object.fromEntries(['UomCategory','UnitOfMeasure','UomConversion'].flatMap(name=>[['toggle'+name+'Status',(...args:unknown[])=>{mock.route(name,'active');return mock.active(...args);}],['toggle'+name+'Lock',(...args:unknown[])=>{mock.route(name,'lock');return mock.lock(...args);}],['delete'+name,(...args:unknown[])=>{mock.route(name,'retire');return mock.retire(...args);}]])));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>mock.query}));
vi.mock('@/lib/query/invalidation',()=>Object.fromEntries(['Uom'].map(name=>['invalidate'+name,mock.invalidate])));
vi.mock('sonner',()=>({toast:{success:mock.success}}));
import {useUomLifecycle,UomLifecycleNotice,UomActionsCell} from '@/features/master-data/uom/components/uom-lifecycle';
const row={id:9,is_active:true,is_locked:false,workspace_revision:3};
let current!:ReturnType<typeof useUomLifecycle>;
function Harness({entity='uom_categories'}:{entity?:UomEntity}){
 const state=useUomLifecycle(entity,mock.confirmed);useLayoutEffect(()=>{current=state;},[state]);
 return <><UomLifecycleNotice state={state}/><button onClick={()=>void state.change(row,'active')}>Status</button><button onClick={()=>void state.change(row,'lock')}>Lock</button><button onClick={()=>void state.change(row,'retire')}>Retire</button><button onClick={()=>void state.change({...row,id:10},'active')}>Other record</button></>;
}
beforeEach(()=>{vi.resetAllMocks();for(const fn of [mock.active,mock.lock,mock.retire])fn.mockResolvedValue({success:true,data:{id:9,revision:'4',changed:true,replayed:false}});});afterEach(cleanup);
it.each(['uom_categories','units_of_measure','uom_conversions'] as const)('%s status change supplies opening revision and desired state',async(entity)=>{
 render(<Harness entity={entity}/>);fireEvent.click(screen.getByRole('button',{name:'Status'}));await waitFor(()=>expect(mock.confirmed).toHaveBeenCalledOnce());
 expect(mock.active).toHaveBeenCalledWith({id:9,is_active:false},{operationId:expect.any(String),revision:'3'});expect(mock.invalidate).toHaveBeenCalledOnce();
});
it('uncertain change retains target/state/operation and prevents a competing action',async()=>{
 mock.active.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed'});render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Status'}));await screen.findByRole('button',{name:'Retry same change'});
 fireEvent.click(screen.getByRole('button',{name:'Other record'}));fireEvent.click(screen.getByRole('button',{name:'Lock'}));expect(mock.lock).not.toHaveBeenCalled();expect(mock.active).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('button',{name:'Retry same change'}));await waitFor(()=>expect(mock.confirmed).toHaveBeenCalledOnce());expect(mock.active.mock.calls[1]).toEqual(mock.active.mock.calls[0]);
});
it('malformed or wrong-identity receipts remain unconfirmed',async()=>{
 mock.active.mockResolvedValueOnce({success:true,data:{id:10,revision:'4',changed:true,replayed:false}});render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Status'}));await screen.findByRole('button',{name:'Retry same change'});expect(mock.confirmed).not.toHaveBeenCalled();
});
it('a known rollback allows another operation without replaying the failed change',async()=>{
 mock.active.mockResolvedValueOnce({success:false,error:'Conflict'});render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Status'}));await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Lock'}));await waitFor(()=>expect(mock.lock).toHaveBeenCalledOnce());expect(mock.confirmed).toHaveBeenCalledOnce();
});
it('retirement uses the retained contract and reports preserved history',async()=>{
 render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Retire'}));await waitFor(()=>expect(mock.retire).toHaveBeenCalledWith(9,{operationId:expect.any(String),revision:'3'}));expect(mock.success).toHaveBeenCalledWith('Record retired; history retained');
});
it('post-commit refresh failure does not offer replay of an acknowledged action',async()=>{
 mock.confirmed.mockImplementationOnce(()=>{throw Error('Refresh failed');});render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Status'}));await screen.findByRole('status');expect(screen.queryByRole('button',{name:'Retry same change'})).toBeNull();expect(mock.active).toHaveBeenCalledOnce();
});
it('in-flight double click produces one mutation',async()=>{
 mock.active.mockImplementation(()=>new Promise(()=>{}));render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Status'}));fireEvent.click(screen.getByRole('button',{name:'Status'}));expect(mock.active).toHaveBeenCalledOnce();
});
const auth={profile:{id:1},isAccountActive:true,permissionCodes:['master_data.uom.manage','master_data.lookups.lock'],globalPermissionCodes:[],roleCodes:[],roleAssignments:[]} as unknown as AuthContext;
it('company-only role sees no global mutation menu items',async()=>{
 render(<UomActionsCell row={row} authContext={auth} onView={vi.fn()} onEdit={vi.fn()} onToggleActive={vi.fn()} onToggleLock={vi.fn()} onDelete={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:'Record actions'}));await screen.findByRole('menuitem',{name:'View details'});
 expect(screen.queryByRole('menuitem',{name:'Edit'})).toBeNull();expect(screen.queryByRole('menuitem',{name:'Deactivate'})).toBeNull();expect(screen.queryByRole('menuitem',{name:'Lock'})).toBeNull();
});
it('ordinary global manager cannot lock or retire; system admin can',async()=>{
 const props={row,onView:vi.fn(),onEdit:vi.fn(),onToggleActive:vi.fn(),onToggleLock:vi.fn(),onDelete:vi.fn()};
 const rendered=render(<UomActionsCell {...props} authContext={{...auth,globalPermissionCodes:['master_data.uom.manage']}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Record actions'}));await screen.findByRole('menuitem',{name:'Edit'});expect(screen.queryByRole('menuitem',{name:'Lock'})).toBeNull();expect(screen.queryByRole('menuitem',{name:'Retire; keep history'})).toBeNull();
 rendered.unmount();render(<UomActionsCell {...props} authContext={{...auth,roleCodes:['system_admin'],roleAssignments:[{roleId:1,roleCode:'system_admin',ownerCompanyId:null,branchId:null,permissionCodes:[]}]}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Record actions'}));await screen.findByRole('menuitem',{name:'Lock'});expect(screen.getByRole('menuitem',{name:'Retire; keep history'})).toBeTruthy();
});
const ok={success:true,data:{id:9,revision:'4',changed:true,replayed:false}};
const unknown={success:false,uncertain:true,error:'Unconfirmed'};
const known={success:false,error:'Rejected'};
it.each(['active','lock','retire'] as const)('retains prior uncertainty after a later known %s rejection',async(action)=>{
 const fn=mock[action];fn.mockResolvedValueOnce(unknown).mockResolvedValueOnce(known).mockResolvedValueOnce({...ok,data:{...ok.data,replayed:true}});
 render(<Harness/>);await act(async()=>{expect(await current.change({...row},action)).toBe(false);});
 const expected=action==='active'?[{id:9,is_active:false},{operationId:expect.any(String),revision:'3'}]:action==='lock'?[9,true,{operationId:expect.any(String),revision:'3'}]:[9,{operationId:expect.any(String),revision:'3'}];
 expect(fn.mock.calls[0]).toEqual(expected);
 await act(async()=>{expect(await current.retry()).toBe(false);});expect(current.unconfirmed).toBe(true);
 await act(async()=>{expect(await current.change({...row,id:10},action)).toBe(false);});expect(fn).toHaveBeenCalledTimes(2);
 await act(async()=>{expect(await current.retry()).toBe(true);});expect(fn).toHaveBeenCalledTimes(3);
 expect(fn.mock.calls[1]).toEqual(fn.mock.calls[0]);expect(fn.mock.calls[2]).toEqual(fn.mock.calls[0]);expect(current.unconfirmed).toBe(false);
});
it.each(['active','lock','retire'] as const)('first-known %s rejection releases a fresh corrected operation',async(action)=>{
 mock[action].mockResolvedValueOnce(known);render(<Harness/>);
 await act(async()=>{expect(await current.change(row,action)).toBe(false);});expect(current.unconfirmed).toBe(false);
 await act(async()=>{expect(await current.change({...row,workspace_revision:8},action)).toBe(true);});
 const calls=mock[action].mock.calls,first=calls[0].at(-1),second=calls[1].at(-1);expect(second.revision).toBe('8');expect(second.operationId).not.toBe(first.operationId);
});
it('captures original row scalars and rejects the opposite toggle during recovery',async()=>{
 const mutable={...row};mock.active.mockResolvedValueOnce(unknown);render(<Harness/>);
 await act(async()=>{await current.change(mutable,'active');});Object.assign(mutable,{id:90,is_active:false,workspace_revision:99});
 await act(async()=>{expect(await current.change({...row,is_active:false},'active')).toBe(false);});expect(mock.active).toHaveBeenCalledOnce();
 await act(async()=>{expect(await current.retry()).toBe(true);});
 expect(mock.active.mock.calls[0]).toEqual([{id:9,is_active:false},{operationId:expect.any(String),revision:'3'}]);expect(mock.active.mock.calls[1]).toEqual(mock.active.mock.calls[0]);
});
it.each([true,false])('a matching receipt stays terminal when toast fails, changed=%s',async(changed)=>{
 mock.active.mockResolvedValue({...ok,data:{...ok.data,changed,replayed:true}});mock.success.mockImplementation(()=>{throw Error('toast failed');});render(<Harness/>);
 await act(async()=>{expect(await current.change(row,'active')).toBe(true);});expect(current.unconfirmed).toBe(false);expect(current.refreshError).toBe(true);
 expect(mock.invalidate).toHaveBeenCalledOnce();expect(mock.confirmed).toHaveBeenCalledOnce();
 await act(async()=>{expect(await current.retry()).toBe(false);});expect(mock.active).toHaveBeenCalledOnce();
});
it('invalidation failure still delivers the independent confirmed callback',async()=>{
 mock.invalidate.mockImplementation(()=>{throw Error('cache');});render(<Harness/>);await act(async()=>{expect(await current.change(row,'active')).toBe(true);});
 expect(mock.confirmed).toHaveBeenCalledOnce();expect(current.refreshError).toBe(true);expect(current.unconfirmed).toBe(false);
});
it.each(['unmount','entity ABA','client ABA'] as const)('suppresses deferred effects after %s',async(kind)=>{
 let finish!:(value:typeof ok)=>void;mock.active.mockReturnValue(new Promise(resolve=>{finish=resolve;}));const view=render(<Harness/>);
 let task!:Promise<boolean>;act(()=>{task=current.change(row,'active');});
 if(kind==='unmount')view.unmount();else if(kind==='entity ABA'){view.rerender(<Harness entity='units_of_measure'/>);view.rerender(<Harness/>);}else{const original=mock.query;mock.query={};view.rerender(<Harness/>);mock.query=original;view.rerender(<Harness/>);}
 await act(async()=>{finish(ok);expect(await task).toBe(false);});expect(mock.success).not.toHaveBeenCalled();expect(mock.invalidate).not.toHaveBeenCalled();expect(mock.confirmed).not.toHaveBeenCalled();
});
it('rechecks lifetime after a synchronous toast closes the view',async()=>{
 const view=render(<Harness/>);mock.success.mockImplementation(()=>view.unmount());
 await act(async()=>{expect(await current.change(row,'active')).toBe(true);});expect(mock.invalidate).not.toHaveBeenCalled();expect(mock.confirmed).not.toHaveBeenCalled();
});
it('rechecks lifetime after invalidation closes the view',async()=>{
 const view=render(<Harness/>);mock.invalidate.mockImplementation(()=>view.unmount());
 await act(async()=>{expect(await current.change(row,'active')).toBe(true);});expect(mock.success).toHaveBeenCalledOnce();expect(mock.confirmed).not.toHaveBeenCalled();
});
function OnMount({start}:{start:()=>void}){useEffect(()=>{start();},[start]);return null;}
it('StrictMode retires the first dispatch without letting its finalizer release the later flight',async()=>{
 const finishes:Array<(value:typeof ok)=>void>=[],tasks:Promise<boolean>[]=[];
 mock.active.mockImplementation(()=>new Promise(resolve=>{finishes.push(resolve);}));
 const start=()=>{tasks.push(current.change(row,'active'));};
 render(<StrictMode><Harness/><OnMount start={start}/></StrictMode>);
 expect(mock.active).toHaveBeenCalledTimes(2);
 await act(async()=>{finishes[0](ok);expect(await tasks[0]).toBe(false);});expect(current.busy).toBe(true);expect(mock.success).not.toHaveBeenCalled();
 await act(async()=>{expect(await current.change(row,'active')).toBe(false);});expect(mock.active).toHaveBeenCalledTimes(2);
 await act(async()=>{finishes[1](ok);expect(await tasks[1]).toBe(true);});expect(current.busy).toBe(false);expect(mock.confirmed).toHaveBeenCalledOnce();
});
it.each(['40003','08007'])('actual helper %s → known rollback → replay retains the exact RPC tuple',async(code)=>{
 recovery.rpc.mockResolvedValueOnce({data:null,error:{code,message:'private'}}).mockResolvedValueOnce({data:null,error:{code:'40P01',message:'private'}}).mockResolvedValueOnce({data:{id:9,revision:'4',changed:true,replayed:true},error:null});
 mock.active.mockImplementation((input:{id:number;is_active:boolean},contract:WorkspaceSaveContract)=>saveUomRecord('uom_categories','active',input.id,{is_active:input.is_active},contract));
 render(<Harness/>);await act(async()=>{expect(await current.change(row,'active')).toBe(false);});expect(current.unconfirmed).toBe(true);
 expect(recovery.rpc.mock.calls[0]).toEqual(['save_uom_record',{p_entity:'uom_categories',p_action:'active',p_id:9,p_revision:'3',p_operation:expect.any(String),p_data:{is_active:false}}]);
 await act(async()=>{expect(await current.retry()).toBe(false);});expect(current.unconfirmed).toBe(true);expect(recovery.revalidate).not.toHaveBeenCalled();
 await act(async()=>{expect(await current.retry()).toBe(true);});expect(recovery.rpc).toHaveBeenCalledTimes(3);expect(recovery.rpc.mock.calls[1]).toEqual(recovery.rpc.mock.calls[0]);expect(recovery.rpc.mock.calls[2]).toEqual(recovery.rpc.mock.calls[0]);
 expect(mock.confirmed).toHaveBeenCalledOnce();expect(screen.queryByText(/private/)).toBeNull();
});

it.each([["uom_categories","UomCategory"],["units_of_measure","UnitOfMeasure"],["uom_conversions","UomConversion"]] as const)('%s keeps its named handlers for all three finite lifecycle actions',async(entity,name)=>{
 render(<Harness entity={entity}/>);for(const action of ['active','lock','retire'] as const)await act(async()=>{expect(await current.change(row,action)).toBe(true);});
 expect(mock.route.mock.calls).toEqual([[name,'active'],[name,'lock'],[name,'retire']]);expect(mock.active.mock.calls[0][0]).toEqual({id:9,is_active:false});expect(mock.lock.mock.calls[0].slice(0,2)).toEqual([9,true]);expect(mock.retire.mock.calls[0][0]).toBe(9);
 expect(mock.confirmed).toHaveBeenCalledTimes(3);
});
it('ordinary revision and callback refresh preserves a pending original tuple',async()=>{
 mock.active.mockResolvedValueOnce(unknown);const view=render(<Harness/>);await act(async()=>{await current.change(row,'active');});
 view.rerender(<Harness/>);await act(async()=>{expect(await current.change({...row,workspace_revision:99},'active')).toBe(true);});
 expect(mock.active.mock.calls[0]).toEqual([{id:9,is_active:false},{operationId:expect.any(String),revision:'3'}]);expect(mock.active.mock.calls[1]).toEqual(mock.active.mock.calls[0]);
});
it('a thrown boundary followed by known rollback still needs the original matching receipt',async()=>{
 mock.active.mockRejectedValueOnce(Error('private')).mockResolvedValueOnce(known);render(<Harness/>);
 await act(async()=>{expect(await current.change(row,'active')).toBe(false);});await act(async()=>{expect(await current.retry()).toBe(false);});expect(current.unconfirmed).toBe(true);
 await act(async()=>{expect(await current.retry()).toBe(true);});expect(mock.active.mock.calls[2]).toEqual(mock.active.mock.calls[0]);expect(screen.queryByText(/private/)).toBeNull();
});
it.each([{id:9},{id:9,revision:'0',changed:true,replayed:false},{id:9,revision:'4',changed:true}])('incomplete receipt %j cannot release a later known rollback',async(data)=>{
 mock.active.mockResolvedValueOnce({success:true,data}).mockResolvedValueOnce(known);render(<Harness/>);
 await act(async()=>{expect(await current.change(row,'active')).toBe(false);});await act(async()=>{expect(await current.retry()).toBe(false);});expect(current.unconfirmed).toBe(true);expect(mock.confirmed).not.toHaveBeenCalled();
 await act(async()=>{expect(await current.retry()).toBe(true);});expect(mock.active.mock.calls[2]).toEqual(mock.active.mock.calls[0]);
});
it('the helper bridge remains fail-closed to native fetch',()=>{expect(globalThis.fetch.toString()).toContain('Network prohibited in F01 unit tests');});
