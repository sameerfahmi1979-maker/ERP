import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("ALGT_PERF_ENABLED", "true");
  vi.stubEnv("ALGT_PERF_LOG_RETENTION_DAYS", "1");
  vi.stubEnv("ALGT_PERF_SAMPLE_PERCENT", "100");
  vi.stubEnv("ALGT_PERF_MAX_TRACES_PER_MINUTE", "60");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("offline only"); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const load = () => import("@/lib/performance/trace");
function capture() { return vi.spyOn(console, "info").mockImplementation(() => {}); }

describe("P01 bounded private tracing", () => {
  it.each(["false", "", "TRUE"])("disabled flag %s preserves result without logs", async flag => {
    vi.stubEnv("ALGT_PERF_ENABLED", flag); const sink=capture(); const t=await load(); const result={secret:"hidden"};
    expect(await t.traceOperation("employees.list", async()=>result)).toBe(result); expect(sink).not.toHaveBeenCalled();
  });
  it.each(["0", "8", "NaN", "1.5", ""])("invalid retention %s prevents logging", async value => {
    vi.stubEnv("ALGT_PERF_LOG_RETENTION_DAYS",value); const sink=capture(); const t=await load();
    await t.traceOperation("employees.list",async()=>1); expect(sink).not.toHaveBeenCalled();
  });
  it.each(["0","NaN"])("sample %s declines safely",async value=>{
    vi.stubEnv("ALGT_PERF_SAMPLE_PERCENT",value); const sink=capture();const t=await load();
    await t.traceOperation("employees.list",async()=>1);expect(sink).not.toHaveBeenCalled();
  });
  it("never logs values, exception text, unsafe names or dynamic URLs", async()=>{
    const sink=capture();const t=await load();const secret="person@example.invalid?token=DO_NOT_LOG";
    const error=new Error(secret);
    await expect(t.traceOperation("documents.list",async()=>{throw error;},secret,"/secret/"+secret)).rejects.toBe(error);
    const event=JSON.parse(String(sink.mock.calls[0][0]));expect(event.outcome).toBe("error");expect(event.route).toBe("other");
    expect(event.id).toMatch(/^[\da-f-]{36}$/);expect(JSON.stringify(event)).not.toContain(secret);
    await t.traceOperation(secret as never,async()=>secret);expect(sink).toHaveBeenCalledTimes(1);
  });
  it("sink failure does not replace success or error",async()=>{
    vi.spyOn(console,"info").mockImplementation(()=>{throw new Error("sink down");});const t=await load();
    expect(await t.traceOperation("auth.context",async()=>7)).toBe(7);const error=new Error("original");
    await expect(t.traceOperation("auth.context",async()=>{throw error;})).rejects.toBe(error);
  });
  it("records returned business failures without exposing their text",async()=>{
    const sink=capture();const t=await load();const value={success:false,error:"PRIVATE"};
    expect(await t.traceOperation("documents.list",async()=>value)).toBe(value);
    expect(JSON.parse(String(sink.mock.calls[0][0])).outcome).toBe("error");expect(sink.mock.calls[0][0]).not.toContain("PRIVATE");
  });
  it("isolates concurrent actors and keeps nested spans in their own trace",async()=>{
    const sink=capture();const t=await load();let release!:()=>void;const held=new Promise<void>(r=>release=r);
    const first=t.traceOperation("employees.list",async()=>{await held;return t.traceSpan("auth.permissions",async()=>11);});
    expect(await t.traceOperation("documents.list",async()=>t.traceSpan("auth.session",async()=>22))).toBe(22);release();expect(await first).toBe(11);
    const records=sink.mock.calls.map(c=>JSON.parse(String(c[0])));
    expect(records[0].id).not.toBe(records[1].id);expect(records[0].spans.map((s:{name:string})=>s.name)).toEqual(["auth.session"]);
    expect(records[1].spans.map((s:{name:string})=>s.name)).toEqual(["auth.permissions"]);
  });
  it("bounds spans and declares truncation",async()=>{
    const sink=capture();const t=await load();await t.traceOperation("employees.list",async()=>{for(let i=0;i<150;i++)await t.traceSpan("auth.session",async()=>1);});
    const event=JSON.parse(String(sink.mock.calls[0][0]));expect(event.spans).toHaveLength(128);expect(event.dropped).toBe(22);
  });
  it("bounds admitted events and permits a fresh window",async()=>{
    vi.stubEnv("ALGT_PERF_MAX_TRACES_PER_MINUTE","2");const sink=capture();const t=await load();let now=100_000;vi.spyOn(Date,"now").mockImplementation(()=>now);
    for(let i=0;i<4;i++)await t.traceOperation("employees.list",async()=>1);expect(sink).toHaveBeenCalledTimes(2);
    now+=60_000;await t.traceOperation("employees.list",async()=>1);expect(sink).toHaveBeenCalledTimes(3);
  });
  it("keeps response identity/body and observes SDK retries without retrying itself",async()=>{
    const sink=capture();const t=await load();const response=new Response("PRIVATE",{status:520,headers:{"content-length":"7"}});
    const fetcher=vi.fn(async()=>response);vi.stubGlobal("fetch",fetcher);const request=new Request("http://backend.invalid/rest/v1/employees?name=PRIVATE",{headers:{authorization:"PRIVATE","x-retry-count":"2"}});
    await t.traceOperation("employees.list",async()=>{
      const actual=await t.performanceFetch(request);expect(actual).toBe(response);expect(actual.bodyUsed).toBe(false);expect(await actual.text()).toBe("PRIVATE");
    });expect(fetcher).toHaveBeenCalledExactlyOnceWith(request,undefined);
    const event=JSON.parse(String(sink.mock.calls[0][0]));expect(event.spans[0]).toMatchObject({name:"backend.employees",status:520,retry:2,contentLength:7,outcome:"error"});
    expect(JSON.stringify(event)).not.toContain("PRIVATE");
  });
  it("passes abort signal and original rejection unchanged",async()=>{
    const sink=capture();const t=await load();const controller=new AbortController();controller.abort();const error=new DOMException("private","AbortError");
    const fetcher=vi.fn(async()=>{throw error;});vi.stubGlobal("fetch",fetcher);const init={signal:controller.signal};
    await expect(t.traceOperation("employees.list",()=>t.performanceFetch("http://backend.invalid/unknown",init))).rejects.toBe(error);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("http://backend.invalid/unknown",init);expect(sink.mock.calls[0][0]).not.toContain("private");
  });
  it("reports missing content-length as unknown, never reads a body for telemetry",async()=>{
    const sink=capture();const t=await load();const response=new Response("body");vi.stubGlobal("fetch",vi.fn(async()=>response));
    await t.traceOperation("documents.list",()=>t.performanceFetch("http://backend.invalid/secret/path"));
    expect(response.bodyUsed).toBe(false);expect(JSON.parse(String(sink.mock.calls[0][0])).spans[0]).toMatchObject({name:"backend.other",contentLength:null});
  });
  it("measures actual JSON response construction without logging its contents",async()=>{
    const sink=capture();const t=await load();const value={name:"PRIVATE",arabic:"عربي"};
    const response=await t.traceOperation("session.route",async()=>t.tracedJsonResponse(value,{status:503,headers:{"cache-control":"private, no-store"}}));
    expect(await response.json()).toEqual(value);expect(response.headers.get("cache-control")).toBe("private, no-store");
    const event=JSON.parse(String(sink.mock.calls[0][0]));expect(event.outcome).toBe("error");expect(event.spans[0].contentLength).toBe(Buffer.byteLength(JSON.stringify(value)));expect(JSON.stringify(event)).not.toContain("PRIVATE");
  });
  it("normalizes known numeric routes without logging record IDs",async()=>{
    const t=await load();expect(t.performanceRoute("/admin/hr/employees/record/12345")).toBe("/admin/hr/employees/record/[id]");
    expect(t.performanceRoute("/user/private@email.invalid")).toBe("other");
  });
  it("samples correlated segments consistently and does not resample nested operations",async()=>{
    vi.stubEnv("ALGT_PERF_SAMPLE_PERCENT","1");const sink=capture();const t=await load();
    await t.traceOperation("proxy",async()=>t.traceOperation("auth.context",async()=>1),"ffffffff-1111-4111-8111-111111111111");
    expect(sink).not.toHaveBeenCalled();
    for(const name of ["proxy","employees.list"] as const)await t.traceOperation(name,async()=>1,"00000000-1111-4111-8111-111111111111");
    expect(sink).toHaveBeenCalledTimes(2);
  });
});
