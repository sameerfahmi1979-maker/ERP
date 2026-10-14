import {beforeEach,expect,it,vi} from "vitest";
import {HR_RECORD_CHOICE_CONFIG} from "@/lib/reads/hr-record-choices-schema";
const state=vi.hoisted(()=>({allowed:true,calls:[]as {table:string;from?:number;to?:number;id?:number;active?:boolean;orders:string[]}[],rows:[]as Record<string,unknown>[],selected:null as Record<string,unknown>|null,failPage:-1,changed:false}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:async()=>({}),hasPermission:()=>state.allowed}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(table:string)=>{
 const call:{table:string;from?:number;to?:number;id?:number;active?:boolean;orders:string[]}={table,orders:[]};state.calls.push(call);
 const q={select:()=>q,is:()=>q,order:(key:string)=>{call.orders.push(key);return q;},eq:(key:string,value:number|boolean)=>{if(key==="id")call.id=value as number;else if(key==="is_active")call.active=value as boolean;return q;},range:(from:number,to:number)=>{call.from=from;call.to=to;return q;},maybeSingle:()=>q,abortSignal:()=>q,then:(resolve:(result:unknown)=>unknown)=>Promise.resolve(call.id===undefined?{data:state.rows.slice(call.from,call.to!+1),count:state.rows.length+(state.changed&&!!call.from?1:0),error:call.from===state.failPage?{code:"synthetic"}:null}:{data:state.selected,error:null}).then(resolve)};return q;
}})}));
import {readHrRecordChoices} from "@/server/reads/hr-record-choices";
const row=(id:number)=>({id,code:`T${id}`,name_en:`Synthetic ${id}`,name_ar:null,description:null,is_active:true,sort_order:0,created_at:"2026-10-01",updated_at:"2026-10-01",deleted_at:null,requires_issue_date:true,requires_expiry_date:true,requires_document_number:true,default_expiry_alert_days:60,is_government_document:false,is_sensitive:false,scope_type:"global",requires_work_site:false,requires_client_authority:false,training_category_id:null,default_validity_months:null,requires_certificate_number:false,requires_provider:false,is_site_required:false,is_designation_required:false,is_confidential:false,requires_dms_document:false});
beforeEach(()=>{state.allowed=true;state.calls=[];state.rows=[row(1)];state.selected=null;state.failPage=-1;state.changed=false;});
it.each(Object.keys(HR_RECORD_CHOICE_CONFIG))("%s uses only its allowlisted catalog with stable counted batches",async kind=>{
 const result=await readHrRecordChoices({kind});expect(result.success).toBe(true);expect(state.calls).toHaveLength(1);expect(state.calls[0]).toMatchObject({table:HR_RECORD_CHOICE_CONFIG[kind as keyof typeof HR_RECORD_CHOICE_CONFIG].table,from:0,to:499,active:true,orders:["sort_order","name_en","id"]});
});
it("does not truncate 1,107 reference choices at 100 or PostgREST's page cap",async()=>{
 state.rows=Array.from({length:1107},(_,i)=>row(i+1));const result=await readHrRecordChoices({kind:"relationships"});expect(result.success).toBe(true);expect(result.data?.totalCount).toBe(1107);expect(result.data?.rows).toHaveLength(1107);expect(state.calls.map(c=>c.from)).toEqual([0,500,1000]);
});
it("retains only the explicitly selected authorized inactive value",async()=>{
 state.selected={...row(99),is_active:false};const result=await readHrRecordChoices({kind:"relationships",selectedId:99});expect(result.success).toBe(true);expect(result.data?.rows.map(r=>r.id)).toEqual([1,99]);expect(result.data?.totalCount).toBe(1);
});
it("does not manufacture or disclose an invisible selected choice",async()=>{
 const result=await readHrRecordChoices({kind:"relationships",selectedId:99});expect(result.success).toBe(true);expect(result.data?.rows.map(r=>r.id)).toEqual([1]);
});
it.each(["failed","changed","duplicate","too-large"])("rejects %s catalogs rather than sending partial choices",async mode=>{
 state.rows=Array.from({length:mode==="too-large"?2001:501},(_,i)=>row(i+1));if(mode==="failed")state.failPage=500;if(mode==="changed")state.changed=true;if(mode==="duplicate")state.rows[500]=row(1);
 const result=await readHrRecordChoices({kind:"relationships"});expect(result.success).toBe(false);expect(result.data).toBeUndefined();
});
it("rejects arbitrary resources, malformed selected IDs and unauthorized callers before database access",async()=>{
 for(const input of [{kind:"user_profiles"},{kind:"relationships",selectedId:-1},{kind:"relationships",companyId:1}])expect((await readHrRecordChoices(input)).success).toBe(false);
 state.allowed=false;expect(await readHrRecordChoices({kind:"relationships"})).toEqual({success:false,error:"Permission denied"});expect(state.calls).toHaveLength(0);
});
