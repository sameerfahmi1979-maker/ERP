import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { queueEmail, processEmailQueueItem, retryEmailQueueItem, cancelEmailQueueItem } from "@/server/actions/notifications/email-queue";
import { POST as emailPost } from "@/app/api/internal/process-email-queue/route";
import type { AuthContext } from "@/lib/rbac/check";
const m=vi.hoisted(()=>({ctx:vi.fn(),db:vi.fn(),single:vi.fn(),batch:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:m.ctx}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:m.db}));
vi.mock("@/lib/supabase/server",()=>({createClient:m.db}));
vi.mock("@/server/actions/audit",()=>({logAudit:vi.fn(async()=>{})}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/email/queue/service",()=>({processQueuedEmail:m.single,processQueuedBatch:m.batch,
 emailWorkerEnabled:()=>process.env.F09_EMAIL_WORKER_ENABLED==="true"}));
const input={request_id:"00000000-0000-4000-8000-000000000099",source_module:"TEST",to_emails:["synthetic@example.invalid"],subject:"Synthetic",text_body:"Synthetic",priority:"normal" as const,max_attempts:3};
function actor(codes:string[]):AuthContext{return {profile:{id:1},accountStatus:"active",isAccountActive:true,
 roleCodes:[],permissionCodes:codes,globalPermissionCodes:codes,roleAssignments:[],email:null} as AuthContext;}
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv("F09_EMAIL_WORKER_ENABLED","true");vi.stubEnv("INTERNAL_API_SECRET","x".repeat(40));
 m.ctx.mockResolvedValue(actor(["notifications.email_queue.manage"]));m.single.mockResolvedValue("accepted");
 m.batch.mockResolvedValue({processed:1,accepted:1,sent:1});m.rpc.mockResolvedValue({data:true,error:null});
 const q:Record<string,unknown>={};for(const method of ["insert","select"])q[method]=()=>q;
 q.single=async()=>({data:{id:11},error:null});m.db.mockReturnValue({from:()=>q,rpc:m.rpc});
});
it("autoProcess cannot bypass dedicated send permission",async()=>{
 expect((await queueEmail(input,{autoProcess:true})).success).toBe(false);expect(m.single).not.toHaveBeenCalled();expect(m.db).not.toHaveBeenCalled();
});
it("authorized autoProcess uses shared fenced delivery, not a separate provider",async()=>{
 m.ctx.mockResolvedValue(actor(["notifications.email_queue.manage","notifications.email_queue.process"]));
 expect((await queueEmail(input,{autoProcess:true})).data?.sent).toBe(true);
 expect(m.single).toHaveBeenCalledWith({id:11});
});
it("manual process is denied without process authority",async()=>{
 expect((await processEmailQueueItem(11)).success).toBe(false);expect(m.single).not.toHaveBeenCalled();
});
it("dry-run never claims or sends",async()=>{
 m.ctx.mockResolvedValue(actor(["notifications.email_queue.process"]));
 expect((await processEmailQueueItem(11,true)).data?.status).toBe("dry_run");expect(m.single).not.toHaveBeenCalled();
});
it("control actions use guarded RPC and report no-op correctly",async()=>{
 m.ctx.mockResolvedValue(actor(["notifications.email_queue.process","notifications.email_queue.manage"]));
 m.rpc.mockResolvedValue({data:false,error:null});
 expect((await retryEmailQueueItem(11)).success).toBe(false);expect((await cancelEmailQueueItem(11)).success).toBe(false);
 expect(m.rpc).toHaveBeenCalledWith("f09_retry_email",{p_id:11});expect(m.rpc).toHaveBeenCalledWith("f09_cancel_email",{p_id:11});
});
const req=(authorization?:string,body='{}')=>new NextRequest("http://localhost/api/internal/process-email-queue",
 {method:"POST",headers:authorization?{authorization}:{},body});
it("machine endpoint denies missing/wrong/short credentials before queue access",async()=>{
 for(const auth of [undefined,"Bearer wrong"]){expect((await emailPost(req(auth))).status).toBe(401);}
 vi.stubEnv("INTERNAL_API_SECRET","short");expect((await emailPost(req("Bearer short"))).status).toBe(401);expect(m.batch).not.toHaveBeenCalled();
});
it("machine endpoint is paused by default and does not instantiate a DB",async()=>{
 vi.stubEnv("F09_EMAIL_WORKER_ENABLED","");const r=await emailPost(req("Bearer "+"x".repeat(40)));
 expect((await r.json()).paused).toBe(true);expect(m.batch).not.toHaveBeenCalled();
});
it("machine endpoint validates limits and calls the shared service only",async()=>{
 const auth="Bearer "+"x".repeat(40);
 expect((await emailPost(req(auth,'{"limit":101}'))).status).toBe(400);
 expect((await emailPost(req(auth,'{"module":"DMS","limit":2}'))).status).toBe(200);
 expect(m.batch).toHaveBeenCalledExactlyOnceWith({module:"DMS",limit:2});
});
