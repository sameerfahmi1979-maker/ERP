import {afterEach,expect,it,vi} from "vitest";
const s=vi.hoisted(()=>({permissions:["notifications.admin","reports.history.view","dms.admin"],active:true,calls:[] as unknown[][],results:[] as unknown[],auth:0}));
vi.mock("@/lib/rbac/check",async()=>({...await import("@/lib/rbac/scope"),getAuthContext:async()=>{s.auth++;return {profile:{id:6,must_change_password:false},permissionCodes:s.permissions,roleCodes:[],roleAssignments:[],isAccountActive:s.active};}}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(...args:unknown[])=>{s.calls.push(["from",...args]);const value=s.results.shift();const q:Record<string,unknown>={then:(f:(value:unknown)=>unknown)=>Promise.resolve(value).then(f)};
 for(const key of ["select","or","eq","neq","ilike","is","order","range","abortSignal"])q[key]=(...args:unknown[])=>{s.calls.push([key,...args]);return q;};return q;}})}));
import {readNotificationDeliveries} from "@/server/reads/notification-deliveries";
import {readNotificationTemplates,readNotificationTemplateDetail} from "@/server/reads/notification-templates";
import {readDmsNotifications} from "@/server/reads/dms-notifications";
import {readReportDeliveries} from "@/server/reads/report-deliveries";
import {POST as logsRoute} from "@/app/api/reads/notification-deliveries/route";
import {POST as templatesRoute} from "@/app/api/reads/notification-templates/route";
import {POST as dmsRoute} from "@/app/api/reads/dms-notifications/route";
import {POST as reportsRoute} from "@/app/api/reads/report-deliveries/route";
const log={id:1,notification_id:null,email_queue_id:null,delivery_channel:"email",status:"failed",message:"Diagnostic recorded",duration_ms:0,attempt_number:1,error_message:"Error recorded",created_at:"2026-10-14T00:00:00Z"};
const template={id:1,template_code:"PERF",template_name:"Synthetic",source_module:"PERF",notification_type:"test",default_severity:"info",default_channel_in_app:true,default_channel_email:false,is_active:true};
const dms={id:1,document_id:2,visible_document_id:2,recipient_user_id:6,document_no:"SYN",subject:"Synthetic DMS",message:"Test",channel:"in_app",status:"pending",scheduled_for:"2099-01-01T00:00:00Z",read_at:null,bridge_status:"not_bridged",global_notification_id:null,global_email_queue_id:null};
const delivery={id:1,run_id:1,delivery_type:"email",recipient_to:["test@example.invalid"],subject:"Synthetic",attachment_format:"pdf",attachment_filename:"test.pdf",provider:null,delivery_status:"failed",sent_at:null,created_at:"2026-10-14T00:00:00Z",error_message:"PRIVATE_PROVIDER_ERROR"};
const families=[
 {name:"logs",reader:readNotificationDeliveries,route:logsRoute,row:log,table:"perf_notification_delivery_read",columns:"id,notification_id,email_queue_id,delivery_channel,status,message,duration_ms,attempt_number,error_message,created_at"},
 {name:"templates",reader:readNotificationTemplates,route:templatesRoute,row:template,table:"erp_notification_templates",columns:"id,template_code,template_name,source_module,notification_type,default_severity,default_channel_in_app,default_channel_email,is_active"},
 {name:"dms",reader:readDmsNotifications,route:dmsRoute,row:dms,table:"perf_dms_notification_read",columns:"id,document_id,recipient_user_id,subject,message,channel,status,scheduled_for,read_at,bridge_status,global_notification_id,global_email_queue_id,visible_document_id,document_no"},
 {name:"report-deliveries",reader:readReportDeliveries,route:reportsRoute,row:delivery,table:"erp_report_delivery_logs",columns:"id,run_id,delivery_type,recipient_to,subject,attachment_format,attachment_filename,provider,delivery_status,sent_at,created_at,error_message"},
];
const result=(rows:unknown[],count=rows.length)=>({data:rows,count,error:null});
afterEach(()=>Object.assign(s,{permissions:["notifications.admin","reports.history.view","dms.admin"],active:true,calls:[],results:[],auth:0}));
for(const f of families){
 it(f.name+" reads bounded exact complete pages beyond the previous cap and strips unknown private fields",async()=>{
  s.results=[result([{...f.row,metadata_json:{secret:"PRIVATE_METADATA"},html_template:"PRIVATE_HTML"}],1101)];
  const r=await f.reader({page:12,pageSize:100});expect(r.success).toBe(true);expect(r.data?.totalCount).toBe(1101);expect(s.calls).toContainEqual(["range",1100,1199]);
  expect(s.calls).toContainEqual(["from",f.table]);expect(s.calls).toContainEqual(["select",f.columns,{count:"exact",head:false}]);expect(JSON.stringify(r)).not.toContain("PRIVATE");
 });
 it(f.name+" denies before database access",async()=>{s.permissions=[];expect(await f.reader({})).toMatchObject({success:false,error:"Permission denied"});expect(s.calls).toEqual([]);});
 it(f.name+" rejects suspended principals",async()=>{s.active=false;expect((await f.reader({})).success).toBe(false);expect(s.calls).toEqual([]);});
 it.each([{page:0},{pageSize:101},{page:100001},{search:"a".repeat(201)},{unexpected:true}])(f.name+" rejects invalid criteria %j",async input=>{expect((await f.reader(input)).success).toBe(false);expect(s.calls).toEqual([]);expect(s.auth).toBe(0);});
 it.each(["count","short","duplicate","error"])(f.name+" rejects invalid result %s",async kind=>{
  s.results=[kind==="error"?{error:{message:"PRIVATE_PROVIDER"},data:null,count:null}:kind==="count"?result([],NaN):kind==="short"?result([f.row],3):result([f.row,f.row])];const r=await f.reader({});expect(r.success).toBe(false);expect(JSON.stringify(r)).not.toContain("PRIVATE");
 });
 it(f.name+" supports exhausted page recount but not missing counts",async()=>{s.results=[{data:null,count:null,status:416,error:{code:"PGRST103"}},{data:null,count:7,error:null}];const r=await f.reader({page:3,pageSize:25});expect(r).toMatchObject({success:true,data:{rows:[],totalCount:7,page:3}});});
 it(f.name+" propagates cancellation without auth",async()=>{const c=new AbortController();c.abort();await expect(f.reader({},undefined,c.signal)).rejects.toMatchObject({name:"AbortError"});expect(s.auth).toBe(0);});
 it(f.name+" routes have private opaque failure responses",async()=>{s.results=[{error:{message:"PRIVATE"},data:null,count:null}];const r=await f.route(new Request("http://localhost/api/reads/test",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}));expect(r.status).toBe(503);expect(r.headers.get("Cache-Control")).toContain("private, no-store");expect(r.headers.get("Vary")).toBe("Cookie");expect(await r.text()).not.toContain("PRIVATE");});
}
it("DMS uses the current profile, masks wrong recipients and cannot accept caller-provided recipient IDs",async()=>{
 s.results=[result([dms])];expect((await readDmsNotifications({})).success).toBe(true);expect(s.calls).toContainEqual(["eq","recipient_user_id",6]);
 s.results=[result([{...dms,recipient_user_id:7}])];expect((await readDmsNotifications({})).success).toBe(false);
 expect((await readDmsNotifications({recipient_user_id:7})).success).toBe(false);
});
it("view-only DMS users cannot request all notifications",async()=>{s.permissions=["dms.notifications.view"];expect(await readDmsNotifications({audience:"all"})).toMatchObject({success:false,error:"Permission denied"});expect(s.calls).toEqual([]);});
it("DMS unread filters and bridge filters stay native before range",async()=>{s.results=[result([])];await readDmsNotifications({unreadOnly:true,bridgeStatus:"not_bridged",channel:"email_ready"});expect(s.calls).toContainEqual(["is","read_at",null]);expect(s.calls).toContainEqual(["neq","status","dismissed"]);expect(s.calls).toContainEqual(["eq","channel","email_ready"]);});
it("template list does not load wording and detail requires view AND management",async()=>{
 s.permissions=["notifications.templates.view"];expect(await readNotificationTemplateDetail({id:1})).toMatchObject({success:false,error:"Permission denied"});expect(s.calls).toEqual([]);
 s.permissions=["notifications.templates.manage"];expect((await readNotificationTemplateDetail({id:1})).success).toBe(false);
});
it("template detail loads only the selected undeleted template",async()=>{
 s.results=[result([{...template,subject_template:"Subject",html_template:"HTML",text_template:"Text",is_system:false,created_at:"2026-10-14T00:00:00Z",updated_at:"2026-10-14T00:00:00Z"}])];
 expect(await readNotificationTemplateDetail({id:1})).toMatchObject({success:true,data:{id:1,textTemplate:"Text"}});expect(s.calls).toContainEqual(["eq","id",1]);expect(s.calls).toContainEqual(["range",0,0]);expect(s.calls).toContainEqual(["is","deleted_at",null]);
});
it.each([null,0,2])("template detail does not accept count %s",async count=>{s.results=[{data:[template],count,error:null}];expect((await readNotificationTemplateDetail({id:1})).success).toBe(false);});
it("report delivery never returns a different run or raw error",async()=>{s.results=[result([delivery])];expect((await readReportDeliveries({runId:2})).success).toBe(false);s.results=[result([delivery])];const r=await readReportDeliveries({runId:1});expect(r.data?.rows[0]).toMatchObject({hasError:true});expect(JSON.stringify(r)).not.toContain("PRIVATE");});
