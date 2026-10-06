import { afterEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { performanceFetch, traceOperation } from "@/lib/performance/trace";
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("observes the installed SDK's real retry header and preserves its result",async()=>{
  vi.stubEnv("ALGT_PERF_ENABLED","true");vi.stubEnv("ALGT_PERF_LOG_RETENTION_DAYS","1");vi.stubEnv("ALGT_PERF_SAMPLE_PERCENT","100");
  const sink=vi.spyOn(console,"info").mockImplementation(()=>{});let attempts=0;
  const transport=vi.fn(async()=>{attempts++;return attempts===1?new Response("{}",{status:520}):Response.json([{id:1}]);});vi.stubGlobal("fetch",transport);
  const client=createClient("http://backend.invalid","synthetic",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:performanceFetch}});
  vi.useFakeTimers();const pending=traceOperation("employees.list",async()=>client.from("employees").select("id"));await vi.runAllTimersAsync();
  const result=await pending;expect(result.error).toBeNull();expect(result.data).toEqual([{id:1}]);expect(attempts).toBe(2);
  const event=JSON.parse(String(sink.mock.calls[0][0]));expect(event.spans.map((s:{retry:number})=>s.retry)).toEqual([0,1]);expect(event.spans.map((s:{status:number})=>s.status)).toEqual([520,200]);
});
