// Synthetic transport only; actual boundary, hook, registry and QueryClient.
import React, {StrictMode, useLayoutEffect} from 'react';
import {act, cleanup, fireEvent, render, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {QueryClient, QueryClientProvider, useQueryClient} from '@tanstack/react-query';
import {ReadCacheBoundary, useReadCacheOwner, type ReadCacheIdentity, type ReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {canonicalReadParams, useServerPage, type ReadPage, type ServerPageSeed} from '@/hooks/use-server-page';
import {clearPrivateCaches} from '@/lib/query/private-cache';

type Row={id:number;workspace_revision:string;active:boolean;amount:number};
const identity={authUserId:'synthetic-A',scopeVersion:'scope-A'};
const params={page:1,pageSize:1};
const page=(id=1,pageNumber=1):ReadPage<Row>=>({rows:[{id,workspace_revision:'7',active:false,amount:0}],totalCount:4,page:pageNumber,pageSize:1});
const seed=(overrides:Partial<ServerPageSeed<Row>>={}):ServerPageSeed<Row>=>({identity,params,data:page(),updatedAt:Date.now(),...overrides});
let clients:QueryClient[],owners:ReadCacheOwner[],latest:ReturnType<typeof useServerPage<Row>>;
function Capture(){
 const client=useQueryClient(),owner=useReadCacheOwner();
 useLayoutEffect(()=>{if(!clients.includes(client))clients.push(client);if(owner&&!owners.includes(owner))owners.push(owner);},[client,owner]);
 return null;
}
function Grid({envelope,criteria=params,enabled=true,resource='synthetic',keyPrefix}:{envelope:ServerPageSeed<Row>;criteria?:Record<string,unknown>;enabled?:boolean;resource?:string;keyPrefix?:readonly unknown[]}){
 const query=useServerPage<Row>({resource,params:criteria,seed:envelope,enabled,keyPrefix});
 useLayoutEffect(()=>{latest=query;});
 return <><Capture/><p data-testid="state">{JSON.stringify({rows:query.data?.rows,busy:query.isBusy,error:query.isError,canUse:query.canUseData})}</p><button onClick={()=>{void query.refetch();}}>Retry</button></>;
}
function tree(envelope=seed(),criteria:Record<string,unknown>=params,owner:ReadCacheIdentity|undefined=identity,enabled=true){
 return <ReadCacheBoundary authUserId={owner?.authUserId} scopeVersion={owner?.scopeVersion}><Grid envelope={envelope} criteria={criteria} enabled={enabled}/></ReadCacheBoundary>;
}
const cacheData=(client:QueryClient)=>client.getQueryCache().getAll().flatMap(query=>query.state.data===undefined?[]:[query.state.data]);
function pendingTransport(){
 const resolve:((r:Response)=>void)[]=[];
 const fetcher=vi.fn((_url:RequestInfo|URL,_init?:RequestInit)=>{void _url;void _init;return new Promise<Response>(done=>resolve.push(done));});vi.stubGlobal('fetch',fetcher);
 return {fetcher,resolve};
}
beforeEach(()=>{clients=[];owners=[];vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Unexpected synthetic transport');}));});
afterEach(()=>{cleanup();clearPrivateCaches();clients.forEach(client=>client.clear());vi.unstubAllGlobals();vi.useRealTimers();});

it('canonical criteria preserve recursive key order equivalence, omitted fields and array order',()=>{
 expect(canonicalReadParams({filters:{status:false,amount:0,search:undefined},page:1})).toBe(canonicalReadParams({page:1,filters:{amount:0,status:false}}));
 expect(canonicalReadParams({ids:[2,1]})).not.toBe(canonicalReadParams({ids:[1,2]}));
});
it('same owner matching criteria has zero duplicate first fetch and preserves opaque row fields',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);render(tree(seed({params:{pageSize:1,page:1,search:undefined}})));
 await act(async()=>{});expect(fetcher).not.toHaveBeenCalled();expect(latest.data).toEqual(page());expect(latest.canUseData).toBe(true);
});
it.each([{authUserId:'synthetic-B',scopeVersion:'scope-A'},{...identity,scopeVersion:'scope-B'}])('foreign seed has no render, initial write, later effect write or request under %j',owner=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const view=render(tree(seed(),params,owner));
 expect(latest.data).toBeUndefined();expect(cacheData(clients[0])).toEqual([]);expect(fetcher).not.toHaveBeenCalled();
 view.rerender(tree(seed({updatedAt:Date.now()+10000,data:page(99)}),params,owner));
 expect(latest.data).toBeUndefined();expect(cacheData(clients[0])).toEqual([]);expect(fetcher).not.toHaveBeenCalled();
});
it.each(['no boundary','no boundary identity','missing seed identity','explicit disabled'])('fails closed for %s',mode=>{
 const envelope=seed(),fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 if(mode==='missing seed identity')envelope.identity=undefined as unknown as ReadCacheIdentity;
 if(mode==='no boundary'){const client=new QueryClient();clients.push(client);render(<QueryClientProvider client={client}><Grid envelope={envelope}/></QueryClientProvider>);}
 else if(mode==='no boundary identity')render(<ReadCacheBoundary><Grid envelope={envelope}/></ReadCacheBoundary>);
 else render(tree(envelope,params,identity,mode!=='explicit disabled'));
 expect(latest.data).toBeUndefined();expect(cacheData(clients[0])).toEqual([]);expect(fetcher).not.toHaveBeenCalled();
});
it('restored page cannot borrow default seed and a late old response cannot replace newer criteria',async()=>{
 const {fetcher,resolve}=pendingTransport(),envelope=seed(),view=render(tree(envelope,{...params,page:2}));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));expect(latest.data).toBeUndefined();
 view.rerender(tree(envelope,{...params,page:3}));await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 await act(async()=>resolve[1](Response.json({success:true,data:page(3,3)})));await waitFor(()=>expect(latest.data?.rows[0].id).toBe(3));
 await act(async()=>resolve[0](Response.json({success:true,data:page(2,2)})));expect(latest.data?.rows[0].id).toBe(3);
});
it('only search is debounced; page and dropdown changes issue immediately while placeholders cannot be used',async()=>{
 const {fetcher,resolve}=pendingTransport(),envelope=seed(),view=render(tree(envelope));
 view.rerender(tree(envelope,{...params,search:'private search'}));expect(fetcher).not.toHaveBeenCalled();expect(latest.canUseData).toBe(false);
 view.rerender(tree(envelope,{...params,search:'private search',filters:{status:'active'},page:2}));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1),{timeout:180});
 expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({filters:{status:'active'},page:2,pageSize:1});
 expect(latest.isBusy).toBe(true);expect(latest.canUseData).toBe(false);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).search).toBe('private search');
 await act(async()=>{resolve[0](Response.json({success:true,data:page(2,2)}));resolve[1](Response.json({success:true,data:page(3,2)}));});
 await waitFor(()=>expect(latest.canUseData).toBe(true));
});
it('older SSR effect seed never overwrites a newer authoritative result; a newer lawful seed can update',()=>{
 const envelope=seed(),view=render(tree(envelope));const key=clients[0].getQueryCache().getAll()[0].queryKey;
 act(()=>{clients[0].setQueryData(key,page(99),{updatedAt:envelope.updatedAt+1000});});
 view.rerender(tree(seed({updatedAt:envelope.updatedAt-1000})));
 expect(clients[0].getQueryData<ReadPage<Row>>(key)?.rows[0].id).toBe(99);
 view.rerender(tree(seed({data:page(77),updatedAt:envelope.updatedAt+2000})));
 expect(clients[0].getQueryData<ReadPage<Row>>(key)?.rows[0].id).toBe(77);
});
it.each(['clear','unmount','scope','account'])('%s retires old fetch, seed callback and refetch without refilling old/replacement caches',async mode=>{
 const {fetcher,resolve}=pendingTransport(),envelope=seed(),view=render(tree(envelope,{...params,page:2}));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));const old=clients[0],owner=owners.at(-1)!,refetch=latest.refetch;
 const lateSeed=()=>{if(owner.admits(identity))old.setQueryData(['late-seed'],page(99));};
 if(mode==='clear')act(()=>clearPrivateCaches());
 if(mode==='unmount')view.unmount();
 if(mode==='scope'||mode==='account')view.rerender(tree(envelope,params,mode==='scope'?{...identity,scopeVersion:'scope-new'}:{...identity,authUserId:'synthetic-B'}));
 expect(owner.admits(identity)).toBe(false);expect((fetcher.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
 if(mode==='clear')view.rerender(tree(seed({data:page(999),updatedAt:Date.now()+9999}),params));
 await act(async()=>{lateSeed();resolve[0](Response.json({success:true,data:page(2,2)}));});
 await expect(refetch()).rejects.toMatchObject({name:'AbortError'});
 expect(cacheData(old)).toEqual([]);if(mode!=='unmount')expect(latest.data).toBeUndefined();
 expect(clients.every(client=>cacheData(client).length===0)).toBe(true);
});
it('StrictMode setup/cleanup issues a different live token without reviving retired callbacks or duplicate matching fetch',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);render(<StrictMode>{tree()}</StrictMode>);
 await act(async()=>{});expect(owners.length).toBeGreaterThanOrEqual(2);expect(clients).toHaveLength(1);
 expect(owners[0].admits(identity)).toBe(false);expect(owners.at(-1)!.admits(identity)).toBe(true);
 if(owners[0].admits(identity))clients[0].setQueryData(['obsolete'],'forbidden');
 expect(clients[0].getQueryData(['obsolete'])).toBeUndefined();expect(latest.data).toEqual(page());expect(fetcher).not.toHaveBeenCalled();
});
it.each([401,403])('current %i denial masks warm rows and prevents newer SSR seeding and stale placeholder admission',async status=>{
 const fetcher=vi.fn(async()=>new Response('',{status}));vi.stubGlobal('fetch',fetcher);const envelope=seed(),view=render(tree(envelope));
 fireEvent.click(view.getByText('Retry'));await waitFor(()=>expect(latest.isError).toBe(true));
 expect(fetcher).toHaveBeenCalledTimes(1);expect(latest.data).toBeUndefined();expect(latest.canUseData).toBe(false);
 view.rerender(tree(seed({data:page(99),updatedAt:envelope.updatedAt+10000})));
 expect(latest.data).toBeUndefined();expect(cacheData(clients[0])).not.toContainEqual(page(99));
 view.rerender(tree(envelope,{...params,page:2}));expect(latest.data).toBeUndefined();expect(latest.canUseData).toBe(false);
});
it.each([401,403])('a %i denial cannot be undone by returning to a warm criteria or newer retained seed',async status=>{
 const {fetcher,resolve}=pendingTransport(),envelope=seed(),view=render(tree(envelope));
 view.rerender(tree(envelope,{...params,page:2}));await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 await act(async()=>resolve[0](new Response('',{status})));await waitFor(()=>expect(latest.isError).toBe(true));
 view.rerender(tree(envelope));expect(latest.data).toBeUndefined();expect(latest.canUseData).toBe(false);
 view.rerender(tree(seed({data:page(99),updatedAt:envelope.updatedAt+10000})));
 expect(latest.data).toBeUndefined();expect(cacheData(clients[0])).not.toContainEqual(page(99));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 await act(async()=>resolve[1](Response.json({success:true,data:page(11)})));
 await waitFor(()=>expect(latest.canUseData).toBe(true));expect(latest.data).toEqual(page(11));
});
it.each(['default resource','custom prefix','resource with shared custom prefix'])('%s changes cannot borrow another namespace as placeholder data',async mode=>{
 const {fetcher,resolve}=pendingTransport(),envelope=seed();
 const content=(next=false)=><ReadCacheBoundary {...identity}><Grid envelope={envelope} criteria={{...params,page:2}}
  resource={next&&mode!=='custom prefix'?'synthetic-B':'synthetic-A'}
  keyPrefix={mode==='default resource'?undefined:[next&&mode==='custom prefix'?'custom-B':'custom-A']}/></ReadCacheBoundary>;
 const view=render(content());await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 await act(async()=>resolve[0](Response.json({success:true,data:page(21,2)})));
 await waitFor(()=>expect(latest.canUseData).toBe(true));expect(latest.data).toEqual(page(21,2));
 view.rerender(content(true));expect(latest.data).toBeUndefined();expect(latest.canUseData).toBe(false);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 await act(async()=>resolve[1](Response.json({success:true,data:page(22,2)})));
 await waitFor(()=>expect(latest.canUseData).toBe(true));expect(latest.data).toEqual(page(22,2));
});
it('a page remount and query eviction cannot remove the owner denial or restore retained SSR rows',async()=>{
 const {fetcher,resolve}=pendingTransport(),envelope=seed();
 const content=(show=true)=><ReadCacheBoundary {...identity}>{show?<Grid envelope={envelope}/>:<Capture/>}</ReadCacheBoundary>;
 const view=render(content());fireEvent.click(view.getByText('Retry'));
 await act(async()=>resolve[0](new Response('',{status:403})));await waitFor(()=>expect(latest.isError).toBe(true));
 view.rerender(content(false));act(()=>clients[0].removeQueries());expect(cacheData(clients[0])).toEqual([]);
 view.rerender(content());expect(latest.data).toBeUndefined();
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 await act(async()=>resolve[1](Response.json({success:true,data:page(7)})));
 await waitFor(()=>expect(latest.canUseData).toBe(true));expect(latest.data).toEqual(page(7));
});
it('denial blocks a never-cached retained seed too, while fresh identical data can recover and survive a later transient error',async()=>{
 const fetcher=vi.fn(async()=>new Response('',{status:403}));vi.stubGlobal('fetch',fetcher);
 const envelope=seed(),view=render(tree(envelope));fireEvent.click(view.getByText('Retry'));
 await waitFor(()=>expect(latest.isError).toBe(true));
 // Exact same bytes/structural sharing are not a denial escape or a recovery blocker.
 fetcher.mockImplementation(async()=>Response.json({success:true,data:page()}));fireEvent.click(view.getByText('Retry'));
 await waitFor(()=>expect(latest.canUseData).toBe(true));expect(latest.data).toEqual(page());
 fetcher.mockImplementation(async()=>new Response('',{status:503}));clients[0].setDefaultOptions({queries:{retryDelay:0}});
 fireEvent.click(view.getByText('Retry'));await waitFor(()=>expect(latest.isError).toBe(true),{timeout:2500});
 expect(latest.data).toEqual(page());expect(latest.canUseData).toBe(false);
 const pending=pendingTransport();view.rerender(tree(seed({params:{...params,page:3},data:page(99,3),updatedAt:envelope.updatedAt+10000}),{...params,page:3}));
 expect(latest.data?.rows[0]?.id).not.toBe(99);expect(latest.canUseData).toBe(false);expect(cacheData(clients[0])).not.toContainEqual(page(99,3));
 await waitFor(()=>expect(pending.fetcher).toHaveBeenCalledTimes(1));
});
it.each([undefined,['other-pending']])('a denial masks a warm sibling partition and cancels pre-denial %j reads without automatically fanning out',async keyPrefix=>{
 const {fetcher,resolve}=pendingTransport(),envelope=seed();let warm:typeof latest,pending:typeof latest,sibling:typeof latest;
 function Parallel(){
  const a=useServerPage<Row>({resource:'synthetic',params,seed:envelope});
  const b=useServerPage<Row>({resource:'synthetic',params:{...params,page:2},seed:envelope,keyPrefix});
  const c=useServerPage<Row>({resource:'synthetic',params,seed:envelope,keyPrefix:['other-warm']});
  useLayoutEffect(()=>{warm=a;pending=b;sibling=c;});return <Capture/>;
 }
 render(<ReadCacheBoundary {...identity}><Parallel/></ReadCacheBoundary>);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));expect(sibling!.data).toEqual(page());act(()=>{void warm.refetch();});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 await act(async()=>resolve[1](new Response('',{status:403})));await waitFor(()=>expect(warm.isError).toBe(true));
 expect(warm!.data).toBeUndefined();expect(pending!.data).toBeUndefined();expect(pending!.canUseData).toBe(false);expect(sibling!.data).toBeUndefined();expect(sibling!.canUseData).toBe(false);
 expect(fetcher).toHaveBeenCalledTimes(2);expect((fetcher.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
 await act(async()=>resolve[0](Response.json({success:true,data:page(88,2)})));
 expect(cacheData(clients[0])).not.toContainEqual(page(88,2));expect(pending!.data).toBeUndefined();
 act(()=>{void pending.refetch();});await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3));
 await act(async()=>resolve[2](Response.json({success:true,data:page(22,2)})));
 await waitFor(()=>expect(pending.canUseData).toBe(true));expect(pending!.data).toEqual(page(22,2));expect(warm!.data).toBeUndefined();expect(sibling!.data).toBeUndefined();
});
it('a denied namespace does not withdraw another resource, but remains withdrawn when returning to it',async()=>{
 const {fetcher,resolve}=pendingTransport(),envelope=seed();
 const content=(resource='synthetic-A')=><ReadCacheBoundary {...identity}><Grid resource={resource} envelope={envelope}/></ReadCacheBoundary>;
 const view=render(content());fireEvent.click(view.getByText('Retry'));
 await act(async()=>resolve[0](new Response('',{status:403})));await waitFor(()=>expect(latest.isError).toBe(true));
 view.rerender(content('synthetic-B'));expect(latest.data).toEqual(page());expect(latest.canUseData).toBe(true);expect(fetcher).toHaveBeenCalledTimes(1);
 view.rerender(content());expect(latest.data).toBeUndefined();expect(latest.canUseData).toBe(false);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
});
it('changing only a custom cache partition cannot reset the same resource denial or reseed its retained rows',async()=>{
 const {fetcher,resolve}=pendingTransport(),envelope=seed();
 const content=(keyPrefix:readonly unknown[]=['partition-A'])=><ReadCacheBoundary {...identity}><Grid keyPrefix={keyPrefix} envelope={envelope}/></ReadCacheBoundary>;
 const view=render(content());fireEvent.click(view.getByText('Retry'));
 await act(async()=>resolve[0](new Response('',{status:403})));await waitFor(()=>expect(latest.isError).toBe(true));
 view.rerender(content(['partition-B']));expect(latest.data).toBeUndefined();expect(latest.canUseData).toBe(false);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 await act(async()=>resolve[1](Response.json({success:true,data:page(27)})));await waitFor(()=>expect(latest.canUseData).toBe(true));expect(latest.data).toEqual(page(27));
});
it('resource replacement retires old refetch closures and ignored-abort results, even with a shared custom prefix',async()=>{
 const {fetcher,resolve}=pendingTransport(),envelope=seed();
 const content=(resource='synthetic-A')=><ReadCacheBoundary {...identity}><Grid resource={resource} keyPrefix={['shared']} envelope={envelope} criteria={{...params,page:2}}/></ReadCacheBoundary>;
 const view=render(content());await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));const oldRefetch=latest.refetch;
 view.rerender(content('synthetic-B'));await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 await expect(oldRefetch()).rejects.toMatchObject({name:'AbortError'});
 await act(async()=>resolve[0](Response.json({success:true,data:page(88,2)})));expect(cacheData(clients[0])).not.toContainEqual(page(88,2));expect(latest.data).toBeUndefined();
 await act(async()=>resolve[1](Response.json({success:true,data:page(22,2)})));await waitFor(()=>expect(latest.canUseData).toBe(true));expect(latest.data).toEqual(page(22,2));
});
it('transient failure retains same-owner display state, but cannot authorize edits and remains retryable',async()=>{
 const fetcher=vi.fn(async()=>new Response('',{status:503}));vi.stubGlobal('fetch',fetcher);const view=render(tree());
 clients[0].setDefaultOptions({queries:{retryDelay:0}});fireEvent.click(view.getByText('Retry'));
 await waitFor(()=>expect(latest.isError).toBe(true),{timeout:2500});expect(fetcher).toHaveBeenCalledTimes(2);
 expect(latest.data).toEqual(page());expect(latest.canUseData).toBe(false);
 fetcher.mockImplementation(async()=>Response.json({success:true,data:page(3)}));fireEvent.click(view.getByText('Retry'));
 await waitFor(()=>expect(latest.canUseData).toBe(true));expect(latest.data?.rows[0].id).toBe(3);
});
it.each([
 ['wrong page',{...page(2,2),page:1}],['wrong pageSize',{...page(2,2),pageSize:2}],
 ['missing count',{...page(2,2),totalCount:undefined}],['negative count',{...page(2,2),totalCount:-1}],
 ['fraction count',{...page(2,2),totalCount:1.5}],['partial page',{...page(2,2),rows:[]}],
 ['invalid rows',{...page(2,2),rows:null}],['null row',{...page(2,2),rows:[null]}],
 ['array row',{...page(2,2),rows:[[]]}],['primitive row',{...page(2,2),rows:[false]}],
 ['count contradicts page',{...page(2,2),totalCount:1}],
])('%s is a non-retried failed read, never false empty',async(_label,data)=>{
 const fetcher=vi.fn(async()=>Response.json({success:true,data}));vi.stubGlobal('fetch',fetcher);render(tree(seed(),{...params,page:2}));
 await waitFor(()=>expect(latest.isError).toBe(true));expect(latest.data).toBeUndefined();expect(latest.canUseData).toBe(false);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('a verified zero total is truthfully empty',()=>{render(tree(seed({data:{rows:[],totalCount:0,page:1,pageSize:1}})));expect(latest.data?.rows).toEqual([]);expect(latest.canUseData).toBe(true);});
it('invalid seed is never admitted as initial or effect data',async()=>{
 const {fetcher}=pendingTransport();render(tree(seed({data:{...page(),totalCount:-1}})));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));expect(latest.data).toBeUndefined();expect(cacheData(clients[0])).toEqual([]);
});
it.each(['disabled','mismatched seed'])('withdrawn %s admission also rejects an already dispatched ignored-abort result',async mode=>{
 const {fetcher,resolve}=pendingTransport(),envelope=seed(),view=render(tree(envelope,{...params,page:2}));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 view.rerender(tree(mode==='mismatched seed'?seed({identity:{...identity,scopeVersion:'obsolete'}}):envelope,{...params,page:2},identity,mode!=='disabled'));
 await act(async()=>resolve[0](Response.json({success:true,data:page(55,2)})));
 expect(latest.data).toBeUndefined();expect(cacheData(clients[0])).not.toContainEqual(page(55,2));
});
it('current criteria denial prevents a newer seed effect for a different criteria key',async()=>{
 const fetcher=vi.fn(async()=>new Response('',{status:403}));vi.stubGlobal('fetch',fetcher);
 const envelope=seed(),view=render(tree(envelope,{...params,page:2}));
 await waitFor(()=>expect(latest.isError).toBe(true));
 view.rerender(tree(seed({data:page(99),updatedAt:envelope.updatedAt+10000}),{...params,page:2}));
 expect(cacheData(clients[0])).not.toContainEqual(page(99));expect(latest.data).toBeUndefined();
});
it('restoring admission cannot revive the previously withdrawn in-flight result',async()=>{
 const {fetcher,resolve}=pendingTransport(),envelope=seed(),view=render(tree(envelope,{...params,page:2}));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 view.rerender(tree(envelope,{...params,page:2},identity,false));
 view.rerender(tree(envelope,{...params,page:2}));
 await act(async()=>resolve[0](Response.json({success:true,data:page(88,2)})));
 expect(cacheData(clients[0])).not.toContainEqual(page(88,2));expect(latest.data?.rows[0]?.id).not.toBe(88);
});
it('mismatched retained props mask already warm same-owner data without deleting lawful cached rows',()=>{
 const envelope=seed(),view=render(tree(envelope));expect(latest.data).toEqual(page());
 view.rerender(tree(seed({identity:{...identity,scopeVersion:'old-scope'},updatedAt:Date.now()+10000,data:page(99)})));
 expect(latest.data).toBeUndefined();expect(latest.canUseData).toBe(false);expect(cacheData(clients[0])).toEqual([page()]);
});
it('a nested different QueryClient cannot borrow the independent boundary owner',()=>{
 const nested=new QueryClient();clients.push(nested);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 render(<ReadCacheBoundary {...identity}><QueryClientProvider client={nested}><Grid envelope={seed()}/></QueryClientProvider></ReadCacheBoundary>);
 expect(latest.data).toBeUndefined();expect(cacheData(nested)).toEqual([]);expect(fetcher).not.toHaveBeenCalled();
});
it('StrictMode retirement rejects ignored-abort first-generation fetch while admitting the replacement generation',async()=>{
 const {fetcher,resolve}=pendingTransport();render(<StrictMode>{tree(seed(),{...params,page:2})}</StrictMode>);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));expect(owners[0].admits(identity)).toBe(false);
 await act(async()=>{resolve[0](Response.json({success:true,data:page(88,2)}));resolve[1](Response.json({success:true,data:page(2,2)}));});
 await waitFor(()=>expect(latest.data?.rows[0].id).toBe(2));expect(cacheData(clients[0])).not.toContainEqual(page(88,2));
});
it('nested search debounces independently and dropdown identity changes are immediate',async()=>{
 const {fetcher}=pendingTransport(),envelope=seed({params:{...params,filters:{status:'active'}}});
 const view=render(tree(envelope,{...params,filters:{status:'active'}}));
 view.rerender(tree(envelope,{...params,filters:{status:'active',search:'nested search'}}));expect(fetcher).not.toHaveBeenCalled();
 view.rerender(tree(envelope,{...params,filters:{status:'inactive',search:'nested search'}}));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1),{timeout:180});
 expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).filters).toEqual({status:'inactive'});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).filters.search).toBe('nested search');
});
