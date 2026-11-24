import {generateKeyPairSync,randomUUID,sign} from "node:crypto";
import {afterEach,describe,expect,it,vi} from "vitest";
import {readSignedNotificationTick,runSignedNotificationTick} from "../signed-notification-tick";
import {POST} from "@/app/api/internal/communications/notification-tick/route";
import {POST as legacy} from "@/app/api/internal/process-communication-push/route";
const io=vi.hoisted(()=>({admin:vi.fn(()=>{throw Error("Unexpected SQL");})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:io.admin}));
const key=generateKeyPairSync("ed25519"),time=Date.parse("2026-11-24T12:00:01Z");
const planId=randomUUID(),deploymentId=randomUUID(),poolId=randomUUID(),allocationId=randomUUID(),nonce=randomUUID();
const base=()=>({v:1,purpose:"erp-communication-notification-tick",intent:"dispatch-notifications",planId,deploymentId,poolId,allocationId,
 startsAt:"2026-11-24T12:00:00.000Z",until:"2026-11-24T12:02:00.000Z",maxTicks:2,maxPhysicalStarts:11,
 maxClaims:1,calendarEnabled:true,pushEnabled:true,planHash:"a".repeat(64),nonce,ordinal:1,scheduledAt:"2026-11-24T12:00:00.000Z"});
const token=(patch:Record<string,unknown>={})=>{const body=Buffer.from(JSON.stringify({...base(),...patch}));return body.toString("base64url")+"."+sign(null,body,key.privateKey).toString("base64url");};
const env=()=>({ERP_COMM_NOTIFICATION_SCHEDULER_ENABLED:"true",ERP_COMM_NOTIFICATION_PLAN_ID:planId,ERP_COMM_NOTIFICATION_UNTIL:base().until,
 RAILWAY_DEPLOYMENT_ID:deploymentId,ERP_COMM_WORKER_BOOT_PUBLIC_KEY:key.publicKey.export({format:"der",type:"spki"}).toString("base64")});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();io.admin.mockClear();});
describe("current-only signed notification ticks",()=>{
 it("requires exact offline signature, purpose, deployment, plan, nonce and finite clock before SQL",async()=>{
  expect(readSignedNotificationTick(token(),nonce,env(),time)).toMatchObject({planId,maxClaims:1});
  const claim=vi.fn();
  for(const [t,n,e,clock] of [[token()+"x",nonce,env(),time],[token(),randomUUID(),env(),time],
   [token({purpose:"erp-communication-baseline-tick"}),nonce,env(),time],[token({extra:true}),nonce,env(),time],
   [token({maxClaims:9}),nonce,env(),time],[token({ordinal:3}),nonce,env(),time],
   [token(),nonce,{...env(),RAILWAY_DEPLOYMENT_ID:randomUUID()},time],[token(),nonce,{...env(),ERP_COMM_NOTIFICATION_SCHEDULER_ENABLED:"false"},time],
   [token(),nonce,env(),time-2000],[token(),nonce,env(),time+15000]] as const){
    expect(await runSignedNotificationTick(t,n,e,{claim,now:()=>clock,seen:new Set()})).toBe("invalid");
  }
  expect(claim).not.toHaveBeenCalled();expect(io.admin).not.toHaveBeenCalled();
 });
 it("claims once per process/nonce and does no provider work after rejection or uncertain claim",async()=>{
  for(const rejected of [true,false]){const seen=new Set<string>(),claim=vi.fn(async()=>{if(rejected)throw Error("private SQL failure");return null;});
   const dispatch=vi.fn(),finish=vi.fn();const deps={claim,dispatch,finish,now:()=>time,seen};
   expect(await runSignedNotificationTick(token(),nonce,env(),deps)).toBe("held");
   expect(await runSignedNotificationTick(token(),nonce,env(),deps)).toBe("held");
   expect(claim).toHaveBeenCalledOnce();expect(dispatch).not.toHaveBeenCalled();expect(finish).not.toHaveBeenCalled();}
 });
 it("uses one dispatch and reserves five seconds for confirmation, with SQL's hard end",async()=>{
  const claim=vi.fn(async()=>({pushEnabled:true,workUntilMs:time+40000})),dispatch=vi.fn(async()=>({state:"idle"})),finish=vi.fn(async()=>true);
  expect(await runSignedNotificationTick(token(),nonce,env(),{claim,dispatch,finish,now:()=>time,seen:new Set()})).toBe("processed");
  expect(dispatch).toHaveBeenCalledTimes(1);expect(dispatch).toHaveBeenCalledWith({hardEnd:time+35000});expect(finish).toHaveBeenCalledOnce();
 });
 it("keeps calendar-only work, failed dispatch, and late completion finite without successors",async()=>{
  for(const mode of ["calendar","failed","late"]){let clock=time;
   const claim=vi.fn(async()=>({pushEnabled:mode!=="calendar",workUntilMs:time+(mode==="late"?5000:40000)}));
   const dispatch=vi.fn(async()=>{if(mode==="failed")throw Error("private provider failure");clock+=1;return{state:"idle"};});
   const finish=vi.fn(async()=>true);
   const result=await runSignedNotificationTick(token({pushEnabled:mode!=="calendar"}),nonce,env(),{claim,dispatch,finish,now:()=>clock,seen:new Set()});
   expect(result).toBe(mode==="calendar"?"processed":"held");
   expect(dispatch).toHaveBeenCalledTimes(mode==="failed"?1:0);expect(finish).toHaveBeenCalledTimes(mode==="late"?0:1);
  }
 });
 it("rejects body/cookie/origin mutations without SQL and returns no data",async()=>{
  vi.useFakeTimers();vi.setSystemTime(time);for(const [name,value] of Object.entries(env()))vi.stubEnv(name,value);
  const headers={authorization:"Bearer "+token(),"x-erp-notification-nonce":nonce};
  for(const [name,value] of [["cookie","x=y"],["origin","https://erp.algt.net"],["content-length","3"],["transfer-encoding","chunked"]]){
   const response=await POST(new Request("https://erp.algt.net/api/internal/communications/notification-tick",{method:"POST",headers:{...headers,[name]:value}}));
   expect(response.status).toBe(400);expect(await response.text()).toBe("");}
  const response=await POST(new Request("https://erp.algt.net/api/internal/communications/notification-tick",{method:"POST",headers,body:'{"extra":true}'}));
  expect(response.status).toBe(400);
  const empty=await POST(new Request("https://erp.algt.net/api/internal/communications/notification-tick",{method:"POST",headers}));
  expect(empty.status).toBe(400);expect(io.admin).not.toHaveBeenCalled();
 });
 it("retires the legacy shared-secret communication route without reading auth or SQL",async()=>{
  const response=await legacy(new Request("https://erp.algt.net/api/internal/process-communication-push",{method:"POST"}));
  expect(response.status).toBe(410);expect(await response.text()).toBe("");expect(io.admin).not.toHaveBeenCalled();
 });
});
