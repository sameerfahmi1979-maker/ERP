// @vitest-environment jsdom
import React from "react";
import "../remediation/f05/setup";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
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
import {DmsReadReady,ERPChildDialogForm} from "@/features/dms/documents/section-read-boundary";
import {ReadError} from "@/lib/reads/client";
const mocks=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("@/lib/reads/client",async original=>({...await original<typeof import("@/lib/reads/client")>(),readJson:mocks.read}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/hooks/use-workspace",()=>({useWorkspace:()=>({openTab:vi.fn()})}));
vi.mock("@/lib/supabase/server",()=>({createClient:()=>{throw Error("No server mutation allowed");}}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>{throw Error("No admin access allowed");}}));
vi.mock("next/cache",()=>({revalidatePath:()=>{throw Error("No writes");}}));
import {DmsUploadSessionTable} from "@/features/dms/upload/dms-upload-session-table";
import {DmsBatchReviewQueueClient} from "@/features/dms/upload/dms-batch-review-queue-client";
import {DmsLinkEntitySelect} from "@/features/dms/documents/dms-link-entity-select";
import {DmsApplyToErpRunHistory} from "@/features/dms/apply-to-erp/dms-apply-to-erp-run-history";
import type {DmsUploadBatchRow} from "@/server/actions/dms/batch-intake";
const batch={id:7,batch_code:"SYNTHETIC",status:"processing",total_files:1,processed_files:1} as DmsUploadBatchRow;
const factories={inbox:()=> <DmsUploadSessionTable sessions={[]} onAttach={()=>{}} onCreateDocument={()=>{}} onCancel={()=>{}}/>,batch:()=> <DmsBatchReviewQueueClient batch={batch} initialDrafts={[]}/>,links:()=> <DmsLinkEntitySelect entityType="employee" value={null} onValueChange={()=>{}}/>,history:()=> <DmsApplyToErpRunHistory documentId={9}/>};
type Kind=keyof typeof factories;
const wrap=(client:QueryClient,kind:Kind,identity="first")=><FluentProvider theme={webLightTheme}><OwnedFixture handle={client}><WorkspaceUiMemoryProvider><React.Fragment key={identity}>{factories[kind]()}</React.Fragment></WorkspaceUiMemoryProvider></OwnedFixture></FluentProvider>;
const makeClient=fixtureClient;
const empty=(kind:Kind)=>({success:true,data:kind==="inbox"?{rows:[],totalCount:0,page:1,pageSize:25}:kind==="history"?{runs:[],total:0}:[]});
const safeError=()=>screen.findByText(/Could not load|could not be loaded|Could not load permitted/);
beforeEach(()=>{mocks.read.mockReset();});
afterEach(()=>{cleanup();ownedCaches.forEach(cache=>cache.clear());ownedCaches.clear();});
for(const kind of Object.keys(factories) as Kind[]){
 it(kind+" forwards cancellation and aborts when retired",async()=>{mocks.read.mockReturnValue(new Promise(()=>{}));const view=render(wrap(makeClient(),kind));await waitFor(()=>expect(mocks.read).toHaveBeenCalledOnce());const signal=mocks.read.mock.calls[0][2] as AbortSignal;expect(signal.aborted).toBe(false);view.unmount();expect(signal.aborted).toBe(true);});
 it(kind+" denies once without automatic access retries, then allows explicit recovery",async()=>{mocks.read.mockRejectedValue(new ReadError("Denied",403));render(wrap(makeClient(),kind));await safeError();expect(mocks.read).toHaveBeenCalledOnce();mocks.read.mockResolvedValue(empty(kind));fireEvent.click(screen.getByRole("button",{name:/Retry/i}));await waitFor(()=>expect(mocks.read).toHaveBeenCalledTimes(2));await waitFor(()=>expect(screen.queryByText(/Could not load|could not be loaded/)).toBeNull());});
 it(kind+" prevents an old account's late result populating a replacement cache",async()=>{let finish!:(value:unknown)=>void;mocks.read.mockReturnValueOnce(new Promise(r=>{finish=r;})).mockRejectedValue(new ReadError("Denied",403));const first=makeClient(),second=makeClient(),view=render(wrap(first,kind));await waitFor(()=>expect(mocks.read).toHaveBeenCalledOnce());const signal=mocks.read.mock.calls[0][2] as AbortSignal;view.rerender(wrap(second,kind,"second"));await safeError();expect(signal.aborted).toBe(true);await act(async()=>finish(empty(kind)));expect(second.getQueryCache().getAll().every(q=>q.state.data===undefined)).toBe(true);});
}
it("inbox page change uses server paging and retires actions during loading",async()=>{
 const row={id:1,session_code:"SYN-1",original_filename:"SYNTHETIC.pdf",status:"uploaded",uploaded_at:"2026-10-13T08:00:00Z",expires_at:"2026-10-14T08:00:00Z",mime_type:"application/pdf",file_size_bytes:12};
 mocks.read.mockResolvedValueOnce({success:true,data:{rows:Array.from({length:25},(_,i)=>({...row,id:i+1,session_code:`SYN-${i+1}`,original_filename:`SYNTHETIC-${i+1}.pdf`})),totalCount:26,page:1,pageSize:25}}).mockReturnValue(new Promise(()=>{}));render(wrap(makeClient(),"inbox"));
 await screen.findByText("SYNTHETIC-1.pdf");fireEvent.click(screen.getByRole("button",{name:"Next"}));await waitFor(()=>expect(mocks.read).toHaveBeenCalledTimes(2));expect(mocks.read.mock.calls[1][1]).toMatchObject({page:2,pageSize:25});expect(screen.queryByText("SYNTHETIC-1.pdf")).toBeNull();
});
it("inbox reports a failed recheck to retire external portals",async()=>{
 const available=vi.fn();mocks.read.mockResolvedValue(empty("inbox"));const c=makeClient();
 render(<OwnedFixture handle={c}><WorkspaceUiMemoryProvider><DmsUploadSessionTable sessions={[]} onAttach={()=>{}} onCreateDocument={()=>{}} onCancel={()=>{}} onReadAvailable={available}/></WorkspaceUiMemoryProvider></OwnedFixture>);
 await waitFor(()=>expect(available).toHaveBeenLastCalledWith(true));mocks.read.mockRejectedValue(new ReadError("Denied",403));await act(async()=>{await c.invalidateQueries();});
 await waitFor(()=>expect(available).toHaveBeenLastCalledWith(false));
});
it("shared DMS dialog pauses its portal and retains input across denied parent reads",async()=>{
 function Draft(){const [value,setValue]=React.useState("");return <ERPChildDialogForm open title="Synthetic draft" onOpenChange={()=>{}} onSubmit={()=>{}}><input aria-label="Synthetic input" value={value} onChange={e=>setValue(e.target.value)}/></ERPChildDialogForm>;}
 const view=(ready:boolean)=><DmsReadReady value={ready}><Draft/></DmsReadReady>;
 const ui=render(view(true));fireEvent.change(screen.getByLabelText("Synthetic input"),{target:{value:"Retained"}});
 ui.rerender(view(false));expect(screen.queryByRole("dialog")).toBeNull();
 ui.rerender(view(true));expect((screen.getByLabelText("Synthetic input") as HTMLInputElement).value).toBe("Retained");
});
