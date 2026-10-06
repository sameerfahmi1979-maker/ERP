// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,render,renderHook,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider,QueryObserver,useQueryClient} from '@tanstack/react-query';
import {useServerPage,canonicalReadParams,type ReadPage} from '@/hooks/use-server-page';
import {registerPrivateCache,clearPrivateCaches} from '@/lib/query/private-cache';
import {ReadCacheBoundary} from '@/components/layout/read-cache-boundary';
import {invalidateHrEmployees,invalidateDmsDocuments} from '@/lib/query/invalidation';
import {readAllPages} from '@/server/reads/all-pages';
import {readJson} from '@/lib/reads/client';
const ownedClients:QueryClient[]=[];
afterEach(()=>{cleanup();ownedClients.splice(0).forEach(q=>q.clear());vi.unstubAllGlobals();vi.restoreAllMocks();});
const seed={rows:[{id:1}],totalCount:2,page:1,pageSize:25};
const client=()=>new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
const fixtureUpdatedAt=Date.now();
function Grid({params,updatedAt=fixtureUpdatedAt}:{params:Record<string,unknown>;updatedAt?:number}){
 const query=useServerPage<{id:number}>({resource:'example',params,seedParams:{page:1,pageSize:25},seed,updatedAt});
 return <div data-testid="state">{JSON.stringify({id:query.data?.rows[0]?.id,busy:query.isBusy,error:query.isError})}</div>;
}
it('matching server seed has zero duplicate initial request',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);render(<QueryClientProvider client={client()}><Grid params={{page:1,pageSize:25}}/></QueryClientProvider>);
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,320));});expect(fetcher).not.toHaveBeenCalled();
});
it('restored page cannot borrow the default seed; changing criteria never accept a late old result',async()=>{
 const pending:((r:Response)=>void)[]=[],fetcher=vi.fn(()=>new Promise<Response>(resolve=>pending.push(resolve)));vi.stubGlobal('fetch',fetcher);
 const qc=client(),view=render(<QueryClientProvider client={qc}><Grid params={{page:2,pageSize:25}}/></QueryClientProvider>);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));expect(view.getByTestId('state').textContent).not.toContain('"id":1');
 view.rerender(<QueryClientProvider client={qc}><Grid params={{page:3,pageSize:25}}/></QueryClientProvider>);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 await act(async()=>{pending[1](Response.json({success:true,data:{...seed,rows:[{id:3}],page:3}}));});await waitFor(()=>expect(view.getByTestId('state').textContent).toContain('"id":3'));
 await act(async()=>{pending[0](Response.json({success:true,data:{...seed,rows:[{id:2}],page:2}}));});expect(view.getByTestId('state').textContent).toContain('"id":3');
});
it('cleared old identity cache cannot fill the replacement identity cache from an in-flight response',async()=>{
 const old=client(),fresh=client();const dispose=registerPrivateCache(old);let resolve!:(value:number)=>void;
 const task=old.fetchQuery({queryKey:['private'],queryFn:()=>new Promise<number>(r=>{resolve=r;})}).catch(()=>undefined);
 clearPrivateCaches();resolve(7);await task;expect(old.getQueryData(['private'])).toBeUndefined();expect(fresh.getQueryData(['private'])).toBeUndefined();dispose();
});
it('canonical criteria do not change with key insertion order or absent optional filters',()=>{expect(canonicalReadParams({page:1,search:undefined,pageSize:25})).toBe(canonicalReadParams({pageSize:25,page:1}));});
it('nested filter identity is canonical and dropdown/page changes are not text-debounced',async()=>{
 expect(canonicalReadParams({filters:{status:'active',search:undefined,company:1}})).toBe(canonicalReadParams({filters:{company:1,status:'active'}}));
 const fetcher=vi.fn(async()=>Response.json({success:true,data:{...seed,rows:[{id:2}],page:2}}));vi.stubGlobal('fetch',fetcher);
 const view=render(<QueryClientProvider client={client()}><Grid params={{page:1,pageSize:25}}/></QueryClientProvider>);
 view.rerender(<QueryClientProvider client={client()}><Grid params={{page:2,pageSize:25}}/></QueryClientProvider>);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1),{timeout:180});
});
it('older server seed cannot overwrite a newer authoritative cached result',async()=>{
 const cache=client(),key=['read','example',canonicalReadParams({page:1,pageSize:25})];
 const now=Date.now();cache.setQueryData(key,{...seed,rows:[{id:99}]},{updatedAt:now});
 render(<QueryClientProvider client={cache}><Grid params={{page:1,pageSize:25}} updatedAt={now-10000}/></QueryClientProvider>);
 await act(async()=>{});expect(cache.getQueryData<{rows:{id:number}[]}>(key)?.rows[0].id).toBe(99);
});
it('a backend cap is paged through; errors, missing counts and truncation are never false success',async()=>{
 const rows=Array.from({length:1107},(_,id)=>({id}));const all=await readAllPages(async(from,to)=>({data:rows.slice(from,to+1),count:1107,error:null}));expect(all).toHaveLength(1107);
 await expect(readAllPages(async()=>({data:[],count:null,error:null}))).rejects.toThrow();
 await expect(readAllPages(async()=>({data:[{id:1}],count:1107,error:null}))).rejects.toThrow('partial');
 await expect(readAllPages(async()=>({data:null,count:0,error:{code:'failure'}}))).rejects.toThrow();
});
it('failed read transport is not an empty list; cancellation propagates and search terms stay out of URLs',async()=>{
 const control=new AbortController(),fetcher=vi.fn<typeof fetch>(async()=>new Response('failure',{status:503}));vi.stubGlobal('fetch',fetcher);
 await expect(readJson('example',{search:'synthetic private search'},control.signal)).rejects.toThrow('retry');expect(fetcher.mock.calls[0][0]).toBe('/api/reads/example');expect(fetcher.mock.calls[0][1]).toMatchObject({method:'POST',cache:'no-store',signal:control.signal,body:JSON.stringify({search:'synthetic private search'})});
});

type PageProps=Parameters<typeof useServerPage<{id:number}>>[0];
type PageResult=ReturnType<typeof useServerPage<{id:number}>>;
const criteria=(page=1)=>({page,pageSize:25});
const pageData=(ids:number[],totalCount=ids.length,page=1):ReadPage<{id:number}>=>({rows:ids.map(id=>({id})),totalCount,page,pageSize:25});
const pageProps=(overrides:Partial<PageProps>={}):PageProps=>({resource:'employees',params:criteria(),seedParams:criteria(),seed:pageData([1]),updatedAt:Date.now(),...overrides});
const pageKey=(page=1,resource='employees')=>['read',resource,canonicalReadParams(criteria(page))];
function pageOwner(){
 const qc=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:0,gcTime:Infinity}}});ownedClients.push(qc);
 return {qc,wrapper:({children}:{children:React.ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>};
}
function deferredReads(){
 const requests:{signal:AbortSignal;url:string;params:Record<string,unknown>;resolve:(r:Response)=>void;reject:(error:Error)=>void}[]=[];
 const fetcher=vi.fn((url:RequestInfo|URL,init?:RequestInit)=>new Promise<Response>((resolve,reject)=>{
  if(!init?.signal)throw Error('Read did not supply its cancellation signal');
  requests.push({url:String(url),params:JSON.parse(String(init.body)),signal:init.signal,resolve,reject});
 }));vi.stubGlobal('fetch',fetcher);
 return {fetcher,requests};
}
const response=(data:ReadPage<{id:number}>)=>Response.json({success:true,data});

it('generic invalidation retires the initial counted page before a confirmed write refresh',async()=>{
 const {qc,wrapper}=pageOwner(),{fetcher,requests}=deferredReads();
 const view=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:pageProps({params:criteria(2)})});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 act(()=>invalidateHrEmployees(qc));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));expect(requests[0].signal.aborted).toBe(true);
 await act(async()=>{requests[0].resolve(response(pageData([26],26,2)));requests[1].resolve(response(pageData([26,27],27,2)));});
 await waitFor(()=>expect(view.result.current.data?.totalCount).toBe(27));
 expect(qc.getQueryData(pageKey(2))).toEqual(pageData([26,27],27,2));expect(qc.getQueryState(pageKey(2))?.isInvalidated).toBe(false);
});
it('newer SSR seed replaces a contested exact-key read instead of accepting its late snapshot',async()=>{
 const {qc,wrapper}=pageOwner(),{fetcher,requests}=deferredReads(),initial=pageProps({updatedAt:Date.now()-60000});
 const view=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:initial});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 view.rerender({...initial,seed:pageData([1,2]),updatedAt:Date.now()});
 expect(requests[0].signal.aborted).toBe(true);await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 expect(qc.getQueryState(pageKey())?.isInvalidated).toBe(true);
 await act(async()=>{requests[0].resolve(response(pageData([1])));});
 expect(qc.getQueryData(pageKey())).toEqual(pageData([1,2]));expect(qc.getQueryState(pageKey())?.isInvalidated).toBe(true);
 await act(async()=>{requests[1].resolve(response(pageData([1,2,3])));});
 await waitFor(()=>expect(view.result.current.data?.totalCount).toBe(3));
});
it('a retained generic refetch cannot recreate its cleared owner after unmount',async()=>{
 const {qc,wrapper}=pageOwner(),{fetcher}=deferredReads();
 const view=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:pageProps()});
 const retained=view.result.current.refetch;view.unmount();qc.clear();
 let settled!:ReturnType<typeof retained>;act(()=>{settled=retained();});
 expect(fetcher).not.toHaveBeenCalled();await act(async()=>{await settled;});expect(qc.getQueryState(pageKey())).toBeUndefined();
});
it('committed unmount retires its handle before a replacement layout effect can rebuild the old cache',async()=>{
 const {qc,wrapper}=pageOwner(),{fetcher}=deferredReads(),initial=pageProps();let retained!:PageResult['refetch'],pending!:ReturnType<PageResult['refetch']>;
 function Source(){const read=useServerPage(initial);React.useLayoutEffect(()=>{retained=read.refetch;},[read.refetch]);return null;}
 function Replacement(){React.useLayoutEffect(()=>{qc.clear();pending=retained();},[]);return null;}
 const view=render(<Source/>,{wrapper});view.rerender(<Replacement/>);
 expect(fetcher).not.toHaveBeenCalled();expect(qc.getQueryState(pageKey())).toBeUndefined();await act(async()=>{await pending;});
});
it('a committed resource change retires the former handle before caller layout effects run',async()=>{
 const {qc,wrapper}=pageOwner(),{fetcher}=deferredReads(),initial=pageProps();let retained!:PageResult['refetch'],pending!:ReturnType<PageResult['refetch']>;
 function Source({resource}:{resource:string}){
  const read=useServerPage({...initial,resource});
  React.useLayoutEffect(()=>{if(resource==='employees')retained=read.refetch;else pending=retained();},[resource,read.refetch]);return null;
 }
 const view=render(<Source resource="employees"/>,{wrapper});view.rerender(<Source resource="dms-documents"/>);
 expect(fetcher).not.toHaveBeenCalled();expect(qc.getQueryData(pageKey())).toEqual(initial.seed);expect(qc.getQueryData(pageKey(1,'dms-documents'))).toEqual(initial.seed);
 await act(async()=>{await pending;});
});
it.each([401,403,503])('a matching incoming initialData cannot erase an existing no-data %s failure',async status=>{
 const {qc,wrapper}=pageOwner(),{fetcher,requests}=deferredReads(),initial=pageProps({params:criteria(2)});
 const view=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:initial});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));await act(async()=>{requests[0].resolve(new Response('failed',{status}));});
 if(status===503){await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));await act(async()=>{requests[1].resolve(new Response('failed',{status}));});}
 await waitFor(()=>expect(qc.getQueryState(pageKey(2))?.status).toBe('error'));
 expect(qc.getQueryState(pageKey(2))).toMatchObject({data:undefined,errorUpdateCount:1,fetchStatus:'idle'});
 const calls=fetcher.mock.calls.length;view.rerender({...initial,seedParams:criteria(2),seed:pageData([202],1,2),updatedAt:Date.now()+1});
 await act(async()=>{});expect(qc.getQueryState(pageKey(2))).toMatchObject({data:undefined,status:'error',errorUpdateCount:1});
 expect(view.result.current.isError).toBe(true);expect(view.result.current.data).toBeUndefined();expect(fetcher).toHaveBeenCalledTimes(calls);
});
it('a matching seed cannot replace a failed no-data manual retry while it is pending',async()=>{
 const {qc,wrapper}=pageOwner(),{fetcher,requests}=deferredReads(),initial=pageProps({params:criteria(2)});
 const view=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:initial});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));await act(async()=>{requests[0].resolve(new Response('denied',{status:403}));});
 await waitFor(()=>expect(view.result.current.isError).toBe(true));
 let retry!:ReturnType<PageResult['refetch']>;act(()=>{retry=view.result.current.refetch();});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));expect(qc.getQueryState(pageKey(2))).toMatchObject({data:undefined,status:'pending',error:null,errorUpdateCount:1});
 view.rerender({...initial,seedParams:criteria(2),seed:pageData([202],1,2),updatedAt:Date.now()+1});
 await act(async()=>{});expect(qc.getQueryState(pageKey(2))).toMatchObject({data:undefined,status:'pending',errorUpdateCount:1});
 expect(requests[1].signal.aborted).toBe(false);expect(fetcher).toHaveBeenCalledTimes(2);
 await act(async()=>{requests[1].resolve(response(pageData([301,302,303],3,2)));await retry;});
 await waitFor(()=>expect(view.result.current.data).toEqual(pageData([301,302,303],3,2)));
 expect(qc.getQueryState(pageKey(2))?.errorUpdateCount).toBe(1);
 view.rerender({...initial,seedParams:criteria(2),seed:pageData([401,402,403,404],4,2),updatedAt:Date.now()+2});
 await waitFor(()=>expect(view.result.current.data?.totalCount).toBe(4));expect(fetcher).toHaveBeenCalledTimes(2);
});

it('shared fresh seeds avoid requests and idle newer seeds retain their own timestamp',async()=>{
 const {qc,wrapper}=pageOwner(),{fetcher}=deferredReads(),initial=pageProps();
 const view=renderHook((p:PageProps)=>({a:useServerPage(p),b:useServerPage(p)}),{wrapper,initialProps:initial});
 await act(async()=>{});expect(fetcher).not.toHaveBeenCalled();
 const updatedAt=initial.updatedAt+1;view.rerender({...initial,seed:pageData([2,3]),updatedAt});
 await waitFor(()=>expect(view.result.current.a.data?.totalCount).toBe(2));
 expect(view.result.current.b.data).toEqual(pageData([2,3]));expect(qc.getQueryState(pageKey())?.dataUpdatedAt).toBe(updatedAt);expect(fetcher).not.toHaveBeenCalled();
});
it.each(['older','equal','zero','nan','infinite'] as const)('a %s seed cannot cancel a shared live read or upgrade its cache',async kind=>{
 const {qc,wrapper}=pageOwner(),{fetcher,requests}=deferredReads(),initial=pageProps();
 const view=renderHook((p:PageProps)=>({a:useServerPage(p),b:useServerPage(p)}),{wrapper,initialProps:initial});
 let pending!:ReturnType<PageResult['refetch']>;act(()=>{pending=view.result.current.b.refetch();});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 const updatedAt={older:initial.updatedAt-1,equal:initial.updatedAt,zero:0,nan:NaN,infinite:Infinity}[kind];
 view.rerender({...initial,seed:pageData([999]),updatedAt});await act(async()=>{});
 expect(requests[0].signal.aborted).toBe(false);expect(fetcher).toHaveBeenCalledTimes(1);expect(qc.getQueryData(pageKey())).toEqual(initial.seed);
 expect(qc.getQueryState(pageKey())?.dataUpdatedAt).toBe(initial.updatedAt);
 await act(async()=>{requests[0].resolve(response(pageData([8,9])));await pending;});
 await waitFor(()=>expect(view.result.current.a.data).toEqual(pageData([8,9])));
});
it('two observers adopt a contested seed through one shared replacement and ignore late failure',async()=>{
 const {qc,wrapper}=pageOwner(),{fetcher,requests}=deferredReads(),initial=pageProps({updatedAt:Date.now()-60000});
 const view=renderHook((p:PageProps)=>({a:useServerPage(p),b:useServerPage(p)}),{wrapper,initialProps:initial});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 view.rerender({...initial,seed:pageData([1,2]),updatedAt:Date.now()});await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 expect(requests[0].signal.aborted).toBe(true);expect(requests[1].signal.aborted).toBe(false);
 expect(qc.getQueryState(pageKey())?.isInvalidated).toBe(true);
 await act(async()=>{requests[0].reject(new Error('Retired synthetic response'));});
 expect(qc.getQueryState(pageKey())?.status).not.toBe('error');expect(fetcher).toHaveBeenCalledTimes(2);
 await act(async()=>{requests[1].resolve(response(pageData([3,4,5])));});
 await waitFor(()=>expect(view.result.current.a.data?.totalCount).toBe(3));expect(view.result.current.b.data).toEqual(pageData([3,4,5]));
 expect(qc.getQueryState(pageKey())?.isInvalidated).toBe(false);
});
it('an incoming default-page seed retires observerless work without fetching it or replacing the active page',async()=>{
 const {qc,wrapper}=pageOwner(),{fetcher,requests}=deferredReads(),initial=pageProps({params:criteria(2),updatedAt:0});
 const view=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:initial});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));await act(async()=>{requests[0].resolve(response(pageData([20],26,2)));});
 await waitFor(()=>expect(view.result.current.data?.page).toBe(2));
 let oldSignal!:AbortSignal,finish!:()=>void;
 const read=vi.fn(({signal}:{signal:AbortSignal})=>new Promise<ReadPage<{id:number}>>(resolve=>{oldSignal=signal;finish=()=>resolve(pageData([999]));}));
 const old=qc.fetchQuery({queryKey:pageKey(),queryFn:read}).catch(()=>undefined);
 view.rerender({...initial,updatedAt:Date.now(),seed:pageData([1,2])});
 expect(oldSignal.aborted).toBe(true);await act(async()=>{finish();await old;});
 expect(read).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledTimes(1);
 expect(qc.getQueryData(pageKey())).toEqual(pageData([1,2]));expect(qc.getQueryState(pageKey())?.isInvalidated).toBe(true);
 expect(view.result.current.data).toEqual(pageData([20],26,2));
});
it('a newer seed preserves an idle invalidated key until its active observer verifies it',async()=>{
 const {qc,wrapper}=pageOwner(),{fetcher,requests}=deferredReads(),initial=pageProps();
 const view=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:initial});
 await act(async()=>{await qc.invalidateQueries({queryKey:pageKey(),exact:true,refetchType:'none'});});
 expect(fetcher).not.toHaveBeenCalled();view.rerender({...initial,seed:pageData([2]),updatedAt:initial.updatedAt+1});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));expect(qc.getQueryState(pageKey())?.isInvalidated).toBe(true);
 await act(async()=>{requests[0].resolve(response(pageData([3,4])));});await waitFor(()=>expect(view.result.current.data?.totalCount).toBe(2));
});
it.each([403,503])('contested seed verification preserves a %s error and cannot be rescued by a prop write',async status=>{
 const {qc,wrapper}=pageOwner(),{fetcher,requests}=deferredReads(),initial=pageProps({updatedAt:Date.now()-60000});
 const view=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:initial});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));view.rerender({...initial,seed:pageData([2]),updatedAt:Date.now()});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));await act(async()=>{requests[1].resolve(new Response('failure',{status}));});
 if(status===503){await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3));await act(async()=>{requests[2].resolve(new Response('failure',{status}));});}
 await waitFor(()=>expect(view.result.current.isError).toBe(true));const calls=fetcher.mock.calls.length;
 view.rerender({...initial,seed:pageData([999]),updatedAt:Date.now()+1});await act(async()=>{requests[0].resolve(response(pageData([1])));});
 expect(qc.getQueryState(pageKey())).toMatchObject({status:'error',isInvalidated:true});expect(qc.getQueryData(pageKey())).toEqual(pageData([2]));
 expect(view.result.current.isSuccess).toBe(false);if(status===403)expect(view.result.current.data).toBeUndefined();expect(fetcher).toHaveBeenCalledTimes(calls);
});
it('a failed explicit no-data retry stays failed after a matching seed arrives',async()=>{
 const {qc,wrapper}=pageOwner(),{fetcher,requests}=deferredReads(),initial=pageProps({params:criteria(2)});
 const view=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:initial});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));await act(async()=>{requests[0].resolve(new Response('denied',{status:403}));});
 await waitFor(()=>expect(view.result.current.isError).toBe(true));let retry!:ReturnType<PageResult['refetch']>;
 act(()=>{retry=view.result.current.refetch();});await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 view.rerender({...initial,seedParams:criteria(2),seed:pageData([999],1,2),updatedAt:Date.now()+1});
 expect(requests[1].signal.aborted).toBe(false);expect(qc.getQueryState(pageKey(2))).toMatchObject({data:undefined,status:'pending',errorUpdateCount:1});
 await act(async()=>{requests[1].resolve(new Response('still denied',{status:403}));await retry;});
 await waitFor(()=>expect(view.result.current.isError).toBe(true));expect(view.result.current.data).toBeUndefined();expect(qc.getQueryState(pageKey(2))?.errorUpdateCount).toBe(2);expect(fetcher).toHaveBeenCalledTimes(2);
});
it('a result returned by refetch never exposes a raw handle after retirement',async()=>{
 const {qc,wrapper}=pageOwner(),{fetcher,requests}=deferredReads();
 const view=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:pageProps()});
 const retained=view.result.current.refetch;let task!:ReturnType<typeof retained>;act(()=>{task=retained();});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));let completed!:Awaited<typeof task>;
 await act(async()=>{requests[0].resolve(response(pageData([2])));completed=await task;});view.unmount();qc.clear();
 await act(async()=>{const noOp=await completed.refetch();await noOp.refetch();const direct=await retained();await direct.refetch();});
 expect(fetcher).toHaveBeenCalledTimes(1);expect(qc.getQueryState(pageKey())).toBeUndefined();
});
it('same-owner retained refresh follows current criteria through page ABA',async()=>{
 const {wrapper}=pageOwner(),{fetcher,requests}=deferredReads(),initial=pageProps();
 const view=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:initial}),retained=view.result.current.refetch;
 view.rerender({...initial,params:criteria(2)});await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 let pending!:ReturnType<typeof retained>;act(()=>{pending=retained({cancelRefetch:false});});expect(fetcher).toHaveBeenCalledTimes(1);expect(requests[0].params).toEqual(criteria(2));
 await act(async()=>{requests[0].resolve(response(pageData([2],26,2)));await pending;});
 view.rerender(initial);act(()=>{pending=retained();});await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));expect(requests[1].params).toEqual(criteria());
 await act(async()=>{requests[1].resolve(response(pageData([3])));await pending;});await waitFor(()=>expect(view.result.current.data).toEqual(pageData([3])));
});
it('retired resource handles stay retired through resource and prefix ABA',async()=>{
 const {wrapper}=pageOwner(),{fetcher,requests}=deferredReads(),a=pageProps(),b=pageProps({resource:'dms-documents',keyPrefix:['read','dms-documents'],seed:pageData([2])});
 const view=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:a}),oldA=view.result.current.refetch;
 view.rerender(b);const oldB=view.result.current.refetch;await act(async()=>{await oldA();});expect(fetcher).not.toHaveBeenCalled();
 view.rerender(a);await act(async()=>{await oldA();await oldB();});expect(fetcher).not.toHaveBeenCalled();
 let active!:ReturnType<PageResult['refetch']>;act(()=>{active=view.result.current.refetch();});await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 expect(requests[0].url).toBe('/api/reads/employees');await act(async()=>{requests[0].resolve(response(pageData([3])));await active;});
});
it('a sibling unmount retires only its handle without cancelling the shared pending read',async()=>{
 const {wrapper}=pageOwner(),{fetcher,requests}=deferredReads(),initial=pageProps({updatedAt:Date.now()-60000});
 const a=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:initial}),b=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:initial});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));const old=a.result.current.refetch;a.unmount();await act(async()=>{await old();});
 expect(requests[0].signal.aborted).toBe(false);expect(fetcher).toHaveBeenCalledTimes(1);
 await act(async()=>{requests[0].resolve(response(pageData([5])));});await waitFor(()=>expect(b.result.current.data).toEqual(pageData([5])));
});
it('keyed identity A to B to A uses new clients and never revives retired handles',async()=>{
 const {fetcher,requests}=deferredReads(),seen=new Map<string,{qc:QueryClient;read:PageResult}>(),initial=pageProps();
 function Probe({label}:{label:string}){const qc=useQueryClient(),read=useServerPage(initial);React.useEffect(()=>{seen.set(label,{qc,read});},[label,qc,read]);return null;}
 const tree=(owner:string,label:string)=><ReadCacheBoundary key={owner}><Probe label={label}/></ReadCacheBoundary>;
 const view=render(tree('a','first-a'));const a=seen.get('first-a')!;ownedClients.push(a.qc);
 view.rerender(tree('b','b'));const b=seen.get('b')!;ownedClients.push(b.qc);await act(async()=>{await a.read.refetch();});expect(fetcher).not.toHaveBeenCalled();
 view.rerender(tree('a','second-a'));const nextA=seen.get('second-a')!;ownedClients.push(nextA.qc);
 expect(nextA.qc).not.toBe(a.qc);expect(nextA.qc).not.toBe(b.qc);await act(async()=>{await a.read.refetch();await b.read.refetch();});expect(fetcher).not.toHaveBeenCalled();
 expect(a.qc.getQueryState(pageKey())).toBeUndefined();expect(b.qc.getQueryState(pageKey())).toBeUndefined();
 let pending!:ReturnType<PageResult['refetch']>;act(()=>{pending=nextA.read.refetch();});await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 await act(async()=>{requests[0].resolve(response(pageData([7])));await pending;});
});
it('StrictMode preserves admitted refetch options and retired calls still settle',async()=>{
 const {qc}=pageOwner(),{fetcher,requests}=deferredReads();
 const wrapper=({children}:{children:React.ReactNode})=><React.StrictMode><QueryClientProvider client={qc}>{children}</QueryClientProvider></React.StrictMode>;
 const view=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:pageProps()});let first!:ReturnType<PageResult['refetch']>,second!:typeof first;
 act(()=>{first=view.result.current.refetch();second=view.result.current.refetch({cancelRefetch:false});});expect(fetcher).toHaveBeenCalledTimes(1);expect(requests[0].signal.aborted).toBe(false);
 await act(async()=>{requests[0].resolve(response(pageData([8])));await first;await second;});
 let failed!:typeof first;act(()=>{failed=view.result.current.refetch({throwOnError:true});});const rejection=expect(failed).rejects.toMatchObject({status:403});
 await act(async()=>{requests[1].resolve(new Response('denied',{status:403}));await rejection;});
 const retained=view.result.current.refetch;view.unmount();await act(async()=>{await retained({throwOnError:true});});expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([['employees',invalidateHrEmployees],['dms-documents',invalidateDmsDocuments]] as const)('%s invalidation replaces active work and leaves other and inactive families alone',async(resource,invalidate)=>{
 const {qc,wrapper}=pageOwner(),{fetcher,requests}=deferredReads(),initial=pageProps({resource});
 const inactive=pageKey(2,resource),other=pageKey(1,'unrelated'),draft=['workspace','draft',1];qc.setQueryData(inactive,pageData([2],26,2));qc.setQueryData(other,pageData([99]));qc.setQueryData(draft,{keep:true});
 const view=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:initial});act(()=>invalidate(qc));await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 act(()=>invalidate(qc));await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));expect(requests[0].signal.aborted).toBe(true);
 await act(async()=>{requests[1].resolve(response(pageData([3,4])));requests[0].resolve(response(pageData([2])));});await waitFor(()=>expect(view.result.current.data?.totalCount).toBe(2));
 expect(qc.getQueryState(inactive)).toMatchObject({isInvalidated:true,fetchStatus:'idle'});expect(qc.getQueryData(inactive)).toEqual(pageData([2],26,2));
 expect(qc.getQueryState(other)?.isInvalidated).toBe(false);expect(qc.getQueryData(draft)).toEqual({keep:true});expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each(['disabled','observerless'] as const)('generic invalidation aborts %s initial work without replacement or late publication',async mode=>{
 const {qc}=pageOwner(),key=pageKey(2);let signal!:AbortSignal,finish!:()=>void;
 const read=vi.fn(({signal:s}:{signal:AbortSignal})=>new Promise<ReadPage<{id:number}>>(resolve=>{signal=s;finish=()=>resolve(pageData([99],26,2));}));
 let stop=()=>{},pending:Promise<unknown>|undefined;
 if(mode==='disabled'){const observer=new QueryObserver(qc,{queryKey:key,queryFn:read});stop=observer.subscribe(()=>{});observer.setOptions({queryKey:key,queryFn:read,enabled:false});}
 else pending=qc.fetchQuery({queryKey:key,queryFn:read}).catch(()=>undefined);
 try{act(()=>invalidateHrEmployees(qc));expect(signal.aborted).toBe(true);await act(async()=>{finish();await pending;});expect(read).toHaveBeenCalledTimes(1);expect(qc.getQueryData(key)).toBeUndefined();expect(qc.getQueryState(key)?.isInvalidated).toBe(true);}finally{stop();}
});
it('generic invalidation never recreates a removed query',()=>{
 const {qc}=pageOwner(),key=pageKey();qc.setQueryData(key,pageData([1]));qc.removeQueries({queryKey:key,exact:true});invalidateHrEmployees(qc);expect(qc.getQueryState(key)).toBeUndefined();
});
it.each([403,503])('a %s replacement failure cannot be overwritten by the cancelled initial response',async status=>{
 const {qc,wrapper}=pageOwner(),{fetcher,requests}=deferredReads();
 const view=renderHook((p:PageProps)=>useServerPage(p),{wrapper,initialProps:pageProps({params:criteria(2)})});await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 act(()=>invalidateHrEmployees(qc));await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));await act(async()=>{requests[1].resolve(new Response('failed',{status}));});
 if(status===503){await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3));await act(async()=>{requests[2].resolve(new Response('failed',{status}));});}
 await waitFor(()=>expect(view.result.current.isError).toBe(true));await act(async()=>{requests[0].resolve(response(pageData([99],26,2)));});
 expect(view.result.current.data).toBeUndefined();expect(view.result.current.isSuccess).toBe(false);expect(qc.getQueryState(pageKey(2))).toMatchObject({status:'error',isInvalidated:true});
 expect(fetcher).toHaveBeenCalledTimes(status===503?3:2);
});
