import "server-only";
import { createSign } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { reserveCommunicationBudget } from "./budget";
import { communicationFeatureEnabled } from "./providers/config";

type Env = Readonly<Record<string,string|undefined>>;
const oauthEndpoint="https://oauth2.googleapis.com/token";
const scope="https://www.googleapis.com/auth/firebase.messaging";
function sender(env:Env) {
  const project=env.ERP_FCM_PROJECT_ID, email=env.ERP_FCM_CLIENT_EMAIL, key=env.ERP_FCM_PRIVATE_KEY?.replace(/\\n/g,"\n");
  if ((!communicationFeatureEnabled("push",env) && env.ERP_COMM_CONTROL_PUSH_ENABLED!=="true") || !project || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) ||
      !email || !/^[a-zA-Z0-9._-]+@[a-z0-9.-]+\.gserviceaccount\.com$/.test(email) ||
      !key?.startsWith("-----BEGIN PRIVATE KEY-----") || !key.trimEnd().endsWith("-----END PRIVATE KEY-----")) return null;
  return {project,email,key};
}
export function pushConfigured(env:Env=process.env) {return communicationFeatureEnabled("push",env) && sender(env)!==null;}
const claim=z.strictObject({jobId:z.uuid(),lease:z.uuid(),profileId:z.string().regex(/^[1-9][0-9]*$/),sessionId:z.uuid(),control:z.boolean()});
const delivery=z.strictObject({token:z.string().min(32).max(4096),eventId:z.uuid(),accountId:z.uuid(),category:z.enum(["direct","groups","mentions","erp","intake","leaveStart","timesheet","budget","ptt","sos","moderation"]),label:z.string().max(120).optional(),sound:z.boolean(),vibrate:z.boolean()});
type Delivery=z.infer<typeof delivery>;
type Outcome="accepted"|"retry"|"held"|"failed"|"suppressed"|"invalidToken";
export function fcmMessage(input:Delivery) {
  const d=delivery.parse(input);
  const data:Record<string,string>={eventId:d.eventId,accountId:d.accountId,category:["direct","groups","mentions","sos","ptt"].includes(d.category)?d.category:d.category==="budget"?"control":"erp",sound:String(d.sound),vibrate:String(d.vibrate)};
  if (["direct","groups","mentions"].includes(d.category) && d.label) data.label=d.label;
  return {message:{token:d.token,data,android:{priority:"HIGH",ttl:"300s",restricted_package_name:"net.algt.mobiledms"}}};
}
const base64=(value:object)=>Buffer.from(JSON.stringify(value)).toString("base64url");
async function accessToken(config:NonNullable<ReturnType<typeof sender>>,fetcher:typeof fetch) {
  const now=Math.floor(Date.now()/1000);
  const content=base64({alg:"RS256",typ:"JWT"})+"."+base64({iss:config.email,scope,aud:oauthEndpoint,iat:now,exp:now+300});
  const assertion=content+"."+createSign("RSA-SHA256").update(content).sign(config.key,"base64url");
  const response=await fetcher(oauthEndpoint,{method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000),
    body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
  if (!response.ok) throw Error("Sender authorization unavailable");
  return z.object({access_token:z.string().min(10),token_type:z.string().regex(/^Bearer$/i)}).parse(await response.json()).access_token;
}
export async function classifyFcm(response:Response):Promise<Outcome> {
  if (response.ok) {
    const result=z.object({name:z.string().regex(/^projects\/[^/]+\/messages\/[^/]+$/)}).safeParse(await response.json().catch(()=>null));
    return result.success ? "accepted" : "retry";
  }
  if (response.status===429 || response.status>=500) return "retry";
  const body=await response.json().catch(()=>null);
  if (Array.isArray(body?.error?.details) && body.error.details.some((d:Record<string,unknown>)=>
    d?.["@type"]==="type.googleapis.com/google.firebase.fcm.v1.FcmError" && d.errorCode==="UNREGISTERED")) return "invalidToken";
  return [401,403,404].includes(response.status) ? "held" : "failed";
}
async function workerRpc(op:string,args:Record<string,unknown>) {
  const {error,data}=await createAdminClient().rpc("erp_notification_worker",{p_op:op,p_args:args});
  if (error) throw Error("Dispatch persistence unavailable");
  return data;
}
type WorkerDeps={env?:Env;rpc?:typeof workerRpc;reserve?:typeof reserveCommunicationBudget;fetcher?:typeof fetch};
export async function dispatchOnePush(deps:WorkerDeps={}) {
  const config=sender(deps.env??process.env);
  if (!config) return {state:"held"};
  const rpc=deps.rpc??workerRpc,fetcher=deps.fetcher??fetch;
  const env=deps.env??process.env;
  const ordinary=communicationFeatureEnabled("push",env),control=env.ERP_COMM_CONTROL_PUSH_ENABLED==="true";
  const next=await rpc("claim",{ordinary,control});
  if (!next) return {state:"idle"};
  const job=claim.parse(next);
  const args={jobId:job.jobId,lease:job.lease};
  let outcome:Outcome="held";
  try {
    const binding={actorSessionId:job.sessionId,command:{op:"notifications.deliver",args}};
    const permit=job.control?null:await (deps.reserve??reserveCommunicationBudget)({feature:"push",scope:"communications",actorId:job.profileId,
      operationId:job.lease,binding,upperBoundMicros:BigInt(0),liabilityEndsAt:new Date(Date.now()+120000)});
    if ((job.control && control) || (ordinary && permit?.ok)) {
      const dispatchArgs=permit?.ok?{...args,permitId:permit.permitId}:args;
      const prepared=await rpc("prepare",dispatchArgs);
      if (!prepared) outcome="suppressed";
      else {
        delivery.parse(prepared);
        const token=await accessToken(config,fetcher);
        const confirmed=await rpc("confirm",dispatchArgs);
        if (!confirmed) outcome="suppressed";
        else {
          const payload=fcmMessage(delivery.parse(confirmed));
          outcome="retry";
          const response=await fetcher("https://fcm.googleapis.com/v1/projects/"+config.project+"/messages:send",{
            method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(7000),
            headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(payload)});
          outcome=await classifyFcm(response);
        }
      }
    }
  } finally {
    // A crashed process keeps a bounded lease. The phone suppresses repeated provider
    // deliveries by account+event after an ambiguous POST or lost settlement.
    if (await rpc("finish",{...args,outcome})!==true) throw Error("Delivery receipt unavailable");
  }
  return {state:outcome};
}
