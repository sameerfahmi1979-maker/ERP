import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),auth:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:()=>query()})}));
vi.mock("@/lib/rbac/check",async()=>({...await vi.importActual("@/lib/rbac/scope"),getAuthContext:m.auth}));
function query(){const q=new Proxy({}, {get:(_,key)=>key==="then"?(ok: (v:unknown)=>unknown,fail:(e:unknown)=>unknown)=>Promise.resolve().then(()=>m.read()).then(ok,fail):()=>q});return q;}
import {listAuditLogs,listUserSecurityAuditLogs} from "@/server/queries/audit";
import {GET} from "@/app/api/admin/audit/user-history/route";
import {NextRequest} from "next/server";
const ctx={profile:{id:1},isAccountActive:true,permissionCodes:["audit.view"],globalPermissionCodes:["audit.view"],roleAssignments:[],roleCodes:[]};
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue(ctx);m.read.mockResolvedValue({data:[],error:null});});
it.each([()=>listAuditLogs(),()=>listUserSecurityAuditLogs(8)])("distinguishes empty history from a returned query failure",async read=>{
 expect(await read()).toEqual([]);m.read.mockResolvedValue({data:null,error:{message:"PRIVATE_QUERY"}});
 await expect(read()).rejects.toThrow(/unavailable/);
});
it("sanitizes nested historical payloads before delivery",async()=>{
 m.read.mockResolvedValue({data:[{id:3,old_values:{nested:{access_token:"PRIVATE"}},new_values:{name:"Synthetic",secret:"PRIVATE"}}],error:null});
 const rows=await listUserSecurityAuditLogs(8);expect(JSON.stringify(rows)).not.toContain("PRIVATE");expect(rows[0].new_values).toHaveProperty("name","Synthetic");
});
const request=(id="8")=>new NextRequest(`http://localhost/api/admin/audit/user-history?user_profile_id=${id}`);
it("returns unavailable rather than successful empty history on dependency failure",async()=>{m.read.mockResolvedValue({data:null,error:{message:"PRIVATE_SQL"}});const r=await GET(request());expect(r.status).toBe(503);expect(await r.text()).not.toContain("PRIVATE_SQL");});
it("blocks stale role labels, inactive accounts and malformed subjects",async()=>{
 expect((await GET(request("8junk"))).status).toBe(400);
 m.auth.mockResolvedValue({...ctx,permissionCodes:[],globalPermissionCodes:[],roleCodes:["group_admin"]});expect((await GET(request())).status).toBe(403);
 m.auth.mockResolvedValue({...ctx,isAccountActive:false});expect((await GET(request())).status).toBe(403);expect(m.read).not.toHaveBeenCalled();
});
it("retires results if identity or assignments change during the read",async()=>{m.auth.mockResolvedValueOnce(ctx).mockResolvedValue({...ctx,profile:{id:2}});expect((await GET(request())).status).toBe(403);});
it("returns genuine empty history with private no-store caching",async()=>{const r=await GET(request());expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toContain("no-store");expect(await r.json()).toEqual({logs:[]});});
