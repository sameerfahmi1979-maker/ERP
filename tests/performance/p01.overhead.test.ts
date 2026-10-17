// Explicit offline measurement; no network, browser or provider is used.
import { expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { performanceFetch, traceOperation, traceSpan, tracedJsonResponse } from "@/lib/performance/trace";

type EvidenceHost = { platform: NodeJS.Platform; env: NodeJS.ProcessEnv };
const within = (root: string, target: string, paths: typeof path) => {
  const relative = paths.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(".." + paths.sep) && !paths.isAbsolute(relative);
};
function evidenceLocation(output: string | undefined, host: EvidenceHost) {
  if (!output) throw new Error("Fresh explicit evidence path required");
  if (host.platform === "win32") {
    const paths = path.win32;
    const root = paths.resolve("C:/dev");
    if (!paths.isAbsolute(output) || !within(root, paths.resolve(output), paths)) throw new Error("Fresh explicit C:/dev evidence path required");
    return { root, output: paths.resolve(output), paths };
  }
  // This exception is solely for the declared Linux GitHub runner, not a way
  // to move a local development workspace or evidence into a synced folder.
  const paths = path.posix;
  const temp = host.env.RUNNER_TEMP;
  if (host.platform !== "linux" || host.env.CI !== "true" || host.env.GITHUB_ACTIONS !== "true" || host.env.RUNNER_OS !== "Linux" || !temp || !paths.isAbsolute(temp) || paths.resolve(temp) === "/") {
    throw new Error("Non-Windows evidence requires the Linux GitHub runner temporary directory");
  }
  const root = paths.resolve(temp);
  if (!paths.isAbsolute(output) || !within(root, paths.resolve(output), paths)) throw new Error("Evidence must stay inside RUNNER_TEMP");
  return { root, output: paths.resolve(output), paths };
}
function freshEvidenceOutput(output: string | undefined) {
  const location = evidenceLocation(output, { platform: process.platform, env: process.env });
  const { root, paths } = location;
  const realRoot = fs.realpathSync(root);
  const realParent = fs.realpathSync(paths.dirname(location.output));
  if (paths.relative(root, realRoot) !== "" || (paths.relative(realRoot, realParent) !== "" && !within(realRoot, realParent, paths))) throw new Error("Evidence directory must not escape through a link");
  for (const filename of [location.output, location.output + ".events.jsonl"]) {
    try {
      fs.lstatSync(filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    throw new Error("Fresh evidence output and event sink required");
  }
  return location.output;
}

const runner = { platform: "linux" as const, env: { CI: "true", GITHUB_ACTIONS: "true", RUNNER_OS: "Linux", RUNNER_TEMP: "/runner/_temp" } };
it.each([
  "C:/dev/performance/run.json", "c:\\dev\\evidence\\run.json",
])("retains explicit local C: evidence ownership: %s", output => {
  expect(evidenceLocation(output, { platform: "win32", env: {} }).root).toBe("C:\\dev");
});
it.each([undefined, "run.json", "D:/dev/run.json", "C:/dev-other/run.json", "C:/dev/../Users/run.json", "\\\\server\\dev\\run.json"])("rejects local evidence outside C:/dev: %s", output => {
  expect(() => evidenceLocation(output, { platform: "win32", env: {} })).toThrow();
});
it("permits only explicit Linux CI evidence contained by RUNNER_TEMP", () => {
  expect(evidenceLocation("/runner/_temp/overhead/run.json", runner).output).toBe("/runner/_temp/overhead/run.json");
});
it.each(["/tmp/run.json", "/runner/_temp-other/run.json", "/runner/_temp/../outside.json", "/runner/_temp", "run.json"])("rejects CI evidence outside its temporary directory: %s", output => {
  expect(() => evidenceLocation(output, runner)).toThrow();
});
it.each(["CI", "GITHUB_ACTIONS", "RUNNER_OS", "RUNNER_TEMP"])("requires the declared CI host field %s", name => {
  expect(() => evidenceLocation("/runner/_temp/run.json", { ...runner, env: { ...runner.env, [name]: "" } })).toThrow();
});
it("rejects a root runner directory and other local platforms", () => {
  expect(() => evidenceLocation("/tmp/run.json", { ...runner, env: { ...runner.env, RUNNER_TEMP: "/" } })).toThrow();
  expect(() => evidenceLocation("/runner/_temp/run.json", { ...runner, platform: "darwin" })).toThrow();
});

it("measures bounded tracing overhead including a private local file sink", async () => {
  const output = freshEvidenceOutput(process.env.PERF_P01_OVERHEAD_OUTPUT);
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
