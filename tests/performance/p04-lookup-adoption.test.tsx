// @vitest-environment jsdom
import React from "react";
import {afterEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {useLookupBatchQuery,useLookupValuesQuery} from "@/hooks/lookups/use-lookup-queries";
import {prefetchLookupCategories} from "@/lib/query/prefetch-lookups";
import {queryKeys} from "@/lib/query/authorized-lookup-keys";
import {invalidateLookupCategory} from "@/lib/query/invalidation";
import {LookupSelect} from "@/components/erp/lookup-select";
const value={id:1,value_code:"ONE",value_label_en:"One",parent_value_id:null,is_active:true};
const cache=()=>new QueryClient({defaultOptions:{queries:{retryDelay:1,gcTime:0}}});
function Field({parent=null,selected=null}:{parent?:string|null;selected?:number|null}){
 const q=useLookupValuesQuery("TEST",{parentValueCode:parent,selected});
 return <div data-testid="field">{JSON.stringify({ids:q.data.map(v=>v.id),loading:q.isLoading,error:q.error})}</div>;
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("lookup saves invalidate their paged search and batches, not unrelated categories",()=>{
 const qc=cache(),a=["read","lookup-search",JSON.stringify({categoryCode:"TEST"})],b=["read","lookup-search",JSON.stringify({categoryCode:"OTHER"})];
 for(const key of [a,b,queryKeys.lookup.batch(["TEST","OTHER"]),queryKeys.lookup.values("OTHER")])qc.setQueryData(key,[]);
 invalidateLookupCategory(qc,"TEST");
 expect(qc.getQueryState(a)?.isInvalidated).toBe(true);expect(qc.getQueryState(b)?.isInvalidated).toBe(false);
 expect(qc.getQueryState(queryKeys.lookup.batch(["TEST","OTHER"]))?.isInvalidated).toBe(true);
 expect(qc.getQueryState(queryKeys.lookup.values("OTHER"))?.isInvalidated).toBe(false);qc.clear();
});
it("prefetch observes batch failure even when every individual choice key was already fresh",async()=>{
 const qc=cache();qc.setQueryDefaults(queryKeys.lookup.values("TEST"),{staleTime:300000});qc.setQueryData(queryKeys.lookup.values("TEST"),[value]);
 vi.stubGlobal("fetch",async()=>new Response("",{status:503}));
 expect((await prefetchLookupCategories(qc,["TEST"])).error).not.toBeNull();qc.clear();
});
it("a retired prefetch cannot repopulate a cleared identity cache",async()=>{
 let finish!:(r:Response)=>void;
 vi.stubGlobal("fetch",()=>new Promise<Response>(resolve=>{finish=resolve;}));
 const qc=cache();const pending=prefetchLookupCategories(qc,["TEST"]);
 await waitFor(()=>expect(finish).toBeDefined());
 await qc.cancelQueries();qc.clear();finish(Response.json({success:true,data:{TEST:[value]}}));
 expect((await pending).error).not.toBeNull();expect(qc.getQueryCache().getAll()).toHaveLength(0);
});
it("two consumers coalesce one read; an active selected value adds no request",async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json({success:true,data:[value]}));vi.stubGlobal("fetch",fetcher);
 const view=render(<QueryClientProvider client={cache()}><Field selected={1}/><Field selected={1}/></QueryClientProvider>);
 await waitFor(()=>expect(view.getAllByTestId("field")[0].textContent).toContain('"ids":[1]'));
 expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe("/api/reads/lookup-values");
});
it("a permitted missing selected value is loaded separately and cannot survive a parent change",async()=>{
 const pending:((r:Response)=>void)[]=[];
 const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{const p=JSON.parse(String(init.body));return p.parentValueCode?new Promise<Response>(resolve=>pending.push(resolve)):Response.json({success:true,data:p.selected?[{...value,id:2,is_active:false}]:[value]});});
 vi.stubGlobal("fetch",fetcher);const qc=cache(),view=render(<QueryClientProvider client={qc}><Field selected={2}/></QueryClientProvider>);
 await waitFor(()=>expect(view.getByTestId("field").textContent).toContain('"ids":[1,2]'));
 view.rerender(<QueryClientProvider client={qc}><Field parent="OTHER" selected={2}/></QueryClientProvider>);
 await waitFor(()=>expect(pending).toHaveLength(1));expect(view.getByTestId("field").textContent).toContain('"ids":[]');
 await act(async()=>pending[0](Response.json({success:true,data:[]})));await waitFor(()=>expect(pending).toHaveLength(2));
 await act(async()=>pending[1](Response.json({success:true,data:[]})));expect(view.getByTestId("field").textContent).not.toContain('"ids":[1,2]');
});
it("a transient failure is retried once and shown as failure rather than empty choices",async()=>{
 const fetcher=vi.fn(async()=>new Response("",{status:503}));vi.stubGlobal("fetch",fetcher);
 const view=render(<QueryClientProvider client={cache()}><Field/></QueryClientProvider>);
 await waitFor(()=>expect(view.getByTestId("field").textContent).toContain("could not be loaded"));expect(fetcher).toHaveBeenCalledTimes(2);
});
it("a batch already in flight is reused by fields and concurrent prefetch calls",async()=>{
 let finish!:(value:Response)=>void;const fetcher=vi.fn<typeof fetch>(()=>new Promise<Response>(resolve=>{finish=resolve;}));vi.stubGlobal("fetch",fetcher);const qc=cache();
 const first=prefetchLookupCategories(qc,["TEST"]),second=prefetchLookupCategories(qc,["TEST"]);
 render(<QueryClientProvider client={qc}><Field/></QueryClientProvider>);
 expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe("/api/reads/lookup-batch");
 await act(async()=>finish(Response.json({success:true,data:{TEST:[value]}})));
 expect((await first).error).toBeNull();expect((await second).error).toBeNull();expect(fetcher).toHaveBeenCalledTimes(1);
});
it("a denied refresh hides previously cached single-category choices without retrying",async()=>{
 let denied=false;const fetcher=vi.fn(async()=>denied?new Response("",{status:403}):Response.json({success:true,data:[value]}));vi.stubGlobal("fetch",fetcher);
 const qc=cache(),view=render(<QueryClientProvider client={qc}><Field/></QueryClientProvider>);
 await waitFor(()=>expect(view.getByTestId("field").textContent).toContain('"ids":[1]'));
 denied=true;await act(async()=>{await qc.invalidateQueries({queryKey:queryKeys.lookup.values("TEST")});});
 await waitFor(()=>expect(view.getByTestId("field").textContent).toContain("could not be verified"));
 expect(view.getByTestId("field").textContent).toContain('"ids":[]');expect(fetcher).toHaveBeenCalledTimes(2);
});
function BatchField(){const read=useLookupBatchQuery(["TEST"]);return <div data-testid="batch">{JSON.stringify({data:read.data,error:read.error})}</div>;}
it("a denied batch refresh never exposes warm cached choices",async()=>{
 let denied=false;const fetcher=vi.fn(async()=>denied?new Response("",{status:403}):Response.json({success:true,data:{TEST:[value]}}));vi.stubGlobal("fetch",fetcher);
 const qc=cache(),view=render(<QueryClientProvider client={qc}><BatchField/></QueryClientProvider>);
 await waitFor(()=>expect(view.getByTestId("batch").textContent).toContain('"TEST"'));
 denied=true;await act(async()=>{await qc.invalidateQueries({queryKey:queryKeys.lookup.batch(["TEST"])});});
 await waitFor(()=>expect(view.getByTestId("batch").textContent).toContain("could not be verified"));
 expect(view.getByTestId("batch").textContent).toContain('"data":{}');expect(fetcher).toHaveBeenCalledTimes(2);
});
it("a partial batch response never seeds absent categories as empty successful data",async()=>{
 const fetcher=vi.fn(async()=>Response.json({success:true,data:{TEST:[value]}}));vi.stubGlobal("fetch",fetcher);const qc=cache();
 const result=await prefetchLookupCategories(qc,["TEST","OTHER"]);
 expect(result.error).toContain("completely loaded");expect(result.seededCodes).toEqual([]);
 expect(qc.getQueryData(queryKeys.lookup.values("TEST"))).toBeUndefined();expect(qc.getQueryData(queryKeys.lookup.values("OTHER"))).toBeUndefined();expect(fetcher).toHaveBeenCalledTimes(2);
});
it("the actual lookup selector retains its named draft field after failure and recovers without changing it",async()=>{
 let failed=true;const fetcher=vi.fn(async()=>failed?new Response("",{status:503}):Response.json({success:true,data:[value]}));vi.stubGlobal("fetch",fetcher);
 const changed=vi.fn(),view=render(<QueryClientProvider client={cache()}><LookupSelect categoryCode="TEST" value={1} onValueChange={changed} name="tracked-lookup"/></QueryClientProvider>);
 await waitFor(()=>expect(view.getByRole("alert").textContent).toContain("not an empty result"));
 expect(view.getByRole("combobox").closest("[inert]")).toBeTruthy();expect((view.container.querySelector('input[name="tracked-lookup"]') as HTMLInputElement).value).toBe("1");
 failed=false;fireEvent.click(view.getByRole("button",{name:"Retry loading"}));
 await waitFor(()=>expect(view.queryByRole("alert")).toBeNull());expect(view.getByRole("combobox").textContent).toContain("One");expect(changed).not.toHaveBeenCalled();
});
