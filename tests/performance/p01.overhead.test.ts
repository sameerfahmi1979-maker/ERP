// Explicit offline measurement; no network, browser or provider is used.
import { expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { performanceFetch, traceOperation, traceSpan, tracedJsonResponse } from "@/lib/performance/trace";

it("measures bounded tracing overhead including a private local file sink", async () => {
  const output = process.env.PERF_P01_OVERHEAD_OUTPUT;
  if (!output || !path.resolve(output).toLowerCase().startsWith("c:\\dev\\") || fs.existsSync(output)) throw new Error("Fresh explicit C:/dev evidence path required");
  const sinkPath = output + ".events.jsonl";
  const fd = fs.openSync(sinkPath, "wx");
  const samples: Array<{ batch: number; enabled: boolean; perOperationMs: number }> = [];
  let events = 0;
  const payload = { rows: Array.from({ length: 25 }, (_, id) => ({ id, label: "synthetic" })) };
  vi.stubGlobal("fetch", async () => new Response("{}", { headers: { "content-length": "2" } }));
  vi.spyOn(console, "info").mockImplementation(value => { fs.writeSync(fd, String(value) + "\n"); events++; });
  vi.stubEnv("ALGT_PERF_LOG_RETENTION_DAYS", "1");
  vi.stubEnv("ALGT_PERF_SAMPLE_PERCENT", "100");
  vi.stubEnv("ALGT_PERF_MAX_TRACES_PER_MINUTE", "2000");
  const work = () => traceOperation("employees.list", async () => {
    await traceSpan("auth.context", async () => {
      for (let call = 0; call < 8; call++) await (await performanceFetch("https://synthetic.invalid/rest/v1/employees")).text();
    });
    return tracedJsonResponse(payload).text();
  });
  try {
    for (const enabled of [false, true]) {
      vi.stubEnv("ALGT_PERF_ENABLED", String(enabled));
      for (let i = 0; i < 50; i++) await work();
    }
    for (let batch = 0; batch < 12; batch++) for (const enabled of batch % 2 ? [true, false] : [false, true]) {
      vi.stubEnv("ALGT_PERF_ENABLED", String(enabled));
      const start = performance.now();
      for (let i = 0; i < 50; i++) expect(await work()).toBe(JSON.stringify(payload));
      samples.push({ batch, enabled, perOperationMs: (performance.now() - start) / 50 });
    }
    const median = (values: number[]) => { const v = [...values].sort((a,b)=>a-b); return (v[5] + v[6]) / 2; };
    const off = median(samples.filter(s=>!s.enabled).map(s=>s.perOperationMs));
    const on = median(samples.filter(s=>s.enabled).map(s=>s.perOperationMs));
    fs.writeFileSync(output, JSON.stringify({ kind: "OFFLINE_LOCAL_FILE_SINK_NOT_HOST_LOGGING", samples, events, medianOffMs: off, medianOnMs: on, medianAddedMs: on-off, acceptanceAddedMs: 1, qualification: "Predeclared 1ms median additional local cost per eight-attempt synthetic operation. This does not establish hosting log cost, a browser metric or a production SLA." }, null, 2), { flag: "wx" });
    expect(events).toBe(650);
    expect(on - off).toBeLessThanOrEqual(1);
  } finally { fs.closeSync(fd); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
});
