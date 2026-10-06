import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({expiry:vi.fn(),summary:vi.fn(),renewals:vi.fn()}));
vi.mock("@/server/actions/dms/expiry-reminders",()=>({getDmsExpiringDocuments:mocks.expiry,getDmsExpiryDashboardStats:mocks.summary}));
vi.mock("@/server/actions/dms/renewals",()=>({getDmsRenewalRequests:mocks.renewals}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:vi.fn()}));
vi.mock("@/lib/logger",()=>({logger:{warn:vi.fn()}}));
import {POST as expiry} from "@/app/api/reads/dms-expiring/route";
import {POST as summary} from "@/app/api/reads/dms-expiry-summary/route";
import {POST as renewals} from "@/app/api/reads/dms-renewals/route";
const routes=[{name:"expiry",run:expiry,read:mocks.expiry,params:{view:"expiring"}},{name:"summary",run:summary,read:mocks.summary,params:{}},{name:"renewals",run:renewals,read:mocks.renewals,params:{}}];
const request=(params:unknown={},signal?:AbortSignal)=>new Request("http://localhost/api/reads/test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(params),signal});
beforeEach(()=>{vi.resetAllMocks();for(const route of routes)route.read.mockResolvedValue({success:true,data:[]});});
it.each(routes)("$name is a private uncached validated read",async({run,read,params})=>{
 const response=await run(request(params));expect(response.status).toBe(200);expect(read).toHaveBeenCalledOnce();
 expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");expect(response.headers.get("vary")).toBe("Cookie");
});
it.each(routes)("$name rejects unsupported filters before database work",async({run,read})=>{
 expect((await run(request({unreviewed:"value"}))).status).toBe(400);expect(read).not.toHaveBeenCalled();
});
it.each(routes)("$name maps unauthenticated and denied reads to terminal denial",async({run,read,params})=>{
 for(const error of ["Not authenticated","Permission denied"]){read.mockResolvedValue({success:false,error});expect((await run(request(params))).status).toBe(403);}
});
it.each(routes)("$name does not expose provider errors",async({run,read,params})=>{
 read.mockResolvedValue({success:false,error:"sensitive SQL detail"});const response=await run(request(params));expect(response.status).toBe(503);expect(await response.text()).not.toContain("sensitive SQL detail");
});
it.each(routes)("$name does not dispatch an already aborted read",async({run,read})=>{
 const controller=new AbortController();controller.abort();const response=await run(request({},controller.signal));expect(response.headers.get("X-ERP-Read-Outcome")).toBe("cancelled");expect(read).not.toHaveBeenCalled();
});
it.each(routes)("$name fences a result delivered after cancellation",async({run,read,params})=>{
 const controller=new AbortController();read.mockImplementation(async()=>{controller.abort();return {success:true,data:[{privateRecord:"must not be delivered"}]};});
 const response=await run(request(params,controller.signal));expect(response.headers.get("X-ERP-Read-Outcome")).toBe("cancelled");expect(await response.text()).not.toContain("privateRecord");
});
