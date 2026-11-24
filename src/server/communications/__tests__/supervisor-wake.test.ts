import {createHash,generateKeyPairSync,randomUUID,sign} from "node:crypto";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {acceptSupervisorWake,readSignedSupervisorWake,supervisorEnvironmentHash} from "../supervisor-wake";
const issuer=generateKeyPairSync("ed25519"),now=Date.parse("2026-11-24T12:00:00.000Z"),worker=randomUUID(),deployment=randomUUID(),plan=randomUUID(),boots=[randomUUID(),randomUUID()];
const env=()=>({ERP_COMM_WORKER_SUPERVISOR_ENABLED:"true",ERP_COMM_WORKER_SUPERVISOR_UNTIL:new Date(now+3600000).toISOString(),
 ERP_COMM_WORKER_BOOT_PUBLIC_KEY:issuer.publicKey.export({format:"der",type:"spki"}).toString("base64"),RAILWAY_DEPLOYMENT_ID:deployment,
 ERP_COMM_PTT_CLEANUP_ENABLED:"true",ERP_COMM_PTT_WORKER_ID:worker,ERP_COMM_PTT_BOOT_IDS:JSON.stringify(boots),ERP_COMM_PTT_LOOKUP_RETRIES:"1",ERP_COMM_PTT_RECOVERY_WAIT_SECONDS:"100"});
const privateManifest="private-fixture-manifest",digest=createHash("sha256").update(privateManifest).digest("hex");
function token(patch:Record<string,unknown>={}){const body=Buffer.from(JSON.stringify({v:1,purpose:"erp-communication-supervisor-wake",planId:plan,deploymentId:deployment,nonce:randomUUID(),
 scheduledAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+24000).toISOString(),cutoff:env().ERP_COMM_WORKER_SUPERVISOR_UNTIL,
 configHash:supervisorEnvironmentHash(env(),now),manifestHash:digest,maxClaimsPerProcess:3,maxPhysicalStarts:2,...patch}));
 return body.toString("base64url")+"."+sign(null,body,issuer.privateKey).toString("base64url");}
beforeEach(()=>vi.spyOn(Date,"now").mockReturnValue(now));afterEach(()=>vi.restoreAllMocks());
describe("public-safe current wake and private manifest claim",()=>{
 it("rejects malformed/expired/future/misconfigured wake offline before any funded fetch",async()=>{
  const fetch=vi.fn();for(const t of ["bad",token()+"x",token({purpose:"erp-communication-supervisor"}),token({expiresAt:new Date(now-1).toISOString()}),token({scheduledAt:new Date(now+10000).toISOString()}),token({deploymentId:randomUUID()})])
   expect((await acceptSupervisorWake(t,env(),{fetch,states:new Map()})).status).toBe(403);
  expect(readSignedSupervisorWake(token(),{...env(),ERP_COMM_PTT_LOOKUP_RETRIES:"2"})).toBeNull();expect(fetch).not.toHaveBeenCalled();
 });
 it("fetches private content once, returns only status, and same-nonce replay creates zero extra RPC",async()=>{
  const fetch=vi.fn(async()=>privateManifest),launch=vi.fn(()=>({valid:true,started:1})),states=new Map();const t=token();
  expect(await acceptSupervisorWake(t,env(),{fetch,launch,states})).toEqual({status:204});
  expect(await acceptSupervisorWake(t,env(),{fetch,launch,states})).toEqual({status:204});
  expect(fetch).toHaveBeenCalledOnce();expect(launch).toHaveBeenCalledWith(privateManifest,expect.anything());
 });
 it("caps failed/taken/lost claims per process across fresh current nonces and never launches wrong private bytes",async()=>{
  const fetch=vi.fn(async()=>null),launch=vi.fn(),states=new Map();
  for(let i=0;i<8;i++)await acceptSupervisorWake(token(),env(),{fetch,launch,states});
  expect(fetch).toHaveBeenCalledTimes(3);expect(launch).not.toHaveBeenCalled();
  const bad=vi.fn(async()=>"wrong-private-manifest");await acceptSupervisorWake(token(),env(),{fetch:bad,launch,states:new Map()});expect(launch).not.toHaveBeenCalled();
 });
 it("reserves one in-flight claim locally and does not disclose manifest bytes or permit arbitrary access",async()=>{
  let done!:(value:string)=>void;const pending=new Promise<string>(resolve=>{done=resolve;}),fetch=vi.fn(async()=>pending),states=new Map(),launch=vi.fn(()=>({valid:true,started:1}));
  const first=acceptSupervisorWake(token(),env(),{fetch,launch,states});await Promise.resolve();
  expect(await acceptSupervisorWake(token(),env(),{fetch,launch,states})).toEqual({status:204});expect(fetch).toHaveBeenCalledOnce();
  done(privateManifest);expect(await first).toEqual({status:204});
 });
});
