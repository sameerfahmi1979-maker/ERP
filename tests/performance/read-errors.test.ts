import {expect,it,vi} from "vitest";
vi.mock("@/lib/logger",()=>({logger:{warn:vi.fn()}}));
import {readRoute} from "@/server/reads/route-response";
import {ReadError,retryAuthorizedRead,readJson} from "@/lib/reads/client";
import {makeQueryClient} from "@/lib/query/query-client";
import {invalidateHrEmployees,invalidateDmsDocuments,invalidateCommonMdDepartments} from "@/lib/query/invalidation";
it("read failures have opaque correlation and never expose database messages or private inputs",async()=>{
 const request=()=>new Request("https://test.invalid/api/reads/example",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({search:"private synthetic term"})});
 const result=await readRoute(request(),async()=>({success:false,error:"database row: private synthetic term"}));
 expect(result.status).toBe(503);expect(result.headers.get("cache-control")).toContain("no-store");
 const body=await result.json();expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/);expect(body.error).not.toContain("database");expect(body.error).not.toContain("private");
 const second=await readRoute(request(),async()=>{throw Error("private credential");});expect(second.status).toBe(503);expect((await second.json()).correlationId).not.toBe(body.correlationId);
 const denied=await readRoute(request(),async()=>({success:false,error:"Permission denied"}));expect(denied.status).toBe(403);
 const malformed=await readRoute(new Request("https://test.invalid",{method:"POST",headers:{"content-type":"application/json"},body:"{"}),vi.fn());expect(malformed.status).toBe(400);
 const oversized=await readRoute(new Request("https://test.invalid",{method:"POST",headers:{"content-type":"application/json"},body:" ".repeat(4001)}),vi.fn());expect(oversized.status).toBe(400);
});
it("denied and invalid reads are not retried; transient retries are bounded",async()=>{
 for(const status of [400,401,403,404])expect(retryAuthorizedRead(0,new ReadError("failed",status))).toBe(false);
 expect(retryAuthorizedRead(0,new ReadError("failed",503))).toBe(true);expect(retryAuthorizedRead(1,new ReadError("failed",503))).toBe(false);
 const fetcher=vi.fn(async()=>new Response("",{status:403,headers:{"X-ERP-Correlation":"synthetic-reference"}}));vi.stubGlobal("fetch",fetcher);
 try{await expect(readJson("example",{})).rejects.toMatchObject({status:403,correlationId:"synthetic-reference"});}finally{vi.unstubAllGlobals();}
});
it("existing save invalidators reach new pilot keys without invalidating unrelated records",async()=>{
 const cache=makeQueryClient();for(const resource of ["employees","dms-documents","employee-filter-departments","employee-filter-designations","unrelated"])cache.setQueryData(["read",resource,"{}"],{rows:[]});
 invalidateHrEmployees(cache);invalidateDmsDocuments(cache);invalidateCommonMdDepartments(cache);
 for(const resource of ["employees","dms-documents","employee-filter-departments","employee-filter-designations"])expect(cache.getQueryState(["read",resource,"{}"])?.isInvalidated).toBe(true);
 expect(cache.getQueryState(["read","unrelated","{}"])?.isInvalidated).toBe(false);cache.clear();
});
