// @vitest-environment jsdom
import React from "react";
import {act,cleanup,renderHook,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {ReadError} from "@/lib/reads/client";
const state=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("@/lib/reads/client",async original=>({...await original<typeof import("@/lib/reads/client")>(),readJson:state.read}));
import {useHrDocumentChoices} from "@/hooks/use-hr-document-choices";
const clients:QueryClient[]=[];
const entry=(id:number)=>({id,title:`Private ${id}`,document_no:null,status:"active",issue_date:null,expiry_date:null,document_type_name:null,document_type_code:null,has_extraction:false,has_ocr:false,extracted_person_name:null,is_linked_to_employee:false});
function response(p:{employeeId:number;mode:string;page:number;target:string;dependentId:number|null}){const {employeeId,mode,page,target,dependentId}=p;return {success:true,data:{employeeId,mode,page,target,dependentId,pageSize:50,totalCount:51,rows:p.page===1?Array.from({length:50},(_,i)=>entry(i+1)):[entry(51)]}};}
function setup(){const client=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:0}}});clients.push(client);return {client,wrapper:({children}:{children:React.ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>};}
beforeEach(()=>state.read.mockImplementation(async(_route,p)=>response(p)));
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());state.read.mockReset();});
it("pages all choices and resets page on search changes",async()=>{
 const {wrapper}=setup(),generation={};const h=renderHook(({search})=>useHrDocumentChoices(7,"library",search,true,generation),{wrapper,initialProps:{search:""}});
 await waitFor(()=>expect(h.result.current.ready).toBe(true));act(()=>h.result.current.setPage(2));await waitFor(()=>expect(h.result.current.rows.map(r=>r.id)).toEqual([51]));
 h.rerender({search:"next"});await waitFor(()=>expect(h.result.current.ready).toBe(true));expect(h.result.current.page).toBe(1);expect(state.read.mock.calls.at(-1)?.[1].search).toBe("next");
});
it("retains no private rows when hidden and refuses a retained retry or page callback",async()=>{
 const {wrapper}=setup(),generation={};const h=renderHook(({enabled})=>useHrDocumentChoices(7,"library","",enabled,generation),{wrapper,initialProps:{enabled:true}});
 await waitFor(()=>expect(h.result.current.ready).toBe(true));const old=h.result.current;h.rerender({enabled:false});expect(h.result.current.rows).toEqual([]);expect(h.result.current.ready).toBe(false);const before=state.read.mock.calls.length;
 await act(async()=>{await old.refetch();old.setPage(2);});expect(state.read).toHaveBeenCalledTimes(before);expect(h.result.current.page).toBe(1);expect(old.isCurrent()).toBe(false);
});
it.each([401,403])("a %s retires the owner without a remove-and-refetch loop",async status=>{
 const {wrapper,client}=setup(),generation={};const h=renderHook(()=>useHrDocumentChoices(7,"library","",true,generation),{wrapper});await waitFor(()=>expect(h.result.current.ready).toBe(true));
 const retained=h.result.current;state.read.mockRejectedValue(new ReadError("Denied",status));await act(async()=>{await client.invalidateQueries({queryKey:["hr","document-choices"]});});await waitFor(()=>expect(h.result.current.denied).toBe(true));expect(h.result.current.rows).toEqual([]);expect(h.result.current.ready).toBe(false);
 const before=state.read.mock.calls.length;await act(async()=>{await h.result.current.refetch();await retained.refetch();});expect(state.read).toHaveBeenCalledTimes(before);
});
it("account/parent generation replacement retires retained callbacks and old response",async()=>{
 const {wrapper}=setup();let finish!:(v:unknown)=>void;const pending=new Promise(r=>{finish=r;});state.read.mockImplementation((_r,p)=>p.employeeId===7?pending:Promise.resolve(response(p)));const a={},b={};const h=renderHook(({generation,employeeId})=>useHrDocumentChoices(employeeId,"library","",true,generation),{wrapper,initialProps:{generation:a,employeeId:7}});await waitFor(()=>expect(state.read.mock.calls.length).toBeGreaterThan(0));const old=h.result.current,p=state.read.mock.calls[0][1];h.rerender({generation:b,employeeId:8});await waitFor(()=>expect(h.result.current.ready).toBe(true));const owner=h.result.current.owner;
 await act(async()=>finish(response({...p,employeeId:99})));expect(h.result.current.owner).toBe(owner);expect(h.result.current.data?.employeeId).toBe(8);expect(old.isCurrent()).toBe(false);const before=state.read.mock.calls.length;await act(async()=>{await old.refetch();});expect(state.read).toHaveBeenCalledTimes(before);
});
it("transport failure hides old choices but allows an explicit retry",async()=>{
 const {wrapper,client}=setup(),generation={};const h=renderHook(()=>useHrDocumentChoices(7,"library","",true,generation),{wrapper});await waitFor(()=>expect(h.result.current.ready).toBe(true));state.read.mockRejectedValue(new ReadError("Unavailable",503));await act(async()=>{await client.invalidateQueries({queryKey:["hr","document-choices"]});});await waitFor(()=>expect(h.result.current.isError).toBe(true));expect(h.result.current.rows).toEqual([]);expect(h.result.current.denied).toBe(false);state.read.mockImplementation(async(_r,p)=>response(p));await act(async()=>{await h.result.current.refetch();});await waitFor(()=>expect(h.result.current.ready).toBe(true));
});
