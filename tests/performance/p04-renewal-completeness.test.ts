import {beforeEach,expect,it,vi} from "vitest";
type Call={ops:[string,unknown[]][]};
const state=vi.hoisted(()=>({active:true,allowed:true,forced:false,mode:"ok",total:1107,calls:[] as Call[]}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:async()=>({profile:{id:9,must_change_password:state.forced},isAccountActive:state.active}),hasPermission:()=>state.allowed}));
vi.mock("@/server/actions/dms/expiry-reminders",()=>({rebuildDmsExpiryReminders:vi.fn()}));
vi.mock("@/server/actions/audit",()=>({logAudit:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
const row=(id:number)=>({id,document_id:id,renewal_no:`TEST-${id}`,status:"requested",priority:"normal",requested_by:null,assigned_to:null,requested_at:"2026-01-01",target_renewal_date:null,old_expiry_date:null,new_expiry_date:null,replacement_document_id:null,replacement_version_id:null,notes:null,completed_at:null,cancelled_at:null,created_by:null,created_at:"2026-01-01",updated_at:"2026-01-01",document:null,requester:null,assignee:null});
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:()=>{const c={ops:[] as [string,unknown[]][]};state.calls.push(c);const chain=new Proxy({}, {get:(_,key)=>key==="then"?(resolve:(r:unknown)=>unknown)=>{
 const [from,to]=(c.ops.find(([op])=>op==="range")?.[1]??[0,199]) as number[];
 const data=Array.from({length:Math.min(to-from+1,Math.max(0,state.total-from))},(_,i)=>row(from+i+1));
 return Promise.resolve({data:state.mode==="short"?data.slice(0,1):state.mode==="duplicate"?data.map(()=>row(1)):state.mode==="malformed"?[{id:1}]:data,count:state.mode==="null"?null:state.mode==="changed"&&from>0?state.total+1:state.total,error:state.mode==="error"?{message:"private error"}:null}).then(resolve);
 }:(...args:unknown[])=>{c.ops.push([String(key),args]);return chain;}});return chain;}})}));
import {getDmsRenewalRequests} from "@/server/actions/dms/renewals";
beforeEach(()=>{state.active=true;state.allowed=true;state.forced=false;state.total=1107;state.mode="ok";state.calls=[];});
it("retains all 1,107 renewals in bounded stable pages and preserves existing filters",async()=>{
 const result=await getDmsRenewalRequests({documentId:4,assignedToMe:true,status:"requested"});expect(result.success).toBe(true);expect(result.data).toHaveLength(1107);expect(state.calls).toHaveLength(3);
 for(const c of state.calls){expect(c.ops).toEqual(expect.arrayContaining([["eq",["document_id",4]],["eq",["assigned_to",9]],["eq",["status","requested"]],["order",["id",{ascending:true}]],["not",["status","in",'("renewed","cancelled","rejected")']]]));}
});
it.each(["short","duplicate","malformed","null","changed","error"])("rejects %s pages without partial success",async mode=>{state.mode=mode;const result=await getDmsRenewalRequests();expect(result.success).toBe(false);expect(result.data).toBeUndefined();expect(result.error).not.toContain("private");});
it("returns complete empty results and preserves completed inclusion",async()=>{state.total=0;expect((await getDmsRenewalRequests({includeCompleted:true})).data).toEqual([]);expect(state.calls[0].ops.some(([op])=>op==="not")).toBe(false);});
it.each([{documentId:0},{status:""},{includeCompleted:"yes"},{companyId:1}])("rejects malformed filter %j before reads",async filter=>{expect((await getDmsRenewalRequests(filter as Parameters<typeof getDmsRenewalRequests>[0])).success).toBe(false);expect(state.calls).toHaveLength(0);});
it("fails safely beyond the complete-read bound",async()=>{state.total=10001;expect((await getDmsRenewalRequests()).success).toBe(false);expect(state.calls).toHaveLength(1);});
it("denies inactive, forced password and unauthorized callers",async()=>{for(const key of ["active","forced","allowed"] as const){state.active=key!=="active";state.forced=key==="forced";state.allowed=key!=="allowed";expect((await getDmsRenewalRequests()).success).toBe(false);}expect(state.calls).toHaveLength(0);});
