// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {type QueryClient,useQueryClient} from "@tanstack/react-query";
import {ReadCacheBoundary,type ReadCacheIdentity} from "@/components/layout/read-cache-boundary";
import {FluentProvider,webLightTheme} from "@fluentui/react-components";

// Only the application boundary creates the cache. This handle exposes that
// actual cache for assertions and controlled invalidation, never injection.
const fixtureOwners=new WeakMap<QueryClient,{identity:ReadCacheIdentity;updatedAt:number;current?:QueryClient;queued:((cache:QueryClient)=>void)[]}>();
const ownedCaches=new Set<QueryClient>();
let fixtureSequence=0;
function fixtureClient():QueryClient{
 const owner:{identity:ReadCacheIdentity;updatedAt:number;current?:QueryClient;queued:((cache:QueryClient)=>void)[]}={identity:{authUserId:`synthetic-dms-${++fixtureSequence}`,scopeVersion:"scope-one"},updatedAt:Date.now(),queued:[]};
 const handle=new Proxy({} as QueryClient,{get(_target,key){
  if(!owner.current){
   if(key==="setQueryData")return(...args:Parameters<QueryClient["setQueryData"]>)=>{owner.queued.push(cache=>{cache.setQueryData(...args);});};
   throw Error("Mount the owned boundary before inspecting its cache");
  }
  const value=Reflect.get(owner.current,key);return typeof value==="function"?value.bind(owner.current):value;
 }});
 fixtureOwners.set(handle,owner);return handle;
}
function CacheProbe({handle,children}:{handle:QueryClient;children:React.ReactNode}){
 const current=useQueryClient(),owner=fixtureOwners.get(handle)!;
 if(owner.current!==current){owner.current=current;current.setDefaultOptions({queries:{retry:false,retryDelay:0,gcTime:Infinity},mutations:{retry:false}});ownedCaches.add(current);owner.queued.splice(0).forEach(prepare=>prepare(current));}
 return <>{children}</>;
}
function OwnedFixture({handle,children}:{handle:QueryClient;children:React.ReactNode}){
 return <ReadCacheBoundary {...fixtureOwners.get(handle)!.identity}><CacheProbe handle={handle}>{children}</CacheProbe></ReadCacheBoundary>;
}

import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
const mocks=vi.hoisted(()=>({restore:vi.fn()}));
vi.mock("@/hooks/use-workspace",()=>({useWorkspace:()=>({openTab:vi.fn()})}));
vi.mock("@/hooks/realtime/use-realtime-sync",()=>({useRealtimeSync:()=>{}}));
vi.mock("@/server/actions/dms/documents",()=>({unarchiveDmsDocument:mocks.restore}));
import {DmsArchiveTable} from "@/features/dms/archive/dms-archive-table";
import type {ArchivedDocumentRow} from "@/server/actions/dms/documents";
const first={id:889001,document_no:"PERF-ARCH00001",title:"Synthetic archived first",status:"archived",reason:"archived",updated_at:"2026-10-01T00:00:00Z",document_type:{name_en:"Synthetic type"}} as ArchivedDocumentRow;
const next={...first,id:889026,document_no:"PERF-ARCH00026",title:"Synthetic next page"};
const pageRows=(base:ArchivedDocumentRow)=>Array.from({length:25},(_,i)=>i?{...base,id:base.id+i,document_no:base.document_no+"-"+i,title:base.title+" "+i}:base);
function wrap(client:QueryClient,visible=true){
 const owner=fixtureOwners.get(client)!;
 const initialSeed={identity:owner.identity,params:{page:1,pageSize:25,sortKey:"updated_at",sortDir:"desc",search:"",columnFilters:{}},data:{rows:pageRows(first),totalCount:1107,page:1,pageSize:25},updatedAt:owner.updatedAt};
 return <FluentProvider theme={webLightTheme}><WorkspaceUiMemoryProvider><OwnedFixture handle={client}>{visible&&<DmsArchiveTable initialSeed={initialSeed} initialDocuments={initialSeed.data.rows} initialTotal={1107} initialUpdatedAt={initialSeed.updatedAt} categories={[]} documentTypes={[]} canUnarchive />}</OwnedFixture></WorkspaceUiMemoryProvider></FluentProvider>;}
const client=fixtureClient;
afterEach(()=>{cleanup();ownedCaches.forEach(cache=>cache.clear());ownedCaches.clear();vi.unstubAllGlobals();vi.clearAllMocks();});
it("matching server page is reused and next-page requests keep the exact total",async()=>{
 const fetcher=vi.fn(async(_url:unknown,init:RequestInit)=>{const p=JSON.parse(String(init.body));return Response.json({success:true,data:{rows:pageRows(next),totalCount:1107,page:p.page,pageSize:p.pageSize}});});vi.stubGlobal("fetch",fetcher);
 render(wrap(client()));await act(async()=>{await new Promise(resolve=>setTimeout(resolve,70));});expect(fetcher).not.toHaveBeenCalled();expect(screen.getByText("Synthetic archived first")).toBeTruthy();
 fireEvent.click(screen.getByTitle("Next page"));await screen.findByText("Synthetic next page");
 expect(JSON.parse(String(fetcher.mock.calls[0][1].body)).page).toBe(2);expect(screen.getByText("1107 documents")).toBeTruthy();
});
it("the existing Edit filters control sends complete-result criteria and resets the server page",async()=>{
 const fetcher=vi.fn(async(_url:unknown,init:RequestInit)=>{const p=JSON.parse(String(init.body));return Response.json({success:true,data:{rows:p.columnFilters.title?[next]:pageRows(next),totalCount:p.columnFilters.title?1:1107,page:p.page,pageSize:p.pageSize}});});vi.stubGlobal("fetch",fetcher);
 render(wrap(client()));fireEvent.click(screen.getByTitle("Next page"));await screen.findByText("Synthetic next page");
 fireEvent.click(screen.getByRole("button",{name:"Edit filters"}));expect(screen.getByText(/complete permitted result/)).toBeTruthy();fireEvent.change(screen.getByLabelText("Title"),{target:{value:"next page"}});fireEvent.click(screen.getByRole("button",{name:"Apply"}));
 await waitFor(()=>expect(screen.getByText("1 document")).toBeTruthy());const sent=JSON.parse(String(fetcher.mock.calls.at(-1)?.[1].body));expect(sent.page).toBe(1);expect(sent.columnFilters.title).toBe("next page");expect(screen.queryByText(/loaded records match/)).toBeNull();
});
it("a denied refresh hides warm archive rows and shows retry, never a false empty success",async()=>{
 const fetcher=vi.fn(async()=>Response.json({success:false,error:"Permission denied"},{status:403}));vi.stubGlobal("fetch",fetcher);
 const cache=client();render(wrap(cache));expect(screen.getByText("Synthetic archived first")).toBeTruthy();
 await act(async()=>{await cache.invalidateQueries({queryKey:["read","dms-archive"]});});await screen.findByRole("alert");
 expect(screen.queryByText("Synthetic archived first")).toBeNull();expect(screen.getByRole("button",{name:"Retry archive"})).toBeTruthy();expect(screen.queryByText("No archived or renewed documents yet.")).toBeNull();expect(fetcher).toHaveBeenCalledTimes(1);
});
it("returning to the same workspace preserves the matching page without a duplicate read",async()=>{
 const fetcher=vi.fn(async(_url:unknown,init:RequestInit)=>{const p=JSON.parse(String(init.body));return Response.json({success:true,data:{rows:pageRows(next),totalCount:1107,page:p.page,pageSize:p.pageSize}});});vi.stubGlobal("fetch",fetcher);
 const cache=client(),view=render(wrap(cache));fireEvent.click(screen.getByTitle("Next page"));await screen.findByText("Synthetic next page");expect(fetcher).toHaveBeenCalledTimes(1);
 view.rerender(wrap(cache,false));view.rerender(wrap(cache));await screen.findByText("Synthetic next page");expect(screen.getByText("2 / 45")).toBeTruthy();expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([true,false])("confirmed restore invalidates sibling lists and summaries only on success=%s",async success=>{
 mocks.restore.mockResolvedValue({success,error:success?undefined:"Not restored"});
 const fetcher=vi.fn(async()=>Response.json({success:true,data:{rows:[],totalCount:0,page:1,pageSize:25}}));vi.stubGlobal("fetch",fetcher);
 const cache=client(),keys=[["read","dms-documents","page2"],["dms","documents",first.id],["dms","dashboard"],["dms","expiry"]];
 for(const key of keys)cache.setQueryData(key,{synthetic:true});
 render(wrap(cache));fireEvent.click(screen.getAllByRole("button",{name:"Restore to All Documents"})[0]);
 await waitFor(()=>expect(mocks.restore).toHaveBeenCalledWith(first.id));
 await waitFor(()=>expect(cache.getQueryState(keys[0])?.isInvalidated).toBe(success));
 for(const key of keys)expect(cache.getQueryState(key)?.isInvalidated).toBe(success);
 if(success)await waitFor(()=>expect(screen.getByText("No archived or renewed documents yet.")).toBeTruthy());else expect(fetcher).not.toHaveBeenCalled();
});
