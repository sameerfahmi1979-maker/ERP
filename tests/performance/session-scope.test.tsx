// @vitest-environment jsdom
import React from "react";
import {afterEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,waitFor} from "@testing-library/react";
import {QueryClient} from "@tanstack/react-query";
import {registerPrivateCache} from "@/lib/query/private-cache";
const state=vi.hoisted(()=>({clear:vi.fn(),unsubscribe:vi.fn(),onAuth:null as null|((event:string,session:{user:{id:string}}|null)=>void)}));
vi.mock("@/lib/auth/client-session",async importOriginal=>{
 const actual=await importOriginal<typeof import("@/lib/auth/client-session")>();
 return {...actual,clearIdentityWorkspace:()=>{state.clear();actual.clearIdentityWorkspace();}};
});
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({auth:{onAuthStateChange:(callback:typeof state.onAuth)=>{state.onAuth=callback;return{data:{subscription:{unsubscribe:state.unsubscribe}}};}}})}));
import {SessionBoundary} from "@/components/layout/session-boundary";
const registrations:(()=>void)[]=[];
afterEach(()=>{cleanup();registrations.splice(0).forEach(dispose=>dispose());vi.unstubAllGlobals();vi.clearAllMocks();state.onAuth=null;localStorage.clear();});

function navigationProbe(){
 const domWindow=window,location={replace:vi.fn(),reload:vi.fn()};
 vi.stubGlobal("window",new Proxy(domWindow,{get(target,key){if(key==="location")return location;const value=Reflect.get(target,key,target);return ["addEventListener","removeEventListener","setInterval","clearInterval"].includes(String(key))?value.bind(target):value;}}));
 return{domWindow,location};
}
function warmOwnedCache(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});registrations.push(registerPrivateCache(client));
 client.setQueryData(["synthetic-private-rows"],[{id:1,sensitive:"synthetic-only"}]);
 localStorage.setItem("algt_erp_workspace_old-account","tracked synthetic draft");localStorage.setItem("unrelated-preference","keep");
 return client;
}
it("late verification from a disposed account cannot clear the replacement account cache",async()=>{
 let finish!:(r:Response)=>void;const fetcher=vi.fn<typeof fetch>(()=>new Promise<Response>(resolve=>{finish=resolve;}));vi.stubGlobal("fetch",fetcher);
 const view=render(<SessionBoundary authUserId="old" scopeVersion="scope-old"><p>Old</p></SessionBoundary>);
 fireEvent(window,new Event("focus"));await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 const signal=fetcher.mock.calls[0][1]?.signal as AbortSignal;
 view.rerender(<SessionBoundary authUserId="new" scopeVersion="scope-new"><p>New</p></SessionBoundary>);expect(signal.aborted).toBe(true);
 await act(async()=>finish(Response.json({authUserId:"old",active:true,scopeVersion:"different-old"})));
 expect(state.clear).not.toHaveBeenCalled();expect(view.getByText("New")).toBeTruthy();expect(state.unsubscribe).toHaveBeenCalledTimes(1);
});
it("an unverifiable session masks business content rather than leaving warm confidential rows visible",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>new Response("",{status:503})));
 const view=render(<SessionBoundary authUserId="same" scopeVersion="scope"><p>Synthetic confidential rows</p></SessionBoundary>);
 fireEvent(window,new Event("focus"));await waitFor(()=>expect(view.getByRole("alert").textContent).toContain("verification"));expect(view.queryByText("Synthetic confidential rows")).toBeNull();
});

it.each([
 ["role revocation",{authUserId:"same",active:true,scopeVersion:"role-revoked"},"reload"],
 ["scope narrowing",{authUserId:"same",active:true,scopeVersion:"branch-narrowed"},"reload"],
 ["new scope grant",{authUserId:"same",active:true,scopeVersion:"grant-added"},"reload"],
 ["suspension",{authUserId:"same",active:false,scopeVersion:"scope"},"/account-disabled"],
 ["forced password change",{authUserId:"same",active:true,requiredChange:true,scopeVersion:"scope"},"/change-password-required"],
 ["replacement account",{authUserId:"another",active:true,scopeVersion:"scope"},"/login"],
])("%s masks rows and clears registered warm caches and only identity-owned drafts",async(_label,response,destination)=>{
 const{domWindow,location}=navigationProbe(),client=warmOwnedCache();
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json(response)));
 const view=render(<SessionBoundary authUserId="same" scopeVersion="scope"><p>Private synthetic rows</p></SessionBoundary>);
 fireEvent(domWindow,new Event("focus"));await waitFor(()=>expect(view.getByRole("alert")).toBeTruthy());
 expect(client.getQueryData(["synthetic-private-rows"])).toBeUndefined();expect(state.clear).toHaveBeenCalledTimes(1);
 expect(localStorage.getItem("algt_erp_workspace_old-account")).toBeNull();expect(localStorage.getItem("unrelated-preference")).toBe("keep");
 if(destination==="reload")expect(location.reload).toHaveBeenCalledTimes(1);else expect(location.replace).toHaveBeenCalledWith(destination);
});

it.each(["SIGNED_OUT","SIGNED_IN"])("%s cancels an in-flight read and prevents its late result from repopulating cleared private cache",async event=>{
 const{location}=navigationProbe(),client=warmOwnedCache();let complete!:(value:unknown)=>void;let signal:AbortSignal|undefined;
 const promise=client.fetchQuery({queryKey:["pending-private"],queryFn:context=>{signal=context.signal;return new Promise(resolve=>{complete=resolve;});}}).catch(()=>undefined);
 const view=render(<SessionBoundary authUserId="same" scopeVersion="scope"><p>Private synthetic rows</p></SessionBoundary>);
 await act(async()=>{state.onAuth?.(event,event==="SIGNED_OUT"?null:{user:{id:"replacement"}});});
 expect(signal?.aborted).toBe(true);expect(view.queryByText("Private synthetic rows")).toBeNull();expect(location.replace).toHaveBeenCalledWith("/login");
 await act(async()=>{complete({sensitive:"obsolete synthetic result"});await promise;});
 expect(client.getQueryData(["pending-private"])).toBeUndefined();expect(client.getQueryCache().getAll()).toHaveLength(0);
});

it("temporary verification outage remains masked until a valid reconnect check, without erasing the same owner's draft",async()=>{
 const{domWindow}=navigationProbe(),client=warmOwnedCache();
 const fetcher=vi.fn().mockResolvedValueOnce(new Response("",{status:503})).mockResolvedValueOnce(Response.json({authUserId:"same",active:true,scopeVersion:"scope"}));vi.stubGlobal("fetch",fetcher);
 const view=render(<SessionBoundary authUserId="same" scopeVersion="scope"><p>Private synthetic rows</p></SessionBoundary>);
 fireEvent(domWindow,new Event("focus"));await waitFor(()=>expect(view.getByRole("alert")).toBeTruthy());expect(client.getQueryData(["synthetic-private-rows"])).toBeDefined();
 fireEvent(domWindow,new Event("focus"));await waitFor(()=>expect(view.getByText("Private synthetic rows")).toBeTruthy());
 expect(state.clear).not.toHaveBeenCalled();expect(localStorage.getItem("algt_erp_workspace_old-account")).toBe("tracked synthetic draft");
});
