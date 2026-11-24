import "server-only";
import {createHash,createPublicKey,verify} from "node:crypto";
import {z} from "zod";
import {createAdminClient} from "@/lib/supabase/admin";
import {launchCommunicationWorkerSupervisors} from "./worker-supervisor";
const pilotEnd=Date.parse("2026-11-30T19:59:00Z");
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==="object"&&!Array.isArray(item)
 ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const ids=z.array(z.uuid()).min(2).max(16).refine(v=>new Set(v).size===v.length);
/** Hash public configuration, never a token or future capability. Shared canonical shape with the offline issuer. */
export function supervisorEnvironmentHash(env:Readonly<Record<string,string|undefined>>=process.env,now=Date.now()):string|null {
 try{
  if(env.ERP_COMM_WORKER_SUPERVISOR_ENABLED!=="true")return null;
  const deploymentId=z.uuid().parse(env.RAILWAY_DEPLOYMENT_ID),until=z.iso.datetime().parse(env.ERP_COMM_WORKER_SUPERVISOR_UNTIL);
  if(Date.parse(until)<=now+90000 || Date.parse(until)>pilotEnd || Date.parse(until)>now+86400000)return null;
  const workers=[];
  for(const kind of ["chat_stage","ptt"] as const){const prefix=kind==="chat_stage"?"ERP_COMM_CHAT_STAGE":"ERP_COMM_PTT";
   if(env[prefix+"_CLEANUP_ENABLED"]!=="true")continue;
   const worker=z.uuid().parse(env[kind==="chat_stage"?prefix+"_CLEANUP_WORKER_ID":prefix+"_WORKER_ID"]),boots=ids.parse(JSON.parse(env[prefix+"_BOOT_IDS"]??""));
   const retry=env[prefix+"_LOOKUP_RETRIES"]??"",wait=env[prefix+"_RECOVERY_WAIT_SECONDS"]??"";
   if(!/^[0-3]$/.test(retry)||!/^[1-9][0-9]{0,4}$/.test(wait)||Number(wait)>14400||(kind==="chat_stage"&&boots.length<4))return null;
   workers.push({kind,worker,boots,retries:Number(retry),quarantineSeconds:Number(wait)});
  }
  if(!workers.length||new Set(workers.flatMap(w=>w.boots)).size!==workers.flatMap(w=>w.boots).length||new Set(workers.map(w=>w.boots.length)).size!==1)return null;
  return digest(canonical({deploymentId,until,workers}));
 }catch{return null;}
}
const schema=z.strictObject({v:z.literal(1),purpose:z.literal("erp-communication-supervisor-wake"),planId:z.uuid(),deploymentId:z.uuid(),nonce:z.uuid(),
 scheduledAt:z.iso.datetime(),expiresAt:z.iso.datetime(),cutoff:z.iso.datetime(),configHash:z.string().regex(/^[a-f0-9]{64}$/),
 manifestHash:z.string().regex(/^[a-f0-9]{64}$/),maxClaimsPerProcess:z.number().int().min(1).max(3),maxPhysicalStarts:z.number().int().min(2).max(16)});
export type SupervisorWake=z.infer<typeof schema>;
function decode(value:string){if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error("Invalid wake");const b=Buffer.from(value,"base64url");if(b.toString("base64url")!==value)throw Error("Invalid wake");return b;}
export function readSignedSupervisorWake(token:string,env:Readonly<Record<string,string|undefined>>=process.env,now=Date.now()):SupervisorWake|null {
 try{
  const configHash=supervisorEnvironmentHash(env,now),raw=env.ERP_COMM_WORKER_BOOT_PUBLIC_KEY;
  if(!configHash||!raw||raw.length>256||Buffer.from(raw,"base64").toString("base64")!==raw||!token||token.length>4096)return null;
  const parts=token.split(".");if(parts.length!==2)return null;const body=decode(parts[0]),sig=decode(parts[1]);
  const key=createPublicKey({key:Buffer.from(raw,"base64"),format:"der",type:"spki"});
  if(key.asymmetricKeyType!=="ed25519"||sig.length!==64||!verify(null,body,key,sig))return null;
  const wake=schema.parse(JSON.parse(new TextDecoder("utf8",{fatal:true}).decode(body)));
  const at=Date.parse(wake.scheduledAt),expires=Date.parse(wake.expiresAt);
  if(wake.configHash!==configHash||wake.deploymentId!==env.RAILWAY_DEPLOYMENT_ID||wake.cutoff!==env.ERP_COMM_WORKER_SUPERVISOR_UNTIL||
    at>now+1000||expires<=now||expires<=at||expires-at>35000||expires>Date.parse(wake.cutoff))return null;
  const anyBoots=JSON.parse(env.ERP_COMM_CHAT_STAGE_CLEANUP_ENABLED==="true"?env.ERP_COMM_CHAT_STAGE_BOOT_IDS!:env.ERP_COMM_PTT_BOOT_IDS!);
  return anyBoots.length===wake.maxPhysicalStarts?wake:null;
 }catch{return null;}
}
async function fetchManifest(wake:SupervisorWake):Promise<string|null>{
 const {data,error}=await createAdminClient().rpc("erp_comm_supervisor_manifest",{p_plan:wake.planId,p_nonce:wake.nonce,p_deployment:wake.deploymentId,
  p_manifest_sha256:wake.manifestHash,p_config_hash:wake.configHash}).abortSignal(AbortSignal.timeout(4000));
 if(error||(data!==null&&typeof data!=="string"))throw Error("Supervisor claim unconfirmed");return data as string|null;
}
type WakeState={attempts:number;seen:Set<string>;starting:boolean;started:boolean};
const shared=globalThis as typeof globalThis&{__erpSupervisorWakeClaims?:Map<string,WakeState>};
const states=shared.__erpSupervisorWakeClaims??=new Map<string,WakeState>();
/** Public-safe current command: never returns private bytes; every possible fetch is separately prepaid. */
export async function acceptSupervisorWake(token:string,env:Readonly<Record<string,string|undefined>>=process.env,
 deps:{fetch?:typeof fetchManifest;launch?:typeof launchCommunicationWorkerSupervisors;states?:Map<string,WakeState>}={}):Promise<{status:number}>{
 const wake=readSignedSupervisorWake(token,env);if(!wake)return{status:403};
 const registry=deps.states??states,key=wake.deploymentId+"/"+wake.planId;
 const state=registry.get(key)??{attempts:0,seen:new Set<string>(),starting:false,started:false};registry.set(key,state);
 if(state.started||state.starting||state.seen.has(wake.nonce))return{status:204};
 if(state.attempts>=wake.maxClaimsPerProcess)return{status:409};
 state.attempts++;state.seen.add(wake.nonce);state.starting=true;
 try{
  const manifest=await(deps.fetch??fetchManifest)(wake);
  if(!manifest||digest(manifest)!==wake.manifestHash)return{status:503};
  const result=(deps.launch??launchCommunicationWorkerSupervisors)(manifest,env);
  if(!result.valid)return{status:403};state.started=true;return{status:204};
 }catch{return{status:503};}finally{state.starting=false;}
}
