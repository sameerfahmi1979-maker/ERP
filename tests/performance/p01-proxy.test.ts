import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const state=vi.hoisted(()=>({seen: null as NextRequest|null, maintenance:false}));
vi.mock("@/lib/supabase/middleware",()=>({updateSession:async(request:NextRequest)=>{state.seen=request;return NextResponse.next({request});}}));
vi.mock("@/lib/release/maintenance",()=>({releaseResponse:()=>state.maintenance?new Response("maintenance",{status:503}):null,skipsSessionRefresh:()=>false}));
import { proxy } from "@/proxy";
import { PERF_HEADER, PERF_ROUTE_HEADER } from "@/lib/performance/trace";
beforeEach(()=>{state.seen=null;state.maintenance=false;vi.stubEnv("ALGT_PERF_ENABLED","true");vi.stubEnv("ALGT_PERF_LOG_RETENTION_DAYS","1");vi.stubEnv("ALGT_PERF_SAMPLE_PERCENT","100");vi.spyOn(console,"info").mockImplementation(()=>{});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it("replaces client correlation and passes only a static route template",async()=>{
  const old="11111111-1111-4111-8111-111111111111";
  const request=new NextRequest("http://app.invalid/admin/hr/employees/record/99?token=PRIVATE",{headers:{[PERF_HEADER]:old,[PERF_ROUTE_HEADER]:"PRIVATE"}});
  await proxy(request);expect(state.seen?.headers.get(PERF_HEADER)).not.toBe(old);expect(state.seen?.headers.get(PERF_ROUTE_HEADER)).toBe("/admin/hr/employees/record/[id]");
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("PRIVATE");
});
it("strips spoofed headers even with tracing disabled",async()=>{
  vi.stubEnv("ALGT_PERF_ENABLED","false");const request=new NextRequest("http://app.invalid/login",{headers:{[PERF_HEADER]:"spoof",[PERF_ROUTE_HEADER]:"spoof"}});
  await proxy(request);expect(state.seen?.headers.has(PERF_HEADER)).toBe(false);expect(state.seen?.headers.has(PERF_ROUTE_HEADER)).toBe(false);expect(console.info).not.toHaveBeenCalled();
});
it("preserves the maintenance gate before authentication",async()=>{
  state.maintenance=true;const response=await proxy(new NextRequest("http://app.invalid/admin/hr/employees"));expect(response.status).toBe(503);expect(state.seen).toBeNull();
});

it("delegates Inbox POST authentication to the handler and forwards the trusted trace", async () => {
  const old = "11111111-1111-4111-8111-111111111111";
  const request = new NextRequest("http://app.invalid/api/reads/dms-inbox", {
    method: "POST",
    headers: {[PERF_HEADER]: old, [PERF_ROUTE_HEADER]: "spoof", cookie: "fixture=read-cookie"},
  });

  const response = await proxy(request);

  expect(state.seen).toBeNull();
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(response.headers.get(`x-middleware-request-${PERF_HEADER}`)).toBe(request.headers.get(PERF_HEADER));
  expect(request.headers.get(PERF_HEADER)).not.toBe(old);
  expect(response.headers.get(`x-middleware-request-${PERF_ROUTE_HEADER}`)).toBe("/api/reads/dms-inbox");
  expect(response.headers.get("x-middleware-request-cookie")).toBe("fixture=read-cookie");
});

it.each([
  ["GET", "/api/reads/dms-inbox"],
  ["HEAD", "/api/reads/dms-inbox"],
  ["POST", "/api/reads/dms-inbox-history"],
  ["POST", "/api/reads/dms-dashboard"],
])("retains session refresh for %s %s", async (method, path) => {
  const request = new NextRequest(`http://app.invalid${path}`, {method});
  await proxy(request);
  expect(state.seen).toBe(request);
});

it("blocks Inbox POST in maintenance before delegating authentication", async () => {
  state.maintenance = true;
  const response = await proxy(new NextRequest("http://app.invalid/api/reads/dms-inbox", {method: "POST"}));
  expect(response.status).toBe(503);
  expect(state.seen).toBeNull();
});
