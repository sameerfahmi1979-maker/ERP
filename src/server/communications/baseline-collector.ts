import "server-only";
import {createHash,createPublicKey,verify} from "node:crypto";
import {z} from "zod";
import {createAdminClient} from "@/lib/supabase/admin";
import {getAdminConfig} from "@/lib/config/server-features";

const project="mmiefuieduzdiiwnqpie", baseUrl="https://"+project+".supabase.co";
const metricsUrl=baseUrl+"/customer/v1/privileged/metrics", maxBytes=2097152;
const pilotEnd=Date.parse("2026-11-30T19:59:00Z");
const schema=z.strictObject({v:z.literal(1),purpose:z.literal("erp-communication-baseline-tick"),intent:z.literal("measure-baseline"),
  planId:z.uuid(),deploymentId:z.uuid(),poolId:z.uuid(),allocationId:z.uuid(),startsAt:z.iso.datetime(),until:z.iso.datetime(),
  maxTicks:z.number().int().min(1).max(120),maxPhysicalStarts:z.number().int().min(1).max(16),
  maxStorageObjects:z.number().int().min(1).max(100000),maxRelations:z.number().int().min(1).max(8192),
  planHash:z.string().regex(/^[0-9a-f]{64}$/),nonce:z.uuid(),ordinal:z.number().int().min(1).max(120),scheduledAt:z.iso.datetime()});
export type BaselineCollectorGrant=z.infer<typeof schema>;
export type BaselineDiskMetrics={sizeBytes:string;availableBytes:string;usedBytes:string;responseSha256:string};
type Env=Readonly<Record<string,string|undefined>>;
function exactInteger(raw:string):bigint|null {
  const m=/^([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]{1,3}))?$/.exec(raw);if(!m || raw.length>64)return null;
  let digits=(m[1]+(m[2]??"")).replace(/^0+/,"")||"0";
  const shift=Number(m[3]??0)-(m[2]?.length??0);
  if(shift<0){if(-shift>digits.length || !digits.endsWith("0".repeat(-shift)))return digits==="0"?BigInt(0):null;digits=digits.slice(0,shift)||"0";}
  else {if(digits!=="0" && digits.length+shift>16)return null;digits+="0".repeat(Math.min(shift,16));}
  const value=BigInt(digits);return value<=BigInt(Number.MAX_SAFE_INTEGER)?value:null;
}
function canonical(segment:string) {if(!/^[A-Za-z0-9_-]+$/.test(segment))throw Error();const b=Buffer.from(segment,"base64url");if(b.toString("base64url")!==segment)throw Error();return b;}
export function readBaselineCollectorGrant(token:string,nonce:string,env:Env=process.env,now=Date.now()):BaselineCollectorGrant|null {
  try {
    if(env.ERP_COMM_BASELINE_COLLECTOR_ENABLED!=="true" || !token || token.length>4096)return null;
    const parts=token.split(".");if(parts.length!==2)return null;
    const body=canonical(parts[0]),signature=canonical(parts[1]),raw=env.ERP_COMM_WORKER_BOOT_PUBLIC_KEY;
    if(!raw || raw.length>256 || Buffer.from(raw,"base64").toString("base64")!==raw)return null;
    const key=createPublicKey({key:Buffer.from(raw,"base64"),format:"der",type:"spki"});
    if(key.asymmetricKeyType!=="ed25519" || signature.length!==64 || !verify(null,body,key,signature))return null;
    const grant=schema.parse(JSON.parse(new TextDecoder("utf8",{fatal:true}).decode(body)));
    const start=Date.parse(grant.startsAt),until=Date.parse(grant.until),scheduled=start+(grant.ordinal-1)*60000;
    if(grant.planId!==env.ERP_COMM_BASELINE_COLLECTOR_PLAN_ID || grant.deploymentId!==env.RAILWAY_DEPLOYMENT_ID ||
      grant.until!==env.ERP_COMM_BASELINE_COLLECTOR_UNTIL || until>pilotEnd || until>start+7200000 || now+15000>=until ||
      start>now || Math.ceil((until-start)/60000)!==grant.maxTicks || grant.ordinal>grant.maxTicks ||
      grant.nonce!==nonce || grant.scheduledAt!==new Date(scheduled).toISOString() || now<scheduled)return null;
    return grant;
  }catch{return null;}
}
export function parseBaselineDiskMetrics(body:string):BaselineDiskMetrics|null {
  if(Buffer.byteLength(body,"utf8")>maxBytes)return null;
  const selected=new Map<string,{value:bigint;device:string;fstype:string}>();
  for(const line of body.split(/\r?\n/)) {
    if(!line.startsWith("node_filesystem_size_bytes{") && !line.startsWith("node_filesystem_avail_bytes{"))continue;
    if(line.length>16384)return null;
    const match=/^(node_filesystem_(?:size|avail)_bytes)\{([^{}]*)\} ((?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)$/.exec(line);
    if(!match)return null;
    const labels:Record<string,string>=Object.create(null), expression=/([A-Za-z_][A-Za-z0-9_]*)="((?:[^"\\]|\\["\\n])*)"(?:,|$)/gy;
    let offset=0;
    while(offset<match[2].length) {
      expression.lastIndex=offset;const label=expression.exec(match[2]);
      if(!label || Object.hasOwn(labels,label[1]))return null;
      try{labels[label[1]]=JSON.parse('"'+label[2]+'"');}catch{return null;}
      offset=expression.lastIndex;
    }
    if(labels.supabase_project_ref!==project || labels.supabase_identifier!==project || labels.service_type!=="db" || labels.mountpoint!=="/data")continue;
    if(labels.device_error!=="" || !labels.device || !labels.fstype || selected.has(match[1]))return null;
    const value=exactInteger(match[3]);if(value===null)return null;
    selected.set(match[1],{value,device:labels.device,fstype:labels.fstype});
  }
  const size=selected.get("node_filesystem_size_bytes"),available=selected.get("node_filesystem_avail_bytes");
  if(!size || !available || size.value===BigInt(0) || available.value>size.value || size.device!==available.device || size.fstype!==available.fstype)return null;
  return {sizeBytes:String(size.value),availableBytes:String(available.value),usedBytes:String(size.value-available.value),responseSha256:createHash("sha256").update(body,"utf8").digest("hex")};
}

/** Bounded streamed read. Neither a redirect nor an arbitrary configured project is accepted. */
export async function fetchBaselineDiskMetrics(fetcher:typeof fetch=fetch):Promise<BaselineDiskMetrics> {
  try {
    const config=getAdminConfig();if(config.url!==baseUrl || !config.serviceKey || config.serviceKey.length>8192)throw Error();
    const signal=AbortSignal.timeout(8000);
    const response=await fetcher(metricsUrl,{method:"GET",redirect:"error",cache:"no-store",signal,
      headers:{Authorization:"Basic "+Buffer.from("service_role:"+config.serviceKey).toString("base64"),Accept:"text/plain"}});
    const length=response.headers.get("content-length");
    if(response.status!==200 || (length!==null && (!/^(0|[1-9][0-9]{0,7})$/.test(length) || Number(length)>maxBytes)) || !response.body){void response.body?.cancel().catch(()=>{});throw Error();}
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
    let onAbort:()=>void=()=>{};
    const aborted=new Promise<never>((_,reject)=>{onAbort=()=>reject(Error());signal.addEventListener("abort",onAbort,{once:true});});
    try {
      for(;;) {if(signal.aborted)throw Error();const chunk=await Promise.race([reader.read(),aborted]);if(chunk.done)break;
        bytes+=chunk.value.length;if(bytes>maxBytes)throw Error();chunks.push(chunk.value);}
    }finally{signal.removeEventListener("abort",onAbort);void reader.cancel().catch(()=>{});}
    const buffer=Buffer.concat(chunks,bytes), parsed=parseBaselineDiskMetrics(new TextDecoder("utf8",{fatal:true}).decode(buffer));
    if(!parsed)throw Error();return parsed;
  }catch{throw Error("Baseline metrics unavailable");}
}
async function claim(grant:BaselineCollectorGrant,nonce:string,tokenHash:string) {
  if(getAdminConfig().url!==baseUrl)return false;
  const {data,error}=await createAdminClient().rpc("erp_comm_baseline_collector_claim",{p_plan:grant.planId,p_nonce:nonce,
    p_deployment:grant.deploymentId,p_pool:grant.poolId,p_allocation:grant.allocationId,p_until:grant.until,p_token_sha256:tokenHash}).abortSignal(AbortSignal.timeout(5000));
  return !error && data===true;
}
async function record(grant:BaselineCollectorGrant,nonce:string,metrics:BaselineDiskMetrics) {
  if(getAdminConfig().url!==baseUrl)return false;
  const {data,error}=await createAdminClient().rpc("erp_comm_baseline_collector_record",{p_plan:grant.planId,p_nonce:nonce,
    p_size:metrics.sizeBytes,p_available:metrics.availableBytes,p_digest:metrics.responseSha256}).abortSignal(AbortSignal.timeout(5000));
  return !error && data===true;
}
const globalState=globalThis as typeof globalThis & {__erpBaselineCollectorNonces?:Set<string>};
const seen=globalState.__erpBaselineCollectorNonces??=new Set<string>();
type Dependencies={claim?:typeof claim;record?:typeof record;fetchMetrics?:typeof fetchBaselineDiskMetrics;now?:()=>number;seen?:Set<string>};
/** One offline-authorized probe per explicit nonce per approved physical process start. SQL owns cross-process one-use. */
export async function runBaselineCollector(token:string,nonce:string,env:Env=process.env,deps:Dependencies={}):Promise<"invalid"|"held"|"updated"> {
  const now=deps.now??Date.now, grant=readBaselineCollectorGrant(token,nonce,env,now());if(!grant)return "invalid";
  const used=deps.seen??seen,key=grant.planId+"/"+nonce;if(used.has(key))return "held";used.add(key);
  try {
    if(!await (deps.claim??claim)(grant,nonce,createHash("sha256").update(token,"utf8").digest("hex")))return "held";
    if(now()+13000>=Date.parse(grant.until))return "held";
    const measured=await (deps.fetchMetrics??fetchBaselineDiskMetrics)();
    if(now()+5000>=Date.parse(grant.until))return "held";
    return await (deps.record??record)(grant,nonce,measured)?"updated":"held";
  }catch{return "held";}
}
