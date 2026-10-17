import {beforeEach,expect,it,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import {resolveLookupActionOpening} from '@/features/master-data/lookups/action-revision-recovery';
import type {LookupCommand} from '@/features/master-data/lookups/mutation-contract';

let store:ReturnType<typeof createWorkspaceDraftStore>;
const operationId='00000000-0000-4000-8000-000000000041';
const command:LookupCommand={kind:'value',action:'lock',categoryId:8,categoryRevision:'6',data:{is_locked:true}};
const legacy='lookup-value-actions-9',modern='lookup-row-action:value:9:2:6';
const base='draft:tab:owner:';
const resolve=(revision=4,categoryRevision=9)=>resolveLookupActionOpening({store,ownerId:'owner',kind:'value',id:9,revision,categoryId:8,categoryRevision});
function seed(form=legacy,revision='2',pending=true,payload:LookupCommand=command){
 const contract={operationId,revision};
 store.setViewState(base+form+':save',JSON.stringify({id:9,revision,...pending?{pending:{fingerprint:JSON.stringify([9,payload]),contract}}:{}}));
 store.setViewState(base+form+':administration-payload',pending?JSON.stringify({id:9,payload,contract}):'null');
}
beforeEach(()=>{store=createWorkspaceDraftStore();});
it.each([legacy,modern])('pending %s survives both parent and sibling revision changes without writes',form=>{
 seed(form);const write=vi.spyOn(store,'setViewState'),uuid=vi.spyOn(crypto,'randomUUID');
 expect(resolve()).toEqual({ok:true,opening:{formKey:form,revision:2,pending:true}});expect(write).not.toHaveBeenCalled();expect(uuid).not.toHaveBeenCalled();
});
it('settled old history admits a new authoritative revision namespace without clearing history',()=>{
 seed(legacy,'3',false);seed(modern,'3',false);expect(resolve()).toEqual({ok:true,opening:{formKey:'lookup-row-action:value:9:4:9',revision:4,pending:false}});
 expect(store.getViewState(base+legacy+':save')).toContain('"revision":"3"');
});
it('a settled current namespace keeps its own accepted revision while props arrive',()=>{
 seed('lookup-row-action:value:9:4:9','5',false);expect(resolve()).toEqual({ok:true,opening:{formKey:'lookup-row-action:value:9:4:9',revision:5,pending:false}});
});
it('a regressed current witness cannot override its authoritative opening revision',()=>{seed('lookup-row-action:value:9:4:9','3',false);expect(resolve().ok).toBe(false);});
it('a unique legacy pending wins even alongside a current settled namespace',()=>{seed();seed('lookup-row-action:value:9:4:9','4',false);expect(resolve().ok&&resolve()).toMatchObject({opening:{formKey:legacy,pending:true}});});
it('two pending pairs block even if operation IDs match',()=>{seed();seed(modern);expect(resolve().ok).toBe(false);});
it.each(['missing save','missing payload','bad JSON','wrong operation','wrong revision','wrong row','wrong category','wrong kind','form save','wrong fingerprint','malformed settled'])('fails closed on %s without repairing witnesses',fault=>{
 seed();
 if(fault==='missing save'){store=createWorkspaceDraftStore();store.setViewState(base+legacy+':administration-payload','{}');}
 else if(fault==='missing payload')store.setViewState(base+legacy+':administration-payload','null');
 else if(fault==='bad JSON')store.setViewState(base+legacy+':save','{');
 else if(fault==='malformed settled')store.setViewState(base+'lookup-row-action:value:9:1:1:save','{');
 else if(fault==='wrong fingerprint'){const s=JSON.parse(store.getViewState(base+legacy+':save')!);s.pending.fingerprint='wrong';store.setViewState(base+legacy+':save',JSON.stringify(s));}
 else{const p=JSON.parse(store.getViewState(base+legacy+':administration-payload')!);if(fault==='wrong operation')p.contract.operationId='00000000-0000-4000-8000-000000000042';if(fault==='wrong revision')p.contract.revision='3';if(fault==='wrong row')p.id=99;if(fault==='wrong category')p.payload.categoryId=99;if(fault==='wrong kind')p.payload.kind='category';if(fault==='form save')p.payload.action='save';store.setViewState(base+legacy+':administration-payload',JSON.stringify(p));}
 const write=vi.spyOn(store,'setViewState');expect(resolve().ok).toBe(false);expect(write).not.toHaveBeenCalled();
});
it.each(['02:6:save','2:category:save','2:6:extra','2:6:save:extra'])('rejects malformed namespace %s',suffix=>{store.setViewState(base+'lookup-row-action:value:9:'+suffix,'{}');expect(resolve().ok).toBe(false);});
it.each([0,-1,NaN,Number.MAX_SAFE_INTEGER+1])('rejects invalid revision %s',revision=>expect(resolve(revision).ok).toBe(false));
it('does not discover another tab/account/record and never falls back to unscoped memory',()=>{
 seed();const other=resolveLookupActionOpening({store,ownerId:'other',kind:'value',id:9,revision:4,categoryId:8,categoryRevision:9});expect(other).toMatchObject({ok:true,opening:{pending:false}});
 expect(resolveLookupActionOpening({store:createWorkspaceDraftStore(),ownerId:'owner',kind:'value',id:9,revision:4,categoryId:8,categoryRevision:9})).toMatchObject({ok:true,opening:{pending:false}});
 expect(resolveLookupActionOpening({store,ownerId:undefined,kind:'category',id:9,revision:4}).ok).toBe(false);
});
it('missing or failing discovery blocks',()=>{expect(resolveLookupActionOpening({store:{...store,listViewStateKeysForTab:undefined},ownerId:'owner',kind:'category',id:9,revision:4}).ok).toBe(false);vi.spyOn(store,'listViewStateKeysForTab').mockImplementation(()=>{throw Error('private');});expect(resolve().ok).toBe(false);});
it('category action is independently scoped with null parent contract',()=>{
 const category={kind:'category',action:'active',categoryId:null,categoryRevision:null,data:{is_active:false}} as LookupCommand;
 seed('lookup-category-actions-9','2',true,category);
 expect(resolveLookupActionOpening({store,ownerId:'owner',kind:'category',id:9,revision:4})).toMatchObject({ok:true,opening:{formKey:'lookup-category-actions-9',pending:true}});
});
