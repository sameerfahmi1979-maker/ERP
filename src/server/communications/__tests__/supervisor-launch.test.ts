import {createHash,generateKeyPairSync,randomUUID,sign} from "node:crypto";
import {createServer} from "node:http";
import {once} from "node:events";
import {Readable} from "node:stream";
import type {AddressInfo} from "node:net";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {POST} from "@/app/api/internal/communications/supervisor-launch/route";
import {skipsSessionRefresh} from "@/lib/release/maintenance";
import {supervisorEnvironmentHash} from "../supervisor-wake";
const io=vi.hoisted(()=>({run:vi.fn(async(plan:unknown)=>{void plan;}),fetch:vi.fn(),registry:new Set<string>(),states:new Map()}));
vi.mock("../worker-supervisor",async importOriginal=>{
  const actual=await importOriginal<typeof import("../worker-supervisor")>();
  return {...actual,launchCommunicationWorkerSupervisors:(token:string)=>actual.launchCommunicationWorkerSupervisors(token,process.env,{run:io.run,registry:io.registry})};
});
vi.mock("../supervisor-wake",async importOriginal=>{
  const actual=await importOriginal<typeof import("../supervisor-wake")>();
  return {...actual,acceptSupervisorWake:(value:string)=>actual.acceptSupervisorWake(value,process.env,{fetch:io.fetch,states:io.states})};
});
const issuer=generateKeyPairSync("ed25519"), worker=randomUUID(),deployment=randomUUID(),boots=[randomUUID(),randomUUID()];
const cutoff=()=>new Date(Date.now()+3600000).toISOString();
let until:string;
function token(patch:Record<string,unknown>={}) {
  const m={v:1,purpose:"erp-communication-supervisor",deploymentId:deployment,until,planHash:"b".repeat(64),maxReplicas:1,maxRestartsPerDeployment:1,maxDeployments:1,maxPhysicalStarts:2,
    workers:[{kind:"ptt",worker,boots,retries:0,quarantineSeconds:100,maxLookups:4,maxPolls:400,busySeconds:30,pollSeconds:10,retrySeconds:60,restartSeconds:60,registrationSeconds:0,recoverySeconds:60}],...patch};
  const body=Buffer.from(JSON.stringify(m));return body.toString("base64url")+"."+sign(null,body,issuer.privateKey).toString("base64url");
}
function wake(patch:Record<string,unknown>={}){
 const now=Date.now(),body=Buffer.from(JSON.stringify({v:1,purpose:"erp-communication-supervisor-wake",planId:worker,deploymentId:deployment,nonce:randomUUID(),
  scheduledAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+24000).toISOString(),cutoff:until,configHash:supervisorEnvironmentHash(process.env),
  manifestHash:createHash("sha256").update(token()).digest("hex"),maxClaimsPerProcess:3,maxPhysicalStarts:2,...patch}));
 return body.toString("base64url")+"."+sign(null,body,issuer.privateKey).toString("base64url");
}
beforeEach(()=>{
  vi.spyOn(Date,"now").mockReturnValue(Date.parse("2026-11-24T12:00:00.000Z"));
  until=cutoff();io.registry.clear();io.states.clear();io.run.mockClear();io.fetch.mockReset();
  for(const[k,v]of Object.entries({ERP_COMM_WORKER_SUPERVISOR_ENABLED:"true",ERP_COMM_WORKER_SUPERVISOR_UNTIL:until,
    ERP_COMM_WORKER_BOOT_PUBLIC_KEY:issuer.publicKey.export({format:"der",type:"spki"}).toString("base64"),RAILWAY_DEPLOYMENT_ID:deployment,
    ERP_COMM_PTT_CLEANUP_ENABLED:"true",ERP_COMM_PTT_WORKER_ID:worker,ERP_COMM_PTT_BOOT_IDS:JSON.stringify(boots),ERP_COMM_PTT_LOOKUP_RETRIES:"0",ERP_COMM_PTT_RECOVERY_WAIT_SECONDS:"100"}))vi.stubEnv(k,v);
  vi.stubEnv("ERP_COMM_WORKER_SUPERVISOR_MANIFEST","");
  io.fetch.mockResolvedValue(token());
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
const request=(key:string,headers:Record<string,string>={},body?:string)=>new Request("https://erp.algt.net/api/internal/communications/supervisor-launch",{method:"POST",headers:{"X-ERP-Signed-Wake":key,...headers},body});
describe("post-deployment signed supervisor launch",()=>{
  it("accepts a current signed manifest without an env manifest and replays add no supervisor or database work",async()=>{
    expect((await POST(request(wake(),{"content-length":"2","content-type":"application/json"},"{}"))).status).toBe(204);
    expect((await POST(request(wake()))).status).toBe(204);
    expect(io.run).toHaveBeenCalledOnce();expect(io.fetch).toHaveBeenCalledOnce();expect(io.run.mock.calls[0][0]).toMatchObject({deploymentId:deployment,boots});
  });
  it("rejects signature/host/cutoff mismatch and disabled configuration before any supervisor work",async()=>{
    for(const key of ["bad",wake()+"x",token(),wake({deploymentId:randomUUID()}),wake({cutoff:new Date(Date.parse(until)+1000).toISOString()})])expect((await POST(request(key))).status).toBe(403);
    vi.stubEnv("ERP_COMM_WORKER_SUPERVISOR_ENABLED","false");expect((await POST(request(wake()))).status).toBe(403);
    expect(io.run).not.toHaveBeenCalled();expect(io.fetch).not.toHaveBeenCalled();
  });
  it("rejects browser metadata, unsupported bodies and ambiguous lengths without starting anything",async()=>{
    for(const[h,b]of [[{cookie:"x"},undefined],[{origin:"https://erp.algt.net"},undefined],[{"sec-fetch-site":"same-origin"},undefined],
      [{"content-length":"99"},undefined],[{"content-length":"2"},"[]"],[{"content-length":"0"},"x"]] as const)
      expect((await POST(request(wake(),h,b))).status).toBe(400);
    expect(io.run).not.toHaveBeenCalled();
  });
  it("skips refresh only for the exact internal POST after maintenance enforcement",()=>{
    const path="/api/internal/communications/supervisor-launch";
    expect(skipsSessionRefresh(path,"POST")).toBe(true);
    for(const method of ["GET","HEAD","PUT"])expect(skipsSessionRefresh(path,method)).toBe(false);
    expect(skipsSessionRefresh(path+"/other","POST")).toBe(false);
  });
  it("accepts the exact pg_net JSON body through a real Node HTTP stream without browser control",async()=>{
    const server=createServer(async(incoming,outgoing)=>{
      try{
        const forwarded=new Request("http://127.0.0.1/api/internal/communications/supervisor-launch",{
          method:incoming.method,headers:incoming.headers as HeadersInit,body:Readable.toWeb(incoming) as unknown as BodyInit,duplex:"half",
        } as RequestInit);
        outgoing.writeHead((await POST(forwarded)).status).end();
      }catch{outgoing.writeHead(500).end();}
    });
    server.listen(0,"127.0.0.1");
    try{
      await once(server,"listening");const port=(server.address() as AddressInfo).port;
      const result=await fetch(`http://127.0.0.1:${port}/api/internal/communications/supervisor-launch`,{
        method:"POST",headers:{"X-ERP-Signed-Wake":wake(),"Content-Type":"application/json"},body:"{}",redirect:"error",signal:AbortSignal.timeout(5000),
      });
      expect(result.status).toBe(204);expect(io.run).toHaveBeenCalledOnce();
    }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
});
