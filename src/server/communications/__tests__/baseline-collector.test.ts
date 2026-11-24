import {generateKeyPairSync,randomUUID,sign} from "node:crypto";
import {afterEach,describe,expect,it,vi} from "vitest";
import {fetchBaselineDiskMetrics,parseBaselineDiskMetrics,readBaselineCollectorGrant,runBaselineCollector} from "../baseline-collector";
import {POST} from "@/app/api/internal/communications/refresh-baseline/route";
const io=vi.hoisted(()=>({admin:vi.fn<()=>unknown>(()=>{throw Error("Unexpected RPC");})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:io.admin}));
vi.mock("@/lib/config/server-features",()=>({getAdminConfig:()=>({url:"https://mmiefuieduzdiiwnqpie.supabase.co",serviceKey:"synthetic-test-secret"})}));
const issuer=generateKeyPairSync("ed25519"), now=Date.parse("2026-11-24T10:00:00Z");
const deployment=randomUUID(), pool=randomUUID(), allocation=randomUUID(), planId=randomUUID(), nonces=[randomUUID(),randomUUID()];
const base=()=>({v:1,purpose:"erp-communication-baseline-tick",intent:"measure-baseline",planId,deploymentId:deployment,poolId:pool,allocationId:allocation,
  startsAt:new Date(now-1000).toISOString(),until:new Date(now+119000).toISOString(),maxTicks:2,maxPhysicalStarts:4,
  maxStorageObjects:1000,maxRelations:512,planHash:"a".repeat(64),nonce:nonces[0],ordinal:1,scheduledAt:new Date(now-1000).toISOString()});
function token(patch:Record<string,unknown>={}) {const body=Buffer.from(JSON.stringify({...base(),...patch}));return body.toString("base64url")+"."+sign(null,body,issuer.privateKey).toString("base64url");}
const env=()=>({ERP_COMM_BASELINE_COLLECTOR_ENABLED:"true",ERP_COMM_BASELINE_COLLECTOR_PLAN_ID:planId,
  ERP_COMM_BASELINE_COLLECTOR_UNTIL:base().until,ERP_COMM_WORKER_BOOT_PUBLIC_KEY:issuer.publicKey.export({format:"der",type:"spki"}).toString("base64"),RAILWAY_DEPLOYMENT_ID:deployment});
const labels='supabase_project_ref="mmiefuieduzdiiwnqpie",supabase_identifier="mmiefuieduzdiiwnqpie",service_type="db",device="/dev/nvme1n1",device_error="",fstype="ext4",mountpoint="/data"';
const metrics=()=>`# test fixture\nnode_filesystem_size_bytes{${labels}} 8.416882688e+09\nnode_filesystem_avail_bytes{${labels}} 7.9398912e+09\n`;
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();io.admin.mockClear();});
describe("finite prepaid baseline collector",()=>{
  it("measures only the exact project's /data available and size pair",()=>{
    expect(parseBaselineDiskMetrics(metrics())).toMatchObject({sizeBytes:"8416882688",availableBytes:"7939891200",usedBytes:"476991488"});
    expect(parseBaselineDiskMetrics(metrics().replaceAll('/data','/'))).toBeNull();
    for(const body of [metrics()+metrics(),metrics().replace('7.9398912e+09','NaN'),metrics().replace('7.9398912e+09','9e09'),
      metrics().replace('8.416882688e+09','9007199254740993'),metrics().replaceAll('mmiefuieduzdiiwnqpie','another-project'),
      metrics().replace('7.9398912e+09','1.0000000000000001'),
      metrics().replace('device_error=""','device_error="1"'),metrics().replace('fstype="ext4"','fstype="ext4",fstype="xfs"')]) expect(parseBaselineDiskMetrics(body)).toBeNull();
  });
  it("requires an offline valid exact-purpose/deployment/plan/cutoff/nonce envelope",()=>{
    expect(readBaselineCollectorGrant(token(),nonces[0],env(),now)).toMatchObject({planId,poolId:pool,allocationId:allocation,maxTicks:2});
    for(const [t,n,e] of [[token()+"x",nonces[0],env()],[token(),randomUUID(),env()],[token(),nonces[1],env()],
      [token({purpose:"erp-communication-supervisor"}),nonces[0],env()],[token({extra:true}),nonces[0],env()],
      [token({nonces}),nonces[0],env()],[token({ordinal:3}),nonces[0],env()],[token({intent:"retire-another-pool"}),nonces[0],env()],
      [token({purpose:"erp-communication-baseline-plan"}),nonces[0],env()],[token({maxTicks:3}),nonces[0],env()],
      [token(),nonces[0],{...env(),RAILWAY_DEPLOYMENT_ID:randomUUID()}],[token(),nonces[0],{...env(),ERP_COMM_BASELINE_COLLECTOR_ENABLED:"false"}] ] as const)
      expect(readBaselineCollectorGrant(t,n,e,now)).toBeNull();
    expect(readBaselineCollectorGrant(token(),nonces[0],env(),now+119000)).toBeNull();
  });
  it("rejects invalid offline auth before any RPC, and a claim rejection before metrics",async()=>{
    const claim=vi.fn(async()=>false),fetchMetrics=vi.fn(),record=vi.fn();
    expect(await runBaselineCollector("bad",nonces[0],env(),{claim,fetchMetrics,record,now:()=>now,seen:new Set()})).toBe("invalid");
    expect(claim).not.toHaveBeenCalled();
    expect(await runBaselineCollector(token(),nonces[0],env(),{claim,fetchMetrics,record,now:()=>now,seen:new Set()})).toBe("held");
    expect(fetchMetrics).not.toHaveBeenCalled();expect(record).not.toHaveBeenCalled();
  });
  it("claims once, fetches once and records parsed provider values without accepting caller freshness",async()=>{
    const order:string[]=[], seen=new Set<string>();
    const claim=vi.fn(async()=>{order.push("claim");return true;}),fetchMetrics=vi.fn(async()=>{order.push("metrics");return parseBaselineDiskMetrics(metrics())!;});
    const record=vi.fn(async(_grant:unknown,_nonce:string,_metrics:unknown)=>{void _grant;void _nonce;void _metrics;order.push("record");return true;});
    const deps={claim,fetchMetrics,record,now:()=>now,seen};
    expect(await runBaselineCollector(token(),nonces[0],env(),deps)).toBe("updated");
    expect(order).toEqual(["claim","metrics","record"]);
    expect(record.mock.calls[0][2]).toMatchObject({sizeBytes:"8416882688",availableBytes:"7939891200"});
    expect(await runBaselineCollector(token(),nonces[0],env(),deps)).toBe("held");expect(claim).toHaveBeenCalledOnce();
  });
  it("burns uncertain/failing work without retry or record and leaves the SQL claim's admission hold",async()=>{
    for(const fail of ["claim","fetch","record"]) {
      const claim=vi.fn(async()=>{if(fail==="claim")throw Error("private credential must not surface");return true;});
      const fetchMetrics=vi.fn(async()=>{if(fail==="fetch")throw Error("body must not surface");return parseBaselineDiskMetrics(metrics())!;});
      const record=vi.fn(async()=>{if(fail==="record")throw Error("RPC must not surface");return true;});
      expect(await runBaselineCollector(token(),nonces[0],env(),{claim,fetchMetrics,record,now:()=>now,seen:new Set()})).toBe("held");
      expect(claim).toHaveBeenCalledOnce();if(fail!=="record")expect(record).not.toHaveBeenCalled();
    }
  });
  it("does not start provider work when a delayed claim used the original tail",async()=>{
    let clock=now;const fetchMetrics=vi.fn(),record=vi.fn();
    expect(await runBaselineCollector(token(),nonces[0],env(),{claim:async()=>{clock+=110000;return true;},fetchMetrics,record,now:()=>clock,seen:new Set()})).toBe("held");
    expect(fetchMetrics).not.toHaveBeenCalled();expect(record).not.toHaveBeenCalled();
  });
  it("uses only the fixed metrics URL, Basic service_role auth, no redirects and bounded response bytes",async()=>{
    const f=vi.fn(async(_url:Parameters<typeof fetch>[0],_options?:RequestInit)=>{void _url;void _options;return new Response(metrics(),{status:200});});
    expect(await fetchBaselineDiskMetrics(f)).toMatchObject({usedBytes:"476991488"});
    expect(f.mock.calls[0][0]).toBe("https://mmiefuieduzdiiwnqpie.supabase.co/customer/v1/privileged/metrics");
    expect(f.mock.calls[0][1]).toMatchObject({redirect:"error",cache:"no-store",headers:{Authorization:"Basic "+Buffer.from("service_role:synthetic-test-secret").toString("base64")}});
    for(const response of [new Response("",{status:302,headers:{Location:"https://example.com"}}),new Response(metrics(),{headers:{"Content-Length":"2097153"}}),
      new Response("x".repeat(2097153)),new Response(new Uint8Array([255]))])
      await expect(fetchBaselineDiskMetrics(async()=>response)).rejects.toThrow("Baseline metrics unavailable");
  });
  it("refuses browser context or arbitrary body and unauthenticated route requests without RPC",async()=>{
    for(const headers of [{},{authorization:"Bearer bad"},{authorization:"Bearer bad",cookie:"session=x"}] as Record<string,string>[])
      expect((await POST(new Request("https://erp.algt.net/api/internal/communications/refresh-baseline",{method:"POST",headers}))).status).toBeGreaterThanOrEqual(400);
    expect(io.admin).not.toHaveBeenCalled();
  });
  it("checks a signed route body before RPC and runs a valid fixed-body request through real claim/fetch/record boundaries",async()=>{
    for(const [name,value]of Object.entries(env()))vi.stubEnv(name,value);
    vi.spyOn(Date,"now").mockReturnValue(now);
    const headers={authorization:"Bearer "+token(),"x-erp-baseline-nonce":nonces[0],"content-length":"2"};
    expect((await POST(new Request("https://erp.algt.net/api/internal/communications/refresh-baseline",{method:"POST",headers,body:"xx"}))).status).toBe(400);
    expect(io.admin).not.toHaveBeenCalled();
    const rpc=vi.fn((_name:string,_args:unknown)=>{void _name;void _args;return {abortSignal:async()=>({data:true,error:null})};});
    io.admin.mockImplementation(()=>({rpc}));vi.stubGlobal("fetch",vi.fn(async()=>new Response(metrics())));
    expect((await POST(new Request("https://erp.algt.net/api/internal/communications/refresh-baseline",{method:"POST",headers,body:"{}"}))).status).toBe(204);
    expect(rpc.mock.calls.map(call=>call[0])).toEqual(["erp_comm_baseline_collector_claim","erp_comm_baseline_collector_record"]);
    expect(rpc.mock.calls[1][1]).toEqual({p_plan:planId,p_nonce:nonces[0],p_size:"8416882688",p_available:"7939891200",p_digest:expect.stringMatching(/^[0-9a-f]{64}$/)});
    expect((await POST(new Request("https://erp.algt.net/api/internal/communications/refresh-baseline",{method:"POST",headers,body:"{}"}))).status).toBe(503);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
