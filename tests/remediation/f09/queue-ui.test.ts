// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import React from "react";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {EmailQueuePageClient} from "@/features/notifications/admin/email-queue-page-client";
import {emailQueueIdentity,type EmailQueueReadPage,type EmailQueueReadRow} from "@/lib/reads/email-queue-schema";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";
import {syntheticAuthContext} from "../../performance/fixtures/auth-context";
import {ReadError} from "@/lib/reads/client";
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("@/lib/reads/client",async original=>({...await original<typeof import("@/lib/reads/client")>(),readJson:m.read}));
vi.mock("@/features/notifications/admin/email-queue-process-panel",()=>({EmailQueueProcessPanel:()=>React.createElement("input",{"aria-label":"Process controls",defaultValue:"Retained draft"})}));
vi.mock("@/features/notifications/admin/email-queue-table",()=>({EmailQueueTable:(p:{serverRead:ERPTableServerRead<EmailQueueReadRow>;disabled:boolean})=>React.createElement("div",null,
 React.createElement("span",null,"Matches: "+String(p.serverRead.totalCount)),
 React.createElement("button",{onClick:()=>p.serverRead.onPaginationChange({pageIndex:8,pageSize:25})},"Page nine"),
 React.createElement("button",{onClick:()=>p.serverRead.onColumnFiltersChange([{id:"status",value:"pending"}])},"Pending filter"),
 React.createElement("button",{onClick:()=>p.serverRead.onGlobalFilterChange("fresh")},"Fresh search"),
 React.createElement("button",{disabled:p.disabled},"Row action"))}));
const ctx=syntheticAuthContext(["notifications.email_queue.view","notifications.email_queue.manage","notifications.email_queue.process"]);
const clients:QueryClient[]=[];
const row=(id:number):EmailQueueReadRow=>({id,queueCode:"Q-"+id,notificationId:null,providerConfigId:null,sourceModule:"SYSTEM",sourceEntityType:null,sourceEntityId:null,priority:"normal",status:"pending",deliveryState:null,pausedAt:null,dispatchStartedAt:null,fromEmail:null,toEmails:["synthetic@example.invalid"],subject:"Synthetic",templateCode:null,scheduledFor:"2099-01-01T00:00:00Z",sentAt:null,cancelledAt:null,attemptCount:0,maxAttempts:3,nextRetryAt:null,lastError:null,externalMessageId:null,createdAt:"2026-10-18T00:00:00Z"});
const data=(totalCount=754,page=1):EmailQueueReadPage=>({rows:Array.from({length:Math.min(25,Math.max(0,totalCount-(page-1)*25))},(_,i)=>row((page-1)*25+i+1)),totalCount,page,pageSize:25});
function mount(seed=true){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:0}}});clients.push(client);
 return render(React.createElement(QueryClientProvider,{client},React.createElement(EmailQueuePageClient,{authContext:ctx,initialPage:seed?data():undefined,initialIdentity:emailQueueIdentity(ctx),initialUpdatedAt:Date.now()})));
}
beforeEach(()=>{vi.clearAllMocks();m.read.mockImplementation(async(resource:string,p:{page?:number})=>({success:true,data:resource==="email-pending-count"?{count:300}:data(754,p.page??1)}));});
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());});
it("shows exact whole-queue totals and requests later server pages",async()=>{
 mount();expect(screen.getByText("Matches: 754")).toBeTruthy();
 await act(async()=>fireEvent.click(screen.getByText("Page nine")));
 await waitFor(()=>expect(m.read).toHaveBeenCalledWith("email-queue",expect.objectContaining({page:9}),expect.any(AbortSignal)));
});
it("filters on the server and resets from page nine to page one",async()=>{
 mount();await act(async()=>fireEvent.click(screen.getByText("Page nine")));
 await act(async()=>fireEvent.click(screen.getByText("Pending filter")));
 await waitFor(()=>expect(m.read).toHaveBeenCalledWith("email-queue",expect.objectContaining({status:"pending",page:1}),expect.any(AbortSignal)));
});
it("fences stale page results after the newest search",async()=>{
 let oldFinish!:(v:unknown)=>void;
 m.read.mockImplementation(async(resource:string,p:{page:number;search:string})=>{
   if(resource==="email-pending-count")return {success:true,data:{count:300}};
   if(!p.search)return await new Promise(resolve=>{oldFinish=resolve;});
   return {success:true,data:data(999,p.page)};
 });
 mount();fireEvent.click(screen.getByText("Page nine"));await waitFor(()=>expect(oldFinish).toBeTypeOf("function"));
 fireEvent.click(screen.getByText("Fresh search"));await screen.findByText("Matches: 999");
 await act(async()=>oldFinish({success:true,data:data(111,9)}));
 expect(screen.queryByText("Matches: 111")).toBeNull();expect(screen.getByText("Matches: 999")).toBeTruthy();
});
it("keeps failure visible and disables actions until successful refresh",async()=>{
 mount();await screen.findByLabelText("Process controls");
 m.read.mockRejectedValue(new ReadError("PRIVATE",400));
 await act(async()=>fireEvent.click(screen.getByText("Refresh queue")));
 await screen.findByRole("alert");expect(screen.queryByText("PRIVATE")).toBeNull();
 expect((screen.getByText("Row action") as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByRole("group",{name:"Queue processing controls"}) as HTMLFieldSetElement).disabled).toBe(true);
 m.read.mockImplementation(async(resource:string)=>({success:true,data:resource==="email-pending-count"?{count:300}:data()}));
 await act(async()=>fireEvent.click(screen.getByText("Refresh queue")));
 await waitFor(()=>expect(screen.queryByRole("alert")).toBeNull());
});
it("retains the mounted test form while refresh is in progress",async()=>{
 mount();const original=screen.getByLabelText("Process controls");
 m.read.mockImplementation(()=>new Promise(()=>{}));
 fireEvent.click(screen.getByText("Refresh queue"));
 expect(screen.getByLabelText("Process controls")).toBe(original);
 expect((screen.getByRole("group",{name:"Queue processing controls"}) as HTMLFieldSetElement).disabled).toBe(true);
});
it("an initial read failure stays unknown rather than displaying an empty success",async()=>{
 m.read.mockRejectedValue(new ReadError("PRIVATE",400));mount(false);await screen.findByRole("alert");
 expect(screen.getByText("Matches: null")).toBeTruthy();expect(screen.queryByText("Matches: 0")).toBeNull();
});
it("a scoped queue permission cannot see hydrated global rows or start reads",()=>{
 const scoped={...ctx,globalPermissionCodes:[],roleAssignments:[{roleId:2,roleCode:"scoped",ownerCompanyId:1,branchId:null,permissionCodes:ctx.permissionCodes}]};
 const client=new QueryClient();clients.push(client);
 render(React.createElement(QueryClientProvider,{client},React.createElement(EmailQueuePageClient,{authContext:scoped,initialPage:data(),initialIdentity:emailQueueIdentity(scoped),initialUpdatedAt:Date.now()})));
 expect(screen.getByRole("alert")).toBeTruthy();expect(m.read).not.toHaveBeenCalled();expect(screen.queryByText("Matches: 754")).toBeNull();
});
