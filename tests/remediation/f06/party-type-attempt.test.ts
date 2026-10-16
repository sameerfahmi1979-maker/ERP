import {savePartyType} from '@/server/party-type-save';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {beforeEach,expect,it,vi} from 'vitest';
const port=vi.hoisted(()=>({rpc:vi.fn(),revalidate:vi.fn(),allowed:true}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:port.rpc,from:()=>{throw Error('Unexpected table access');}})}));
vi.mock('next/cache',()=>({revalidatePath:port.revalidate}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>({profile:{id:1},isAccountActive:true,globalPermissionCodes:port.allowed?['master_data.parties.manage_types','master_data.parties.manage_services','master_data.parties.manage_relationships']:[],roleCodes:[],roleAssignments:[]})}));
const m=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),load:vi.fn()}));
vi.mock('@/server/actions/master-data/party-admin-masters',()=>({createPartyType:m.create,updatePartyType:m.update,getPartyTypeAdminById:m.load}));
import {createPartyTypeAttempt} from '@/lib/master-data/party-type-attempt';
const row={id:7,workspace_revision:2},payload={type_code:'TEST',type_name:'Synthetic',is_active:false,sort_order:0};
const receipt={id:7,revision:'3',changed:true,replayed:false};
beforeEach(()=>{vi.resetAllMocks();port.allowed=true;m.create.mockResolvedValue({success:true,data:receipt});m.update.mockResolvedValue({success:true,data:receipt});m.load.mockResolvedValue({success:true,data:{...row,...payload,workspace_revision:3}});});
it('uses the opening revision and actual returned row, preserving false and zero',async()=>{const a=createPartyTypeAttempt(),r=await a.run(row,payload);expect(m.update.mock.calls[0][2]).toMatchObject({revision:'2'});expect(r.row.is_active).toBe(false);expect(r.row.sort_order).toBe(0);a.acknowledged();expect(a.pending()).toBe(false);});
it('retains original operation/revision after response loss and prop refresh',async()=>{const a=createPartyTypeAttempt();m.update.mockResolvedValueOnce({success:false,uncertain:true,error:'Lost'});await expect(a.run(row,payload)).rejects.toThrow('Lost');await a.run({...row,workspace_revision:3},payload);expect(m.update.mock.calls[1][2]).toEqual(m.update.mock.calls[0][2]);});
it('does not allow changed fields before the prior request is reconciled',async()=>{const a=createPartyTypeAttempt();m.update.mockRejectedValueOnce(Error('timeout'));await expect(a.run(row,payload)).rejects.toThrow();await expect(a.run(row,{...payload,is_active:true})).rejects.toThrow('previous save');expect(m.update).toHaveBeenCalledTimes(1);});
it('incomplete success remains pending with the same identity',async()=>{const a=createPartyTypeAttempt();m.create.mockResolvedValueOnce({success:true,data:{id:7}});await expect(a.run(null,payload)).rejects.toThrow('incomplete');await a.run(null,payload);expect(m.create.mock.calls[1][1]).toEqual(m.create.mock.calls[0][1]);});
it('a post-commit read failure retries only the read',async()=>{const a=createPartyTypeAttempt();m.load.mockResolvedValueOnce({success:false});await expect(a.run(row,payload)).rejects.toThrow('Saved');await a.run(row,payload);expect(m.update).toHaveBeenCalledTimes(1);expect(m.load).toHaveBeenCalledTimes(2);});
it.each([{id:99,workspace_revision:3},{id:7,workspace_revision:1},{id:7}])('rejects mismatched or stale authoritative reload %j',async(data)=>{const a=createPartyTypeAttempt();m.load.mockResolvedValueOnce({success:true,data});await expect(a.run(row,payload)).rejects.toThrow('latest type');await a.run(row,payload);expect(m.update).toHaveBeenCalledTimes(1);});
it('known rollback allows corrected fields with a new operation',async()=>{const a=createPartyTypeAttempt();m.update.mockResolvedValueOnce({success:false,error:'Rejected'});await expect(a.run(row,payload)).rejects.toThrow();expect(a.pending()).toBe(false);await a.run(row,{...payload,type_name:'Corrected'});expect(m.update.mock.calls[1][2].operationId).not.toBe(m.update.mock.calls[0][2].operationId);});
it('missing edit revision never becomes a create or sends a mutation',async()=>{const a=createPartyTypeAttempt();await expect(a.run({id:7},payload)).rejects.toThrow('revision');expect(m.update).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();});
it.each(['create','edit'] as const)('%s unknown then known then matching receipt retains exact immutable request',async(mode)=>{
 const a=createPartyTypeAttempt(),target=mode==='create'?null:{...row},input={...payload},original={...payload},fn=mode==='create'?m.create:m.update;
 fn.mockResolvedValueOnce({success:false,uncertain:true,error:'Lost'}).mockResolvedValueOnce({success:false,error:'Check fields'});
 await expect(a.run(target,input)).rejects.toThrow();Object.assign(input,{is_active:true,sort_order:9});if(target)target.workspace_revision=99;
 await expect(a.run(target,original)).rejects.toThrow(/earlier.*unconfirmed/i);expect(a.pending()).toBe(true);
 await expect(a.run(target,input)).rejects.toThrow('previous save');await a.run(target,original);
 const expected=mode==='create'?[original,{operationId:expect.any(String),revision:null}]:[7,original,{operationId:expect.any(String),revision:'2'}];
 expect(fn.mock.calls[0]).toEqual(expected);expect(fn.mock.calls[1]).toEqual(fn.mock.calls[0]);expect(fn.mock.calls[2]).toEqual(fn.mock.calls[0]);expect(m.load).toHaveBeenCalledOnce();
});
it('rejects action promises with fixed unconfirmed feedback, then preserves a later known rejection',async()=>{
 const a=createPartyTypeAttempt();m.update.mockRejectedValueOnce(Error('private marker')).mockResolvedValueOnce({success:false,error:'Check fields'});
 await expect(a.run(row,payload)).rejects.toThrow(/unconfirmed/i);await expect(a.run(row,payload)).rejects.toThrow(/earlier.*unconfirmed/i);await a.run(row,payload);expect(m.update.mock.calls[2]).toEqual(m.update.mock.calls[0]);
});
it('rejected reload promises remain saved and retry read-only',async()=>{
 const a=createPartyTypeAttempt();m.load.mockRejectedValueOnce(Error('private marker'));
 await expect(a.run(row,payload)).rejects.toThrow(/^Saved/);expect(()=>a.acknowledged()).toThrow();await a.run(row,payload);
 expect(m.update).toHaveBeenCalledOnce();expect(m.load).toHaveBeenCalledTimes(2);
});
it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'3','bad'])('rejects unusable loaded revision %s without resaving',async(revision)=>{
 const a=createPartyTypeAttempt();m.load.mockResolvedValueOnce({success:true,data:{...row,...payload,workspace_revision:revision}});
 await expect(a.run(row,payload)).rejects.toThrow(/^Saved/);expect(()=>a.acknowledged()).toThrow();await a.run(row,payload);expect(m.update).toHaveBeenCalledOnce();
});
it('cannot acknowledge either unknown or receipt-only state',async()=>{
 const a=createPartyTypeAttempt();m.update.mockResolvedValueOnce({success:false,uncertain:true,error:'Lost'});
 await expect(a.run(row,payload)).rejects.toThrow();expect(()=>a.acknowledged()).toThrow();expect(a.pending()).toBe(true);
 m.load.mockResolvedValueOnce({success:false});await expect(a.run(row,payload)).rejects.toThrow(/^Saved/);expect(()=>a.acknowledged()).toThrow();expect(a.pending()).toBe(true);
 await a.run(row,payload);a.acknowledged();expect(a.pending()).toBe(false);
});
it('confirmed cached row and receipt cannot be changed through returned references',async()=>{
 const a=createPartyTypeAttempt(),first=await a.run(row,payload);first.row.is_active=true;first.receipt.revision='99';
 const again=await a.run(row,payload);expect(again.row.is_active).toBe(false);expect(again.receipt.revision).toBe('3');expect(m.load).toHaveBeenCalledOnce();
});
it.each([{id:8,revision:'3',changed:true,replayed:false},{id:7,revision:'0',changed:true,replayed:false},{id:7,revision:'3',changed:true}])('incomplete receipt %j cannot be acknowledged or corrected after later denial',async(data)=>{
 const a=createPartyTypeAttempt();m.update.mockResolvedValueOnce({success:true,data}).mockResolvedValueOnce({success:false,error:'Check fields'});
 await expect(a.run(row,payload)).rejects.toThrow('incomplete');expect(()=>a.acknowledged()).toThrow();await expect(a.run(row,payload)).rejects.toThrow(/earlier.*unconfirmed/i);expect(m.load).not.toHaveBeenCalled();await a.run(row,payload);expect(m.update.mock.calls[2]).toEqual(m.update.mock.calls[0]);
});
it('retired currentness prevents dispatch and the read after a deferred mutation',async()=>{
 const a=createPartyTypeAttempt();let active=false;
 await expect(a.run(row,payload,()=>active)).rejects.toThrow(/current/i);expect(m.update).not.toHaveBeenCalled();
 active=true;let finish!:(v:unknown)=>void;m.update.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));const task=a.run(row,payload,()=>active);active=false;finish({success:true,data:receipt});
 await expect(task).rejects.toThrow(/current/i);expect(m.load).not.toHaveBeenCalled();
});
it('retired reload cannot install a confirmed row or become acknowledgeable',async()=>{
 const a=createPartyTypeAttempt();let active=true,finish!:(v:unknown)=>void;m.load.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));const task=a.run(row,payload,()=>active);
 await vi.waitFor(()=>expect(m.load).toHaveBeenCalledOnce());active=false;finish({success:true,data:{...row,...payload,workspace_revision:3}});
 await expect(task).rejects.toThrow(/current/i);expect(()=>a.acknowledged()).toThrow();
});
it('a retired invocation cannot release the running guard of a later legitimate retry',async()=>{
 const a=createPartyTypeAttempt();let firstLive=true;const finishes:Array<(v:unknown)=>void>=[];m.update.mockImplementation(()=>new Promise(resolve=>{finishes.push(resolve);}));
 const first=a.run(row,payload,()=>firstLive);firstLive=false;const second=a.run(row,payload,()=>true);void second.catch(()=>{});expect(m.update).toHaveBeenCalledTimes(2);
 finishes[0]({success:true,data:receipt});await expect(first).rejects.toThrow(/current/i);await expect(a.run(row,payload)).rejects.toThrow(/already running/i);expect(m.load).not.toHaveBeenCalled();
 finishes[1]({success:true,data:receipt});await second;expect(m.load).toHaveBeenCalledOnce();expect(m.update.mock.calls[1]).toEqual(m.update.mock.calls[0]);
});
it.each(['40003','08007'])('actual server helper %s → known → replay keeps the complete RPC tuple',async(code)=>{
 const a=createPartyTypeAttempt();port.rpc.mockResolvedValueOnce({data:null,error:{code,message:'private marker',details:'private marker',hint:'private marker'}}).mockResolvedValueOnce({data:null,error:{code:'40P01',message:'private marker'}}).mockResolvedValueOnce({data:{...receipt,replayed:true},error:null});
 m.update.mockImplementation((id:number,data:object,contract:WorkspaceSaveContract)=>savePartyType(id,data,contract));
 await expect(a.run(row,payload)).rejects.toThrow(/unconfirmed/i);await expect(a.run({...row,workspace_revision:99},payload)).rejects.toThrow(/earlier.*unconfirmed/i);expect(m.load).not.toHaveBeenCalled();expect(port.revalidate).not.toHaveBeenCalled();
 await a.run(row,payload);expect(port.rpc.mock.calls[0]).toEqual(['save_party_type',{p_id:7,p_revision:'2',p_operation:expect.any(String),p_data:payload}]);expect(port.rpc).toHaveBeenCalledTimes(3);expect(port.rpc.mock.calls[1]).toEqual(port.rpc.mock.calls[0]);expect(port.rpc.mock.calls[2]).toEqual(port.rpc.mock.calls[0]);expect(m.load).toHaveBeenCalledOnce();
});
it('actual helper preflight permission denial is known with zero RPC, then permits a fresh corrected operation',async()=>{
 const a=createPartyTypeAttempt();port.allowed=false;m.update.mockImplementation((id:number,data:object,contract:WorkspaceSaveContract)=>savePartyType(id,data,contract));
 await expect(a.run(row,payload)).rejects.toThrow(/permission/);expect(a.pending()).toBe(false);expect(port.rpc).not.toHaveBeenCalled();port.allowed=true;port.rpc.mockResolvedValue({data:receipt,error:null});await a.run(row,{...payload,is_active:true});expect(port.rpc).toHaveBeenCalledOnce();expect(m.update.mock.calls[1][2].operationId).not.toBe(m.update.mock.calls[0][2].operationId);
});
it('the helper bridge retains the offline fetch tripwire',()=>expect(globalThis.fetch.toString()).toContain('Network prohibited in F01 unit tests'));

it('actual create helper unknown→known→receipt keeps null identity until authoritative reload',async()=>{
 const a=createPartyTypeAttempt();port.rpc.mockResolvedValueOnce({data:null,error:{code:'40003',message:'private'}}).mockResolvedValueOnce({data:null,error:{code:'40001',message:'private'}}).mockResolvedValueOnce({data:{...receipt,replayed:true},error:null});
 m.create.mockImplementation((data:object,contract:WorkspaceSaveContract)=>savePartyType(null,data,contract));
 await expect(a.run(null,payload)).rejects.toThrow(/unconfirmed/i);await expect(a.run(null,payload)).rejects.toThrow(/earlier.*unconfirmed/i);expect(m.load).not.toHaveBeenCalled();await a.run(null,payload);
 expect(port.rpc.mock.calls[0]).toEqual(['save_party_type',{p_id:null,p_revision:null,p_operation:expect.any(String),p_data:payload}]);expect(port.rpc.mock.calls[1]).toEqual(port.rpc.mock.calls[0]);expect(port.rpc.mock.calls[2]).toEqual(port.rpc.mock.calls[0]);expect(m.update).not.toHaveBeenCalled();expect(m.load).toHaveBeenCalledExactlyOnceWith(7);
});

it.each(['success','rejection'] as const)('retired %s settles before a fresh known retry, retaining the original possible commit',async(outcome)=>{
 const a=createPartyTypeAttempt();let active=true,finish!:(v:unknown)=>void,fail!:(e:Error)=>void;
 m.update.mockReturnValueOnce(new Promise((resolve,reject)=>{finish=resolve;fail=reject;})).mockResolvedValueOnce({success:false,error:'Known rollback'});
 const first=a.run(row,payload,()=>active);void first.catch(()=>{});expect(m.update).toHaveBeenCalledOnce();active=false;
 if(outcome==='success')finish({success:true,data:receipt});else fail(Error('private rejected action'));
 await expect(first).rejects.toThrow(/current/i);expect(m.load).not.toHaveBeenCalled();expect(a.pending()).toBe(true);expect(a.saved()).toBe(false);
 await expect(a.run({...row,workspace_revision:99},payload,()=>true)).rejects.toThrow(/earlier.*unconfirmed/i);
 expect(a.pending()).toBe(true);expect(m.load).not.toHaveBeenCalled();
 await expect(a.run(row,{...payload,is_active:true},()=>true)).rejects.toThrow('previous save');expect(m.update).toHaveBeenCalledTimes(2);
 const result=await a.run(row,payload,()=>true);expect(result.receipt).toEqual(receipt);expect(m.update).toHaveBeenCalledTimes(3);
 expect(m.update.mock.calls[0]).toEqual([7,payload,{operationId:expect.any(String),revision:'2'}]);expect(m.update.mock.calls[1]).toEqual(m.update.mock.calls[0]);expect(m.update.mock.calls[2]).toEqual(m.update.mock.calls[0]);
 expect(m.load).toHaveBeenCalledExactlyOnceWith(7);a.acknowledged();expect(a.pending()).toBe(false);
});
it.each(['success','rejection'] as const)('retired %s cannot contaminate a newer request after the original was confirmed and acknowledged',async(outcome)=>{
 const a=createPartyTypeAttempt();let active=true,finishOld!:(v:unknown)=>void,failOld!:(e:Error)=>void,finishNew!:(v:unknown)=>void;
 m.update.mockReturnValueOnce(new Promise((resolve,reject)=>{finishOld=resolve;failOld=reject;}));
 const old=a.run(row,payload,()=>active);void old.catch(()=>{});active=false;
 await a.run(row,payload,()=>true);a.acknowledged();
 const corrected={...payload,is_active:true};m.update.mockReturnValueOnce(new Promise(resolve=>{finishNew=resolve;}));
 const fresh=a.run({...row,workspace_revision:3},corrected,()=>true);void fresh.catch(()=>{});
 if(outcome==='success')finishOld({success:true,data:receipt});else failOld(Error('private rejected action'));
 await expect(old).rejects.toThrow(/current/i);expect(m.load).toHaveBeenCalledOnce();
 finishNew({success:false,error:'New request rejected'});
 await expect(fresh).rejects.toThrow('New request rejected');expect(a.pending()).toBe(false);expect(a.saved()).toBe(false);
 expect(m.update.mock.calls[2]).toEqual([7,corrected,{operationId:expect.any(String),revision:'3'}]);expect(m.update.mock.calls[2][2].operationId).not.toBe(m.update.mock.calls[0][2].operationId);
});
it.each(['success','rejection'] as const)('retired %s cannot downgrade a newer confirmed result awaiting acknowledgement',async(outcome)=>{
 const a=createPartyTypeAttempt();let active=true,finish!:(v:unknown)=>void,fail!:(e:Error)=>void;
 m.update.mockReturnValueOnce(new Promise((resolve,reject)=>{finish=resolve;fail=reject;}));
 const old=a.run(row,payload,()=>active);void old.catch(()=>{});active=false;const confirmed=await a.run(row,payload,()=>true);
 if(outcome==='success')finish({success:true,data:{...receipt,revision:'99'}});else fail(Error('private rejected action'));
 await expect(old).rejects.toThrow(/current/i);expect(a.saved()).toBe(true);expect(await a.run(row,payload)).toEqual(confirmed);expect(m.load).toHaveBeenCalledOnce();expect(m.update).toHaveBeenCalledTimes(2);
 a.acknowledged();expect(a.pending()).toBe(false);
});
