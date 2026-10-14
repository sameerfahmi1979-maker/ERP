// @vitest-environment jsdom
import React from "react";
import {act,cleanup,renderHook,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {ReadError} from "@/lib/reads/client";
const s=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("@/lib/reads/client",async original=>({...await original<typeof import("@/lib/reads/client")>(),readJson:s.read}));
import {useHrLinkedDocuments} from "@/hooks/use-hr-linked-documents";
const clients:QueryClient[]=[];
function response(p:{employeeId:number;dependentId:number|null}){return {success:true,data:{...p,rows:[{link_id:1,document_id:9,document_no:"TEST",title:"Private title",status:"active",expiry_date:null,document_type_name:null}]}};}
function setup(){const client=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:0}}});clients.push(client);return {client,wrapper:({children}:{children:React.ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>};}
beforeEach(()=>s.read.mockImplementation(async(_r,p)=>response(p)));
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());s.read.mockReset();});
it.each([401,403])("terminal %s hides private links and retires old retry callbacks",async status=>{
 const {client,wrapper}=setup(),generation={};const h=renderHook(()=>useHrLinkedDocuments(7,null,true,generation),{wrapper});await waitFor(()=>expect(h.result.current.ready).toBe(true));const old=h.result.current;
 s.read.mockRejectedValue(new ReadError("Denied",status));await act(async()=>{await client.invalidateQueries();});await waitFor(()=>expect(h.result.current.denied).toBe(true));expect(h.result.current.data).toBeUndefined();const before=s.read.mock.calls.length;
 await act(async()=>{await old.refetch();await h.result.current.refetch();});expect(s.read).toHaveBeenCalledTimes(before);
});
it("hidden parent clears links and cannot revive a retained retry",async()=>{
 const {wrapper}=setup(),generation={};const h=renderHook(({active})=>useHrLinkedDocuments(7,null,active,generation),{wrapper,initialProps:{active:true}});await waitFor(()=>expect(h.result.current.ready).toBe(true));const old=h.result.current;h.rerender({active:false});expect(h.result.current.data).toBeUndefined();const before=s.read.mock.calls.length;await act(async()=>{await old.refetch();});expect(s.read).toHaveBeenCalledTimes(before);
});
it("owner replacement ignores late old data and aborts its transport",async()=>{
 const {wrapper}=setup();let resolve!:(v:unknown)=>void;s.read.mockImplementation((_r,p)=>p.employeeId===7?new Promise(r=>{resolve=r;}):Promise.resolve(response(p)));const h=renderHook(({employeeId,generation})=>useHrLinkedDocuments(employeeId,null,true,generation),{wrapper,initialProps:{employeeId:7,generation:{}}});await waitFor(()=>expect(s.read).toHaveBeenCalled());const old=h.result.current;const call=s.read.mock.calls.find(c=>c[0]==="hr-linked-documents"&&c[1]?.employeeId===7);expect(call?.length,JSON.stringify(s.read.mock.calls.map(c=>({route:c[0],args:c.length})))).toBe(3);const signal=call![2] as AbortSignal;h.rerender({employeeId:8,generation:{}});await waitFor(()=>expect(h.result.current.ready).toBe(true));expect(signal.aborted).toBe(true);await act(async()=>resolve(response({employeeId:7,dependentId:null})));const before=s.read.mock.calls.length;await act(async()=>{await old.refetch();});expect(s.read).toHaveBeenCalledTimes(before);expect(h.result.current.ready).toBe(true);
});
it("503 hides stale metadata but permits current-owner retry",async()=>{
 const {client,wrapper}=setup(),generation={};const h=renderHook(()=>useHrLinkedDocuments(7,null,true,generation),{wrapper});await waitFor(()=>expect(h.result.current.ready).toBe(true));s.read.mockRejectedValue(new ReadError("Unavailable",503));await act(async()=>{await client.invalidateQueries();});await waitFor(()=>expect(h.result.current.isError).toBe(true));expect(h.result.current.data).toBeUndefined();s.read.mockImplementation(async(_r,p)=>response(p));await act(async()=>{await h.result.current.refetch();});await waitFor(()=>expect(h.result.current.ready).toBe(true));
});
