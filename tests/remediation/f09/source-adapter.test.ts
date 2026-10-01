import { beforeEach, expect, it, vi } from "vitest";
import { prepareQueueMessage, type DeliveryClaim } from "@/lib/email/queue/source";
import type { AuthContext } from "@/lib/rbac/check";
const m=vi.hoisted(()=>({db:vi.fn(),actor:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:m.db}));
vi.mock("@/lib/rbac/check",async()=>({...await import("@/lib/rbac/scope"),getAuthContextForProfileId:m.actor}));
let records:Record<string,Record<string,unknown>>,ctx:AuthContext,email:string;
const base={id:1,lease_owner:"owner",lease_token:"token",attempt_count:1,max_attempts:3,created_by:null,
 source_module:"DMS",source_entity_type:"dms_documents",source_entity_id:44,notification_id:22,
 report_schedule_run_id:null,to_emails:["synthetic@example.invalid"],cc_emails:[],bcc_emails:[],
 subject:"Confidential subject must never leave",html_body:"Confidential body must never leave",text_body:"Sensitive",
 provider_config_id:null,source_revision:null,reply_to_email:null} satisfies DeliveryClaim;
beforeEach(()=>{
 vi.clearAllMocks();email="synthetic@example.invalid";
 const codes=["notifications.view","dms.documents.view"];
 ctx={profile:{id:7,auth_user_id:"synthetic",must_change_password:false},accountStatus:"active",isAccountActive:true,
 permissionCodes:codes,roleCodes:["reader"],globalPermissionCodes:[],email:null,
 roleAssignments:[{roleId:1,roleCode:"reader",ownerCompanyId:1,branchId:2,permissionCodes:codes}]} as AuthContext;
 records={dms_notification_settings:{is_enabled:true,email_enabled:true},
 erp_notifications:{id:22,source_module:"DMS",source_entity_type:"dms_documents",source_entity_id:44,recipient_user_id:7},
 dms_documents:{id:44,owning_company_id:1,owning_branch_id:2,confidentiality_level:"internal"}};
 m.actor.mockImplementation(async()=>ctx);
 m.db.mockReturnValue({from:(table:string)=>{
  const q:Record<string,unknown>={};for(const name of ["select","eq","is"])q[name]=()=>q;
  q.maybeSingle=async()=>({data:records[table],error:null});return q;
 },auth:{admin:{getUserById:async()=>({data:{user:{email,email_confirmed_at:"2026-01-01"}},error:null})}}});
});
it("DMS sends only a generic notice to the current confirmed mailbox",async()=>{
 const msg=await prepareQueueMessage(base,new AbortController().signal);
 expect(msg.to).toEqual(["synthetic@example.invalid"]);expect(msg.htmlBody).toBeUndefined();
 expect(msg.attachments).toBeUndefined();expect(JSON.stringify(msg)).not.toMatch(/Confidential|Sensitive|44/);
});
it.each([{owning_company_id:2},{owning_branch_id:3},{confidentiality_level:"medical"},{confidentiality_level:"executive"}])
 ("DMS refuses company/branch/classification mismatch %o",async patch=>{
 Object.assign(records.dms_documents,patch);await expect(prepareQueueMessage(base,new AbortController().signal)).rejects.toThrow();
});
it("email settings changed after enqueue stop the source",async()=>{
 records.dms_notification_settings.email_enabled=false;await expect(prepareQueueMessage(base,new AbortController().signal)).rejects.toThrow();
});
it("a stale or substituted mailbox is refused",async()=>{
 email="changed@example.invalid";await expect(prepareQueueMessage(base,new AbortController().signal)).rejects.toThrow();
});
it("cannot widen notification recipients with cc/bcc",async()=>{
 await expect(prepareQueueMessage({...base,cc_emails:["extra@example.invalid"]},new AbortController().signal)).rejects.toThrow();
});
it("queue source must match the notification's document or exact notification ID",async()=>{
 await expect(prepareQueueMessage({...base,source_entity_id:999},new AbortController().signal)).rejects.toThrow();
 await expect(prepareQueueMessage({...base,source_entity_type:"dms_notification",source_entity_id:22},new AbortController().signal)).resolves.toBeDefined();
});
it("revoked notification access denies the next attempt",async()=>{
 ctx.permissionCodes=[];await expect(prepareQueueMessage({...base,attempt_count:2},new AbortController().signal)).rejects.toThrow();
});
it("legacy report or unowned generic mail cannot bypass source authorization",async()=>{
 await expect(prepareQueueMessage({...base,source_module:"REPORTS"},new AbortController().signal)).rejects.toThrow();
 await expect(prepareQueueMessage({...base,source_module:"TEST",notification_id:null,source_entity_id:null},new AbortController().signal)).rejects.toThrow();
});
