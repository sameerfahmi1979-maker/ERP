import {beforeEach,expect,it,vi} from "vitest";
type Call={table:string;ops:[string,unknown[]][]};
const s=vi.hoisted(()=>({allowed:true,admin:false,active:true,forced:false,total:1107,mode:"ok",calls:[] as Call[]}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/logger",()=>({logger:{warn:vi.fn()}}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:async()=>({profile:{id:9,must_change_password:s.forced},isAccountActive:s.active,roleCodes:[]}),hasPermission:(_ctx:unknown,p:string)=>p==="dms.admin"?s.admin:s.allowed}));
vi.mock("@/lib/dms/review-queue/review-queue-upsert",()=>({isDmsAiReviewEnabled:async()=>true,createDmsReviewQueueNotification:()=>{throw Error("No delivery");},upsertDmsReviewQueueItem:()=>{throw Error("No writes");}}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>{throw Error("No privileged detail reads");}}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(table:string)=>{
 const c:Call={table,ops:[]};s.calls.push(c);const q=new Proxy({}, {get:(_,key)=>key==="then"?(resolve:(r:unknown)=>unknown)=>{
  const [from,to]=(c.ops.filter(([op])=>op==="range").at(-1)?.[1]??[0,24]) as number[];
  const single=c.ops.some(([op])=>op==="single");
  if(s.mode==="416"&&from>=s.total)return Promise.resolve({data:null,count:null,status:416,error:{code:"PGRST103"}}).then(resolve);
  const row=(id:number)=>({id,document_id:7,document:{confidentiality_level:s.mode==="confidential"?"hr":"internal"},validation_finding_id:s.mode==="detail"?4:null,entity_match_candidate_id:s.mode==="detail"?5:null});
  const data=single?row(1):Array.from({length:Math.min(to-from+1,Math.max(0,s.total-from))},(_,i)=>row(from+i+1));
  return Promise.resolve({data:s.mode==="short"&&Array.isArray(data)?data.slice(0,1):data,count:s.mode==="null"?null:s.total,error:s.mode==="error"?{message:"secret"}:null}).then(resolve);
 }:(...args:unknown[])=>{c.ops.push([String(key),args]);return q;}});return q;
}})}));
import {getDmsReviewQueueItems,getDmsReviewQueueCounts,getDmsReviewQueueItem} from "@/server/actions/dms/review-queue";
beforeEach(()=>Object.assign(s,{allowed:true,admin:false,active:true,forced:false,total:1107,mode:"ok",calls:[]}));
it("filters confidential parents before count and page without an all-document ID scan",async()=>{const r=await getDmsReviewQueueItems({page:3});expect(r.data?.items).toHaveLength(25);expect(r.data?.total).toBe(1107);expect(s.calls).toHaveLength(1);expect(s.calls[0].ops).toContainEqual(["not",["document.confidentiality_level","in",'("hr","legal","executive")']]);expect(s.calls[0].ops).toContainEqual(["or",["document_id.is.null,document.not.is.null"]]);expect(s.calls[0].ops).toContainEqual(["range",[50,74]]);});
it("summary has the same parent/confidentiality boundary and verifies all seven counts",async()=>{expect((await getDmsReviewQueueCounts()).success).toBe(true);expect(s.calls).toHaveLength(7);for(const c of s.calls)expect(c.ops).toContainEqual(["or",["document_id.is.null,document.not.is.null"]]);s.mode="null";expect((await getDmsReviewQueueCounts()).success).toBe(false);s.mode="error";expect((await getDmsReviewQueueCounts()).success).toBe(false);});
it.each(["short","null","error","confidential"])("list fails closed on %s",async mode=>{s.mode=mode;expect((await getDmsReviewQueueItems()).success).toBe(false);});
it("returns a verified tail and recovers an out-of-range 416",async()=>{expect((await getDmsReviewQueueItems({page:45})).data?.items).toHaveLength(7);s.mode="416";expect((await getDmsReviewQueueItems({page:46})).data).toMatchObject({items:[],total:1107});});
it.each([{page:0},{pageSize:51},{assignedTo:-1},{companyId:3},{createdAfter:"bad"}])("rejects invalid criteria %j",async p=>{expect((await getDmsReviewQueueItems(p)).success).toBe(false);expect(s.calls).toHaveLength(0);});
it.each(["allowed","active","forced"])("blocks %s for every entrypoint",async mode=>{s.allowed=mode!=="allowed";s.active=mode!=="active";s.forced=mode==="forced";for(const r of [await getDmsReviewQueueItems(),await getDmsReviewQueueCounts(),await getDmsReviewQueueItem(1)])expect(r.error).toBe("Permission denied");expect(s.calls).toHaveLength(0);});
it("detail reads stay ordinary and correlate both linked records to the source parent",async()=>{s.mode="detail";expect((await getDmsReviewQueueItem(1)).success).toBe(true);for(const c of s.calls.slice(1))expect(c.ops).toContainEqual(["or",["document_id.eq.7"]]);});
it("admin remains exempt only from the legacy additional confidentiality filter",async()=>{s.admin=true;expect((await getDmsReviewQueueItems()).success).toBe(true);expect(s.calls[0].ops.some(([op])=>op==="not")).toBe(false);});
