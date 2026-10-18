// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {EmailQueuePageClient} from "@/features/notifications/admin/email-queue-page-client";
import {DeliveryLogsPageClient} from "@/features/notifications/admin/delivery-logs-page-client";
import {NotificationTemplatesPageClient} from "@/features/notifications/admin/notification-templates-page-client";
import {DmsNotificationsPageClient} from "@/features/dms/notifications/dms-notifications-page-client";
import {ReportDeliveryLogPanel} from "@/features/report-center/report-delivery-log-page";
import {emailQueueIdentity} from "@/lib/reads/email-queue-schema";
import {ReadError} from "@/lib/reads/client";
// Import each SSR route as well so the isolated type check covers its prop contract.
import QueueServer from "@/app/(protected)/admin/notifications/email-queue/page";
import LogsServer from "@/app/(protected)/admin/notifications/logs/page";
import TemplatesServer from "@/app/(protected)/admin/notifications/templates/page";
import DmsServer from "@/app/(protected)/dms/notifications/page";
const state=vi.hoisted(()=>({read:vi.fn(),action:vi.fn(),toast:vi.fn()}));
vi.mock("@/lib/reads/client",async original=>({...await original<typeof import("@/lib/reads/client")>(),readJson:state.read}));
vi.mock("next/navigation",()=>({usePathname:()=>"/notifications",redirect:vi.fn(),useRouter:()=>({push:vi.fn()})}));
vi.mock('@/server/actions/notifications/open',()=>({prepareNotificationOpen:vi.fn(),completeNotificationOpen:vi.fn()}));
vi.mock("@/lib/rbac/check",async()=>({...await import("@/lib/rbac/scope"),getAuthContext:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:vi.fn()}));
vi.mock("@/server/actions/notifications/email-queue",()=>({retryEmailQueueItem:state.action,cancelEmailQueueItem:state.action,processEmailQueueItem:state.action,processEmailQueue:state.action}));
vi.mock("@/features/notifications/admin/email-queue-process-panel",()=>({EmailQueueProcessPanel:()=> <div>Verified processing panel</div>}));
vi.mock("@/server/actions/notifications/templates",()=>({activateNotificationTemplate:state.action,deactivateNotificationTemplate:state.action}));
vi.mock("@/features/notifications/admin/notification-template-form-dialog",()=>({NotificationTemplateFormDialog:({template,onClose}:{template:{id:number;textTemplate:string}|null;onClose:()=>void})=><div role="dialog"><p>{template?.textTemplate??"New wording"}</p><button onClick={onClose}>Close wording</button></div>}));
vi.mock("@/server/actions/dms/notifications",()=>({markDmsNotificationRead:state.action,dismissDmsNotification:state.action,generateDmsExpiryNotifications:state.action}));
vi.mock("@/server/actions/dms/dms-email-bridge",()=>({bridgeDmsNotificationToGlobal:state.action,bridgeDueDmsNotificationsToGlobal:state.action,processDmsExpiryEmailQueue:state.action}));
vi.mock("sonner",()=>({toast:{success:state.toast,error:state.toast}}));
const ctx={profile:{id:6,auth_user_id:"synthetic-item4",must_change_password:false},isAccountActive:true,accountStatus:"active",permissionCodes:["notifications.email_queue.view","notifications.logs.view","notifications.templates.view","notifications.templates.manage","dms.notifications.view"],roleCodes:[],roleAssignments:[]} as unknown as AuthContext;
ctx.globalPermissionCodes=[...ctx.permissionCodes];
const queue=(id=1)=>({id,queueCode:"Q"+id,notificationId:null,providerConfigId:null,sourceModule:"PERF",sourceEntityType:null,sourceEntityId:null,priority:"normal",status:"pending",fromEmail:null,toEmails:["synthetic@example.invalid"],subject:"Queue row "+id,templateCode:null,scheduledFor:"2099-01-01T00:00:00Z",sentAt:null,cancelledAt:null,attemptCount:0,maxAttempts:3,nextRetryAt:null,lastError:null,externalMessageId:null,createdAt:"2026-10-14T00:00:00Z"});
const log=(id=1)=>({id,notificationId:null,emailQueueId:null,deliveryChannel:"email",status:"failed",message:"Log row "+id,errorMessage:null,durationMs:0,attemptNumber:1,createdAt:"2026-10-14T00:00:00Z"});
const template=(id=1)=>({id,templateCode:"CODE_"+id,templateName:"Template row "+id,sourceModule:"PERF",notificationType:"test",defaultSeverity:"info",defaultChannelInApp:true,defaultChannelEmail:false,isActive:true});
const dms=(id=1)=>({id,document_id:2,visible_document_id:null,document_no:null,recipient_user_id:6,subject:"DMS row "+id,message:"Synthetic message",channel:"in_app",status:"pending",scheduled_for:"2099-01-01T00:00:00Z",read_at:null,bridge_status:"not_bridged",global_notification_id:null,global_email_queue_id:null});
const delivery=(id=1,run=1)=>({id,run_id:run,delivery_type:"email",recipient_to:["synthetic@example.invalid"],subject:"Delivery row "+id,attachment_format:null,attachment_filename:null,provider:null,delivery_status:"provider_accepted" as const,sent_at:null,created_at:"2026-10-14T00:00:00Z",hasError:false});
const clients:QueryClient[]=[];
const families=[
 {name:"queue",component:EmailQueuePageClient,row:queue,label:"Queue row ",refresh:"Refresh queue",search:"Search queue…"},
 {name:"logs",component:DeliveryLogsPageClient,row:log,label:"Log row ",refresh:"Refresh delivery logs",search:"Search delivery metadata…"},
 {name:"templates",component:NotificationTemplatesPageClient,row:template,label:"Template row ",refresh:"Refresh templates",search:"Search template metadata…"},
] as const;
function client(){const q=new QueryClient({defaultOptions:{queries:{retryDelay:0}}});clients.push(q);return q;}
beforeEach(()=>{state.read.mockRejectedValue(new ReadError("Unavailable",503));});
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());state.read.mockReset();state.action.mockReset();state.toast.mockReset();});
function mount(f:typeof families[number],count=1,seed=true){
 const qc=client(),initial={page:1,pageSize:25,totalCount:count,rows:Array.from({length:Math.min(25,count)},(_,i)=>f.row(i+1))};
 const tree=(authContext:AuthContext=ctx)=>{const props={authContext,initialIdentity:emailQueueIdentity(ctx),initialUpdatedAt:Date.now(),initialPage:seed?initial:undefined};
  return <QueryClientProvider client={qc}>{f.name==="queue"?<EmailQueuePageClient {...props} initialPage={props.initialPage as Parameters<typeof EmailQueuePageClient>[0]["initialPage"]}/>:f.name==="logs"?<DeliveryLogsPageClient {...props} initialPage={props.initialPage as Parameters<typeof DeliveryLogsPageClient>[0]["initialPage"]}/>:<NotificationTemplatesPageClient {...props} initialPage={props.initialPage as Parameters<typeof NotificationTemplatesPageClient>[0]["initialPage"]}/>}</QueryClientProvider>;};
 const view=render(tree());return {...view,replace:(auth:AuthContext)=>view.rerender(tree(auth))};
}
for(const f of families){
 it(f.name+" uses the validated same-principal SSR seed without another list fetch",()=>{mount(f);expect(screen.getByText(f.label+"1")).toBeTruthy();expect(state.read).not.toHaveBeenCalled();});
 it(f.name+" pages beyond the loaded set",async()=>{state.read.mockResolvedValue({success:true,data:{page:2,pageSize:25,totalCount:26,rows:[f.row(26)]}});mount(f,26);fireEvent.click(screen.getByRole("button",{name:"Next"}));await screen.findByText(f.label+"26");expect(state.read.mock.calls[0][1]).toMatchObject({page:2,pageSize:25});expect(screen.queryByText(f.label+"1")).toBeNull();});
 it(f.name+" masks warm rows during search and failure",async()=>{mount(f);fireEvent.change(screen.getByPlaceholderText(f.search),{target:{value:"missing"}});expect(screen.queryByText(f.label+"1")).toBeNull();await screen.findByRole("alert");expect(screen.queryByText(f.label+"1")).toBeNull();});
 it.each([401,403])(f.name+" retires rows and disables retry after denial %s",async status=>{state.read.mockRejectedValue(new ReadError("Denied",status));mount(f);fireEvent.click(screen.getByRole("button",{name:f.refresh}));await screen.findByText(/access could not be verified/);expect(screen.queryByText(f.label+"1")).toBeNull();expect(state.read).toHaveBeenCalledTimes(1);});
 it(f.name+" aborts and fences a pending result across account switch",async()=>{
  const finishes:Array<(v:unknown)=>void>=[];state.read.mockImplementation(()=>new Promise(resolve=>finishes.push(resolve)));const view=mount(f,1,false);await waitFor(()=>expect(state.read).toHaveBeenCalledTimes(1));const signal=state.read.mock.calls[0][2] as AbortSignal;
  view.replace({...ctx,profile:{...ctx.profile!,id:7,auth_user_id:"other-item4"}});await waitFor(()=>expect(state.read).toHaveBeenCalledTimes(2));expect(signal.aborted).toBe(true);
  await act(async()=>finishes[0]({success:true,data:{page:1,pageSize:25,totalCount:1,rows:[f.row(9)]}}));expect(screen.queryByText(f.label+"9")).toBeNull();
  await act(async()=>finishes[1]({success:true,data:{page:1,pageSize:25,totalCount:1,rows:[f.row(8)]}}));await screen.findByText(f.label+"8");
 });
 it(f.name+" hides seeded data when the account becomes inactive",()=>{const view=mount(f);view.replace({...ctx,isAccountActive:false,accountStatus:"suspended"});expect(screen.getByRole("alert")).toBeTruthy();expect(screen.queryByText(f.label+"1")).toBeNull();expect(state.read).not.toHaveBeenCalled();});
}
it("template body is requested only after Edit, and closed detail cannot reopen on a late result",async()=>{
 let finish!:(v:unknown)=>void;state.read.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));mount(families[2]);fireEvent.click(screen.getByRole("button",{name:"Edit"}));await screen.findByText(/Loading selected template/);expect(state.read.mock.calls[0][0]).toBe("notification-template-detail");expect(state.read.mock.calls[0][1]).toEqual({id:1});const signal=state.read.mock.calls[0][2] as AbortSignal;
 fireEvent.click(screen.getByRole("button",{name:"Cancel editing"}));expect(signal.aborted).toBe(true);await act(async()=>finish({success:true,data:{...template(),subjectTemplate:"Subject",htmlTemplate:null,textTemplate:"PRIVATE_TEST_BODY",isSystem:false,createdAt:"2026-10-14T00:00:00Z",updatedAt:"2026-10-14T00:00:00Z"}}));expect(screen.queryByText("PRIVATE_TEST_BODY")).toBeNull();
});
it("DMS uses an own-user page and does not link a hidden document",async()=>{state.read.mockResolvedValue({success:true,data:{page:1,pageSize:25,totalCount:1,rows:[dms()]}});render(<QueryClientProvider client={client()}><DmsNotificationsPageClient authContext={ctx}/></QueryClientProvider>);await screen.findByText("DMS row 1");expect(state.read.mock.calls[0][1]).toMatchObject({audience:"my"});expect(screen.queryByText("All Notifications")).toBeNull();expect(screen.queryByText("Open document")).toBeNull();});
it("DMS failed read is not an empty successful inbox",async()=>{render(<QueryClientProvider client={client()}><DmsNotificationsPageClient authContext={ctx}/></QueryClientProvider>);await screen.findByRole("alert");expect(screen.queryByText("DMS row 1")).toBeNull();});
it("report panel changes page size through a different request identity and reports provider acceptance honestly",async()=>{
 state.read.mockImplementation(async(_resource:string,p:{page:number;pageSize:number;runId:number})=>({success:true,data:{page:p.page,pageSize:p.pageSize,totalCount:1,rows:[delivery(1,p.runId)]}}));
 render(<QueryClientProvider client={client()}><ReportDeliveryLogPanel runId={1}/></QueryClientProvider>);await screen.findByText("Delivery row 1");expect(screen.getByText("Provider accepted (not inbox confirmation)")).toBeTruthy();
 fireEvent.click(screen.getByRole("combobox",{name:"Rows per page"}));
 const option=await screen.findByRole("option",{name:"50"});
 // Base UI intentionally ignores a click that did not start on the option:
 // opening an aligned popup can place an option under the pointer.
 fireEvent.pointerDown(option,{pointerType:"mouse",button:0});fireEvent.click(option);
 await waitFor(()=>expect(state.read).toHaveBeenCalledTimes(2));expect(state.read.mock.calls[1][1]).toMatchObject({pageSize:50,page:1,runId:1});
});
it("all adopted SSR exports remain typed and available",()=>{expect([QueueServer,LogsServer,TemplatesServer,DmsServer].every(v=>typeof v==="function")).toBe(true);});
