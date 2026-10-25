import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),access:vi.fn(),read:vi.fn(),calls:[] as Array<{table:string;ops:Array<[string,...unknown[]]>}>}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:m.auth,hasPermission:()=>true,hasPermissionInScope:()=>true}));
vi.mock("@/lib/rbac/employee-access",()=>({getEmployeeAccess:m.access}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>db}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>db}));
const db={from:(table:string)=>{const entry={table,ops:[] as Array<[string,...unknown[]]>};m.calls.push(entry);const q=new Proxy({}, {get:(_,key)=>key==="then"?(ok:(r:unknown)=>unknown,fail:(e:unknown)=>unknown)=>Promise.resolve().then(()=>m.read(entry)).then(ok,fail):(...args:unknown[])=>{entry.ops.push([String(key),...args]);return q;}});return q;}};
import {listHrAiActivity} from "@/server/actions/hr/ai/hr-ai-activity";
import {readHrFillFacts} from "@/server/reads/hr-ai-fill-facts";
const ctx={profile:{id:1},roleAssignments:[]};
beforeEach(()=>{vi.resetAllMocks();m.calls=[];m.auth.mockResolvedValue(ctx);m.access.mockResolvedValue({allows:()=>true});m.read.mockResolvedValue({data:[],count:0,error:null});});
it("uses canonical usage columns and exact HR subject predicates",async()=>{
 m.read.mockResolvedValue({data:[{id:1,feature_area:"HR_AI_EMPLOYEE_REVIEW",operation_type:"review",status:"success",created_at:"2026-10-26",created_by:1}],count:1,error:null});
 const r=await listHrAiActivity("employee",8);expect(r.success).toBe(true);if(!r.success)throw Error();expect(r.data[0].sensitiveDataIncluded).toBeNull();
 expect(m.calls[0].ops).toContainEqual(["eq","metadata_json->>entity_type","employee"]);expect(m.calls[0].ops).toContainEqual(["eq","metadata_json->>entity_id","8"]);
 const projection=String(m.calls[0].ops.find(o=>o[0]==="select")?.[1]);expect(projection).toContain("feature_area");expect(projection).not.toMatch(/feature_code|model_used|error_message|metadata_json/);
});
it("never turns incomplete or failed usage into an empty success",async()=>{m.read.mockResolvedValue({data:[],count:1,error:null});expect((await listHrAiActivity("employee",8)).success).toBe(false);m.read.mockResolvedValue({data:null,count:null,error:{message:"PRIVATE"}});expect(JSON.stringify(await listHrAiActivity("employee",8))).not.toContain("PRIVATE");});
it("blocks a foreign subject and access retired during loading",async()=>{m.access.mockResolvedValue({allows:()=>false});expect((await listHrAiActivity("employee",8)).success).toBe(false);expect(m.calls).toHaveLength(0);m.access.mockResolvedValue({allows:()=>true});m.auth.mockResolvedValueOnce(ctx).mockResolvedValue({...ctx,roleAssignments:[{id:2}]});expect((await listHrAiActivity("employee",8)).success).toBe(false);});
it("reads complete source metadata and fingerprints only the verified facts",async()=>{
 m.read.mockImplementation(({table})=>table==="employees"?{data:{id:8,employee_code:"SYN-8"},error:null}:{data:[],count:0,error:null});
 const facts=await readHrFillFacts(db as never,8);expect(facts.fingerprint).toMatch(/^[a-f0-9]{64}$/);expect(m.calls).toHaveLength(3);
 expect(JSON.stringify(m.calls)).not.toMatch(/document_number|ocr_text|storage_path|medical|bank/);
 m.read.mockImplementation(({table})=>table==="employees"?{data:{id:8},error:null}:{data:[],count:1,error:null});await expect(readHrFillFacts(db as never,8)).rejects.toThrow();
});
it("rejects a missing or wrong employee before any provider/context work",async()=>{m.read.mockResolvedValue({data:{id:9},error:null});await expect(readHrFillFacts(db as never,8)).rejects.toThrow();expect(m.calls).toHaveLength(1);});
