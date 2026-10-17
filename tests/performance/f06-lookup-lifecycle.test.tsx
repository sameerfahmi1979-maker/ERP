// @vitest-environment jsdom
// Actual hooks, controls and existing cache retirement ports. Synthetic HTTP only.
import "../remediation/f05/setup";
import React from "react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {prefetchLookupCategories} from "@/lib/query/prefetch-lookups";
import {clearPrivateCaches,registerPrivateCache} from "@/lib/query/private-cache";
import {queryKeys} from "@/lib/query/authorized-lookup-keys";
import {queryKeys as legacyQueryKeys} from "@/lib/query/query-keys";
import {useLookupBatchQuery,useLookupValuesQuery} from "@/hooks/lookups/use-lookup-queries";
import {LookupSelect} from "@/components/erp/lookup-select";

const value={id:1,category_id:1,value_code:"ONE",value_label_en:"Synthetic one",value_label_ar:"اختيار تجريبي",parent_value_id:null,is_active:true};
const clients:QueryClient[]=[];
const unregisters:(()=>void)[]=[];
function cache() {
  const client=new QueryClient({defaultOptions:{queries:{staleTime:60000,retryDelay:1,gcTime:0}}});
  clients.push(client);return client;
}
beforeEach(()=>vi.stubGlobal("fetch",vi.fn(()=>{throw Error("Unexpected network in L0 offline test");})));
afterEach(()=>{
  cleanup();for(const unregister of unregisters.splice(0))unregister();
  clearPrivateCaches();for(const client of clients.splice(0))client.clear();
  vi.unstubAllGlobals();vi.restoreAllMocks();
});
const response=(data:unknown)=>Response.json({success:true,data});

it("prefetch commits via query ownership only and reports normalized complete/empty categories without imperative reseeding",async()=>{
  const fetcher=vi.fn(async()=>response({TEST:[value],EMPTY:[]}));vi.stubGlobal("fetch",fetcher);
  const qc=cache(),write=vi.spyOn(qc,"setQueryData");
  const result=await prefetchLookupCategories(qc,[" test ","EMPTY","TEST"]);
  expect(result).toEqual({requestedCodes:["EMPTY","TEST"],seededCodes:["TEST"],missingCodes:["EMPTY"],seededCount:1,error:null});
  expect(qc.getQueryData(queryKeys.lookup.values("TEST"))).toEqual([value]);
  expect(qc.getQueryData(queryKeys.lookup.values("EMPTY"))).toEqual([]);
  expect(qc.getQueryData(legacyQueryKeys.lookup.values("TEST"))).toBeUndefined();
  expect(write).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledOnce();
});
it("retirement immediately after the individual query commits cannot be undone by the later prefetch continuation",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>response({TEST:[value]})));
  const old=cache(),replacement=cache(),unregister=registerPrivateCache(old);
  let retired=false;
  const stop=old.getQueryCache().subscribe(event=>{
    if(!retired&&event.type==="updated"&&event.action.type==="success"&&event.query.queryKey[1]==="values"){
      retired=true;unregister();
      replacement.setQueryData(["replacement"],"new actor");
    }
  });
  const result=await prefetchLookupCategories(old,["TEST"]);
  stop();
  expect(retired).toBe(true);
  expect(result.requestedCodes).toEqual(["TEST"]);
  expect(old.getQueryCache().getAll()).toHaveLength(0);
  expect(replacement.getQueryData(queryKeys.lookup.values("TEST"))).toBeUndefined();
  expect(replacement.getQueryData(["replacement"])).toBe("new actor");
});
it.each(["clear","unregister"] as const)("%s cancels a pending batch and prevents ignored-abort late results refilling either identity",async retirement=>{
  let finish!:(r:Response)=>void,signal!:AbortSignal;
  const fetcher=vi.fn((_url:string,init:RequestInit)=>{signal=init.signal as AbortSignal;return new Promise<Response>(resolve=>{finish=resolve;});});
  vi.stubGlobal("fetch",fetcher);
  const old=cache(),fresh=cache(),unregister=registerPrivateCache(old);unregisters.push(unregister);
  const pending=prefetchLookupCategories(old,["TEST"]);
  expect(fetcher).toHaveBeenCalledOnce();
  if(retirement==="clear")clearPrivateCaches();else unregister();
  expect(signal.aborted).toBe(true);
  fresh.setQueryData(["new-owner"],"new");
  finish(response({TEST:[value]}));
  const receipt=await pending;
  await Promise.resolve();
  expect(receipt.error).not.toBeNull();
  expect(old.getQueryCache().getAll()).toHaveLength(0);
  expect(fresh.getQueryData(queryKeys.lookup.values("TEST"))).toBeUndefined();
  expect(fresh.getQueryData(["new-owner"])).toBe("new");
});
function Field({parent=null,selected=2}:{parent?:string|null;selected?:number|null}) {
  const query=useLookupValuesQuery("TEST",{parentValueCode:parent,selected});
  return <p data-testid="state">{JSON.stringify({ids:query.data.map(row=>row.id),error:query.error})}</p>;
}
it("a late historical selection cannot reappear under a changed parent, even when its transport ignores abort",async()=>{
  let finish!:(r:Response)=>void,oldSignal!:AbortSignal;
  const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{
    const input=JSON.parse(String(init.body));
    if(input.parentValueCode)return response([]);
    if(input.selected){oldSignal=init.signal as AbortSignal;return new Promise<Response>(resolve=>{finish=resolve;});}
    return response([value]);
  });
  vi.stubGlobal("fetch",fetcher);
  const qc=cache(),view=render(<QueryClientProvider client={qc}><Field/></QueryClientProvider>);
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
  view.rerender(<QueryClientProvider client={qc}><Field parent="NEW"/></QueryClientProvider>);
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(4));
  expect(oldSignal.aborted).toBe(true);
  await act(async()=>finish(response([{...value,id:2,is_active:false}])));
  expect(view.getByTestId("state").textContent).toContain('"ids":[]');
  expect(view.getByTestId("state").textContent).not.toContain('"ids":[1,2]');
});
it("denied selected refresh masks warm active and selected rows without losing the named draft ID",async()=>{
  let denied=false;
  const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{
    const input=JSON.parse(String(init.body));
    return input.selected ? denied?new Response("",{status:403}):response([{...value,id:2,value_code:"TWO",value_label_en:"Historical",is_active:false}]) : response([value]);
  });
  vi.stubGlobal("fetch",fetcher);
  const qc=cache(),changed=vi.fn();
  const view=render(<QueryClientProvider client={qc}><LookupSelect categoryCode="TEST" value={2} name="retained-id" onValueChange={changed}/></QueryClientProvider>);
  await waitFor(()=>expect(view.getByRole("combobox").textContent).toContain("Historical"));
  denied=true;
  await act(async()=>{await qc.invalidateQueries({queryKey:[...queryKeys.lookup.values("TEST"),"selected","id",2]});});
  await waitFor(()=>expect(view.getByRole("alert").textContent).toContain("not an empty result"));
  expect((view.container.querySelector('input[name="retained-id"]') as HTMLInputElement).value).toBe("2");
  expect(view.getByRole("combobox").closest("[inert]")).not.toBeNull();
  expect(changed).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(3);
});
it("selected-only inactive data is display context, not an enabled new active choice",async()=>{
  vi.stubGlobal("fetch",vi.fn(async(_url:string,init:RequestInit)=>JSON.parse(String(init.body)).selected?response([{...value,id:2,value_label_en:"Historical",is_active:false}]):response([value])));
  const changed=vi.fn(),view=render(<QueryClientProvider client={cache()}><LookupSelect categoryCode="TEST" value={2} onValueChange={changed}/></QueryClientProvider>);
  await waitFor(()=>expect(view.getByRole("combobox").textContent).toContain("Historical"));
  fireEvent.click(view.getByRole("combobox"));
  expect(view.getByRole("option",{name:"Historical"}).getAttribute("aria-disabled")).toBe("true");
  expect(changed).not.toHaveBeenCalled();
});
it("code-valued historical drafts and Arabic labels survive failure/retry without numeric conversion",async()=>{
  let failed=true;
  vi.stubGlobal("fetch",vi.fn(async()=>failed?new Response("",{status:503}):response([value])));
  const changed=vi.fn(),view=render(<QueryClientProvider client={cache()}><LookupSelect categoryCode="TEST" valueField="code" value="ONE" language="ar" name="retained-code" onValueChange={changed}/></QueryClientProvider>);
  await waitFor(()=>expect(view.getByRole("alert")).toBeTruthy());
  expect((view.container.querySelector('input[name="retained-code"]') as HTMLInputElement).value).toBe("ONE");
  failed=false;fireEvent.click(view.getByRole("button",{name:"Retry loading"}));
  await waitFor(()=>expect(view.queryByRole("alert")).toBeNull());
  expect(view.getByRole("combobox").textContent).toContain("اختيار تجريبي");
  expect(changed).not.toHaveBeenCalled();
});
it("malformed selected rows are a bounded failed read rather than an empty success",async()=>{
  const fetcher=vi.fn(async(_url:string,init:RequestInit)=>response(JSON.parse(String(init.body)).selected?{}:[value]));vi.stubGlobal("fetch",fetcher);
  const view=render(<QueryClientProvider client={cache()}><Field/></QueryClientProvider>);
  await waitFor(()=>expect(JSON.parse(view.getByTestId("state").textContent!)).toEqual({ids:[1],error:"Failed to load lookup values"}));
  expect(fetcher).toHaveBeenCalledTimes(3);
  const requests=fetcher.mock.calls.map(([,init])=>JSON.parse(String(init.body)));
  expect(requests.filter(input=>input.selected===2)).toHaveLength(2);
  expect(requests.filter(input=>!input.selected)).toHaveLength(1);
});
function BatchField() {
  const query=useLookupBatchQuery(["TEST","OTHER"]);
  return <p data-testid="batch">{JSON.stringify({data:query.data,error:query.error})}</p>;
}
it("mounted batch consumers reject a partial response rather than inventing an absent category",async()=>{
  const fetcher=vi.fn(async()=>response({TEST:[value]}));vi.stubGlobal("fetch",fetcher);
  const view=render(<QueryClientProvider client={cache()}><BatchField/></QueryClientProvider>);
  await waitFor(()=>expect(view.getByTestId("batch").textContent).toContain("Failed to load"));
  expect(view.getByTestId("batch").textContent).toContain('"data":{}');expect(fetcher).toHaveBeenCalledTimes(2);
});
it("lookup normalization changes no unrelated key namespace",()=>{
  expect(queryKeys.lookup.values(" test ")).toEqual(queryKeys.lookup.values("TEST"));
  expect(queryKeys.lookup.batch([" test ","TEST","OTHER"])).toEqual(queryKeys.lookup.batch(["OTHER","TEST"]));
  expect(queryKeys.lookup.values(" test "," parent ")).toEqual(["authorized-lookup","values","TEST","PARENT",false]);
  expect(queryKeys.lookup.values("TEST")).not.toEqual(legacyQueryKeys.lookup.values("TEST"));
  expect(legacyQueryKeys.lookup.values(" test ")).toEqual(legacyQueryKeys.lookup.values("TEST"));
  expect(legacyQueryKeys.lookup.batch([" test ","TEST","OTHER"])).toEqual(legacyQueryKeys.lookup.batch(["OTHER","TEST"]));
  expect(legacyQueryKeys.lookup.values(" test "," parent ")).toEqual(["lookup","values","TEST"," parent ",false]);
  expect(legacyQueryKeys.countries()).toEqual(["master","countries",false,false]);
});


// Regression evidence for independent L0 review: retry continuations and portaled choices.
it.each(["clear","unregister","scope-replacement"] as const)("%s during mounted retry cannot dispatch a selected read after retirement",async retirement=>{
  const old=cache(),fresh=cache(),primaryKey=queryKeys.lookup.values("TEST");
  const selectedKey=[...primaryKey,"selected","id",2];
  old.setQueryData(primaryKey,[value]);
  old.setQueryData(selectedKey,[{...value,id:2,value_label_en:"Historical",is_active:false}]);
  // The unrelated sentinel has no observer; do not let the test's gcTime:0
  // remove it before the preservation assertion can check replacement safety.
  fresh.setQueryDefaults(["replacement-owner"],{gcTime:Infinity});
  fresh.setQueryData(["replacement-owner"],"untouched");
  let retry!:()=>Promise<unknown>,pending!:Promise<unknown>,unregister!:()=>void,retired=false;
  const finishes:(()=>void)[]=[],signals:AbortSignal[]=[],lateRequests:string[]=[];
  const fetcher=vi.fn((_url:string,init:RequestInit)=>{
    const input=JSON.parse(String(init.body));
    if(retired){lateRequests.push(input.selected?"selected":"primary");return Promise.resolve(response([{...value,id:999}]));}
    signals.push(init.signal as AbortSignal);
    return new Promise<Response>(resolve=>{finishes.push(()=>resolve(response(input.selected?[{...value,id:2,is_active:false}]:[value])));});
  });
  vi.stubGlobal("fetch",fetcher);
  function RetryField(){
    const query=useLookupValuesQuery("TEST",{selected:2});
    React.useLayoutEffect(()=>{retry=query.refetch;},[query.refetch]);
    return <p>{query.data.map(row=>row.id).join(",")}</p>;
  }
  function Registered({client,children}:{client:QueryClient;children:React.ReactNode}){
    React.useLayoutEffect(()=>{const dispose=registerPrivateCache(client);unregister=dispose;return dispose;},[client]);
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  const view=render(<Registered client={old}><RetryField/></Registered>);
  expect(fetcher).not.toHaveBeenCalled();
  act(()=>{pending=retry();});
  expect(fetcher.mock.calls.length).toBeGreaterThan(0);
  retired=true;
  act(()=>{
    if(retirement==="clear")clearPrivateCaches();
    if(retirement==="unregister")unregister();
    if(retirement==="scope-replacement")view.rerender(<Registered client={fresh}><p>Replacement owner</p></Registered>);
    else view.unmount();
  });
  expect(signals.every(signal=>signal.aborted)).toBe(true);
  await act(async()=>{for(const finish of finishes)finish();await pending;});
  expect(lateRequests).toEqual([]);
  expect(old.getQueryCache().getAll()).toHaveLength(0);
  expect(fresh.getQueryData(primaryKey)).toBeUndefined();
  expect(fresh.getQueryData(selectedKey)).toBeUndefined();
  expect(fresh.getQueryData(["replacement-owner"])).toBe("untouched");
});
it("mounted retry still refreshes both primary and missing selected context",async()=>{
  const qc=cache(),primaryKey=queryKeys.lookup.values("TEST"),selectedKey=[...primaryKey,"selected","id",2];
  qc.setQueryData(primaryKey,[value]);qc.setQueryData(selectedKey,[{...value,id:2,value_label_en:"Old historical",is_active:false}]);
  let retry!:()=>Promise<unknown>;
  const fetcher=vi.fn(async(_url:string,init:RequestInit)=>response(JSON.parse(String(init.body)).selected?[{...value,id:2,value_label_en:"Refreshed historical",is_active:false}]:[{...value,value_label_en:"Refreshed active"}]));
  vi.stubGlobal("fetch",fetcher);
  function RetryField(){const query=useLookupValuesQuery("TEST",{selected:2});React.useLayoutEffect(()=>{retry=query.refetch;},[query.refetch]);return <p>{query.data.map(row=>row.value_label_en).join(",")}</p>;}
  const view=render(<QueryClientProvider client={qc}><RetryField/></QueryClientProvider>);
  await act(async()=>{await retry();});
  await waitFor(()=>expect(view.container.textContent).toContain("Refreshed historical"));
  expect(view.container.textContent).toContain("Refreshed active");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each(["id","code"] as const)("already-open portaled %s choices cannot change the retained draft after a503 and recover on explicit retry",async valueField=>{
  const second={...value,id:2,value_code:"TWO",value_label_en:"Synthetic two"};
  let failed=false;
  vi.stubGlobal("fetch",vi.fn(async()=>failed?new Response("",{status:503}):response([value,second])));
  const qc=cache(),changed=vi.fn(),dirty=vi.fn();
  function Draft(){
    const [selected,setSelected]=React.useState<string|number|null>(valueField==="id"?1:"ONE");
    return <LookupSelect categoryCode="TEST" valueField={valueField} value={selected} name="retained-choice" allowClear onValueChange={next=>{changed(next);setSelected(next);}}/>;
  }
  const view=render(<QueryClientProvider client={qc}><Draft/></QueryClientProvider>);
  await waitFor(()=>expect(view.getByRole("combobox",{name:"retained-choice"}).textContent).toContain("Synthetic one"));
  view.container.addEventListener("change",dirty);
  fireEvent.click(view.getByRole("combobox",{name:"retained-choice"}));
  const openOption=view.getByRole("option",{name:"Synthetic two"});
  expect(view.container.contains(openOption)).toBe(false); // Actual Radix portal, not a mocked select.
  failed=true;
  await act(async()=>{await qc.invalidateQueries({queryKey:queryKeys.lookup.values("TEST"),exact:true});});
  await waitFor(()=>expect(view.getByRole("alert")).toBeTruthy());
  fireEvent.click(view.getByRole("option",{name:"Synthetic two"}));
  expect(changed).not.toHaveBeenCalled();
  expect(dirty).not.toHaveBeenCalled();
  expect(view.getByRole("option",{name:"Synthetic two"}).getAttribute("aria-disabled")).toBe("true");
  expect((view.getByRole("combobox",{name:"retained-choice"}) as HTMLButtonElement).disabled).toBe(true);
  const search=view.getByPlaceholderText("Search...");
  fireEvent.keyDown(search,{key:"ArrowDown"});
  fireEvent.keyDown(search,{key:"Enter"});
  expect(changed).not.toHaveBeenCalled();expect(dirty).not.toHaveBeenCalled();
  expect((view.container.querySelector('input[name="retained-choice"]') as HTMLInputElement).value).toBe(valueField==="id"?"1":"ONE");
  failed=false;fireEvent.click(view.getByRole("button",{name:"Retry loading"}));
  await waitFor(()=>expect(view.queryByRole("alert")).toBeNull());
  expect((view.getByRole("combobox",{name:"retained-choice"}) as HTMLButtonElement).disabled).toBe(false);
  if(!view.queryByRole("option",{name:"Synthetic two"}))fireEvent.click(view.getByRole("combobox",{name:"retained-choice"}));
  fireEvent.click(view.getByRole("option",{name:"Synthetic two"}));
  expect(changed).toHaveBeenCalledExactlyOnceWith(valueField==="id"?2:"TWO");
  expect(dirty).toHaveBeenCalledTimes(1);
  expect((view.container.querySelector('input[name="retained-choice"]') as HTMLInputElement).value).toBe(valueField==="id"?"2":"TWO");
  view.container.removeEventListener("change",dirty);
});
